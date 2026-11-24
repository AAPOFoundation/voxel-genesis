// Check transport parity, safety, playback and cooperating writers.
import { spawn, spawnSync } from 'node:child_process';
import { request } from 'node:http';
/** Run transport assertions and return spawned children for final cleanup. */
export async function runDoorTests(context) {
  const { E, run, check, eq, buildResult, session, fixtures, home, TOOLS, hash } =
  context;
  let createPlayer;
  let startHttp;
  const children = new Set();
  function child(mode, h = home(), extra = []) {
    const p = spawn(
      process.execPath,
      ['bin/voxel-genesis.mjs', mode,...extra],
      {
        env: { ...process.env, VOXEL_GENESIS_HOME: h, VOXEL_GENESIS_PORT: '0' },
        stdio: ['pipe', 'pipe', 'pipe']
      }
    );
    children.add(p);
    p.on('exit', () => children.delete(p));
    p.stderr.on('data', () => {});
    return p;
  }
  function lines(p) {
    let text = '';
    let queue = [];
    let waiters = [];
    p.stdout.on(
      'data',
      chunk => {
        text += chunk;
        let i;
        while ((i = text.indexOf('\n')) >= 0) {
          const line = text.slice(0, i);
          text = text.slice(i + 1);
          if (waiters.length) {
            waiters.shift()(line);
          } else {
            queue.push(line);
          }
        }
      }
    );
    return () => new Promise(
      (resolve, reject) => {
        const t = setTimeout(() => reject(new Error('Process reply timeout')), 10000);
        const done = s => {
          clearTimeout(t);
          resolve(JSON.parse(s));
        };
        if (queue.length) {
          done(queue.shift());
        } else {
          waiters.push(done);
        }
      }
    );
  }
  const rpc = (p, id, method, params) => p.stdin.write(
    JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'
  );
  await run(
    'mcp-handshake',
    async () => {
      const p = child('mcp');
      const next = lines(p);
      rpc(p, 1, 'tools/list');
      check('mcp-handshake', (await next()).error?.code === - 32002, 'before handshake');
      rpc(p, 2, 'initialize', { protocolVersion: '2026-test' });
      const init = await next();
      check(
        'mcp-handshake',
        init.result.protocolVersion === '2025-06-18' && !!init.result.capabilities.tools &&
        !!init.result.serverInfo,
        'handshake'
      );
      p.stdin.write('{"jsonrpc":"2.0","method":"notifications/initialized"}\n');
      rpc(p, 3, 'ping');
      check(
        'mcp-handshake',
        eq(await next(), { jsonrpc: '2.0', id: 3, result: {} }),
        'notification and ping'
      );
      rpc(p, 4, 'missing');
      check('mcp-handshake', (await next()).error?.code === - 32601, 'unknown method');
      p.stdin.write('{bad\n');
      check('mcp-handshake', (await next()).error?.code === - 32700, 'bad JSON');
      rpc(p, 5, 'tools/call', { name: 'missing' });
      check('mcp-handshake', (await next()).error?.code === - 32602, 'unknown tool');
      p.stdin.write('a'.repeat(2 * 1024 * 1024) + '\n');
      check('mcp-handshake', (await next()).error?.code === - 32600, 'oversize');
      rpc(p, 6, 'tools/list');
      check('mcp-handshake', eq((await next()).result.tools, TOOLS), 'still serving');
      p.stdin.end();
    }
  );
  const http = (
    server,
    path,
    body,
    headers = {},
    method = body === undefined ? 'GET': 'POST'
  ) => new Promise(
    (resolve, reject) => {
      const data = body === undefined ? '': typeof body === 'string' ?
      body: JSON.stringify(body);
      const req = request(
        {
          host: '127.0.0.1',
          port: server.address().port,
          path,
          method,
          headers: {
            ...(
              body === undefined ? {}: {
                'content-type': 'application/json',
                'content-length': Buffer.byteLength(data)
              }
            ),
            ...headers
          }
        },
        res => {
          let raw = '';
          res.on('data', c => raw += c);
          res.on(
            'end',
            () => {
              let value;
              try {
                value = JSON.parse(raw);
              } catch {
                value = raw;
              }
              resolve({ status: res.statusCode, value });
            }
          );
        }
      );
      req.on('error', reject);
      req.end(data);
    }
  );
  const serverFor = async (s) => {
    ({ startHttp } = await import('../src/http.mjs'));
    return startHttp({ port: 0, session: s });
  };
  await run(
    'door-parity',
    async () => {
      const f = fixtures['small-town'];
      if (!f) {
        throw new Error('small-town fixture required');
      }
      const calls = [
        ['world_open', f.open],
        ...f.batches.map(ops => ['world_build', { ops }]),
        ...['top', 'height', 'side', 'info'].map(view => ['world_look', { view }]),
        ['world_undo', {}]
      ];
      const baseline = session();
      const hs = session();
      const server = await serverFor(hs);
      hs.viewer = null;
      const mp = child('mcp');
      const mn = lines(mp);
      const rp = child('repl');
      const rn = lines(rp);
      const ch = home();
      // Viewer addresses belong to each process, so parity normalises those addresses.
      const normal = v => typeof v === 'string' ? v.replace(/run serve/g, 'null').replace(
        /http:\/\/127\.0\.0\.1:\d+\//g,
        'null'
      ): v && Object.hasOwn(v, 'viewer') ? { ...v, viewer: null }:
      v;
      try {
        rpc(mp, 1, 'initialize', { protocolVersion: 'test' });
        await mn();
        let id = 2;
        for (const [tool, args] of calls) {
          const expected = normal(baseline.call(tool, args));
          const h = await http(server, '/tool', { tool, arguments: args });
          check(
            'door-parity',
            h.status === 200 && eq(normal(h.value.result), expected),
            'HTTP ' + tool
          );
          rpc(mp, id++, 'tools/call', { name: tool, arguments: args });
          const m = await mn();
          const mt = m.result.content[0].text;
          let mv;
          try {
            mv = JSON.parse(mt);
          } catch {
            mv = mt;
          }
          check(
            'door-parity',
            !m.result.isError && eq(normal(mv), expected),
            'MCP ' + tool
          );
          rp.stdin.write(tool + ' ' + JSON.stringify(args) + '\n');
          check('door-parity', eq(normal(await rn()), expected), 'REPL ' + tool);
          const c = spawnSync(
            process.execPath,
            ['bin/voxel-genesis.mjs', 'call', tool, JSON.stringify(args)],
            { encoding: 'utf8', env: { ...process.env, VOXEL_GENESIS_HOME: ch } }
          );
          check(
            'door-parity',
            c.status === 0 && eq(normal(JSON.parse(c.stdout)), expected),
            'call ' + tool
          );
        }
      } finally {
        mp.stdin.end();
        rp.stdin.end();
        await new Promise(r => server.close(r));
      }
    }
  );
  await run(
    'http-safety',
    async () => {
      const s = session();
      s.call('world_open', {});
      const server = await serverFor(s);
      try {
        check('http-safety', server.address().address === '127.0.0.1', 'bind');
        check(
          'http-safety',
          (await http(server, '/tool', {}, { origin: 'http://127.0.0.1' })).status === 403,
          'origin'
        );
        check(
          'http-safety',
          (await http(server, '/tool', {}, { host: 'wrong' })).status === 403,
          'host'
        );
        check(
          'http-safety',
          (await http(server, '/../package.json')).status === 404,
          'route'
        );
        check(
          'http-safety',
          (await http(server, '/tool', 'a'.repeat(300 * 1024))).status === 413,
          'large body'
        );
        check(
          'http-safety',
          (await http(server, '/tool', '{}', { 'content-type': 'text/plain' })).status === 415,
          'content type'
        );
        check(
          'http-safety',
          (await http(server, '/api/state')).value.hash === s.state().hash,
          'state'
        );
      } finally {
        await new Promise(r => server.close(r));
      }
    }
  );
  await run(
    'viewer-sync',
    async () => {
      ({ createPlayer } = await import('../viewer/player.mjs'));
      const f = fixtures['small-town'];
      if (!f) {
        throw new Error('small-town fixture required');
      }
      for (const reduced of [false, true]) {
        const s = session();
        s.call('world_open', f.open);
        const player = createPlayer(E, { reduced });
        player.load(s.state());
        const random = E.rng(19);
        for (const ops of f.batches) {
          const r = buildResult(s.call('world_build', { ops }));
          player.enqueue({ rev: r.rev, line: { ops }, hash: r.hash });
          if (!reduced) {
            for (let i = 0; i < 50000 && player.busy; i++) {
              player.step(.002 + random() *.043);
            }
          }
          check(
            'viewer-sync',
            !player.busy && !player.needsState && player.hash === r.hash,
            'line ' + r.rev + ' reduced ' + reduced
          );
          if (reduced) {
            const before = JSON.stringify(player.world.agents);
            player.step(3);
            check(
              'viewer-sync',
              JSON.stringify(player.world.agents) === before &&
              !player.world.bodies.length,
              'still'
            );
          }
        }
        player.enqueue(
          {
            rev: s.state().rev + 2,
            line: { ops: [['pet', 'sun', 0, 0]] },
            hash: '00000000'
          }
        );
        check('viewer-sync', player.needsState, 'gap resync');
        player.load(s.state());
        player.enqueue({ rev: s.state().rev + 1, line: { undo: 1 }, hash: '00000000' });
        check('viewer-sync', player.needsState, 'undo resync');
      }
    }
  );
  await run(
    'two-writers',
    async () => {
      const h = home();
      const s = session(h);
      s.call('world_open', { name: 'shared' });
      const serverProcess = child('serve', h, ['0']);
      const next = lines(serverProcess);
      const link = await next();
      const port = Number(new URL(link.viewer).port);
      const events = [];
      const req = request(
        { host: '127.0.0.1', port, path: '/api/events' },
        res => {
          let raw = '';
          res.on(
            'data',
            c => {
              raw += c;
              let i;
              while ((i = raw.indexOf('\n\n')) >= 0) {
                const part = raw.slice(0, i);
                raw = raw.slice(i + 2);
                if (part.startsWith('data: ')) {
                  events.push(JSON.parse(part.slice(6)));
                }
              }
            }
          );
        }
      );
      req.end();
      const a = child('repl', h);
      const b = child('repl', h);
      const an = lines(a);
      const bn = lines(b);
      try {
        for (let i = 0; i < 4; i++) {
          const p = i % 2 ? b: a;
          const n = i % 2 ? bn: an;
          const op = ['drop', 'brick', 2 + i, 2, 1];
          p.stdin.write('world_build ' + JSON.stringify({ ops: [op] }) + '\n');
          const value = buildResult(await n());
          s.catchUp();
          check(
            'two-writers',
            s.state().hash === value.hash && s.state().rev === i +
            1,
            'turn ' + i
          );
        }
        const until = Date.now() + 5000;
        while (events.length < 4 && Date.now() < until) {
          await new Promise(r => setTimeout(r, 50));
        }
        check(
          'two-writers',
          eq(events.map(e => e.rev), [1, 2, 3, 4]),
          'SSE revisions ' + events.map(e => e.rev)
        );
      } finally {
        req.destroy();
        a.stdin.end();
        b.stdin.end();
        serverProcess.kill();
      }
    }
  );
  return children;
}
