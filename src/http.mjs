// Own loopback HTTP routes, bounded JSON input and viewer event streams.
import { failure } from './errors.mjs';
import { createServer } from 'node:http';
import { lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { publicError } from './errors.mjs';
import { join, resolve, sep } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { C, TOOL_COPY as TOOLS } from './copy.mjs';
import { KIT_COPY } from './kit-copy.mjs';
import { acceptInput } from './input.mjs';
const root = new URL('../', import.meta.url);
const routes = new Map(
  [
    ['/', 'viewer/index.html'],
    ['/viewer.mjs', 'viewer/viewer.mjs'],
    ['/player.mjs', 'viewer/player.mjs'],
    ['/kit-panel.mjs', 'viewer/kit-panel.mjs'],
    ['/music.mjs', 'viewer/music.mjs'],
    ['/life.mjs', 'viewer/life.mjs'],
    ['/gl-renderer.mjs', 'viewer/gl-renderer.mjs'],
    ['/camera.mjs', 'viewer/camera.mjs'],
    ['/pick.mjs', 'viewer/pick.mjs'],
    ['/geometry.mjs', 'viewer/geometry.mjs'],
    ['/canvas-renderer.mjs', 'viewer/canvas-renderer.mjs'],
    ['/tap.mjs', 'viewer/tap.mjs'],
    ['/errors.mjs', 'src/errors.mjs'],
    ['/budget.mjs', 'src/budget.mjs'],
    ['/copy.mjs', 'src/copy.mjs'],
    ['/kit-copy.mjs', 'src/kit-copy.mjs'],
    ...['kinds', 'canon', 'expr', 'parts', 'view', 'effects', 'play', 'advise', 'story',
      'inputs'].map(
      n => ['/kit/' + n + '.mjs', 'src/kit/' + n + '.mjs']
    ),
    ['/games/town.mjs', 'src/games/town.mjs'],
    ['/games/town-advice.mjs', 'src/games/town-advice.mjs'],
    ['/engine.js', 'vendor/voxel-engine.js'],
    ...['index', 'palette', 'palette-v1', 'prefabs', 'prefabs-v1', 'prefabs-v2',
      'bridge', 'ops', 'edit-ops', 'op-helpers', 'codec', 'look', 'rules', 'feed', 'movers',
      'grow'].map(
      n => ['/core/' + n + '.mjs', 'src/core/' + n + '.mjs']
    )
  ]
);
const body = (req, cap = 256 * 1024, error = C.error.body, early = false) => new Promise(
  (resolve, reject) => {
    let size = 0;
    let text = early ? [] : '';
    let large = false;
    if (!early) req.setEncoding('utf8');
    req.on(
      'data',
      chunk => {
        if (large) return;
        size += Buffer.byteLength(chunk);
        if (size > cap) {
          large = true;
          text = early ? [] : '';
          if (early) reject({ status: 413, message: error });
        } else if (early) {
          text.push(chunk);
        } else {
          text += chunk;
        }
      }
    );
    req.on(
      'end',
      () => {
        if (large) {
          reject({ status: 413, message: error });
        } else {
          try {
            resolve(JSON.parse(early ? Buffer.concat(text).toString('utf8') : text));
          } catch {
            reject({ status: 400, message: C.error.json });
          }
        }
      }
    );
    req.on('error', () => reject({ status: 400, message: C.error.request }));
  }
);
const SHOT_CAP = 2 * 1024 * 1024;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const isPng = buf => buf.length >= 8 && buf.subarray(0, 8).equals(PNG_MAGIC);
// Read a shot without keeping bytes once it is over the cap.
const shotBody = req => new Promise((done, reject) => {
  const chunks = [];
  let size = 0;
  let over = false;
  req.on('data', chunk => {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buf.length;
    if (size > SHOT_CAP) {
      over = true;
      chunks.length = 0;
    } else if (!over) {
      chunks.push(buf);
    }
  });
  req.on('end', () => {
    if (over) {
      const error = failure('shotSize');
      error.status = 413;
      reject(error);
      return;
    }
    done(Buffer.concat(chunks));
  });
  req.on('error', () => reject(failure('request')));
});
// Name the file from the open world, never from the request path or body.
function shotFile(session) {
  const world = session.world;
  const name = world?.name;
  const rev = world?.rev;
  const safe = /^[a-z0-9-]{1,32}$/.test(name ?? '') && Number.isInteger(rev) && rev >= 0;
  if (!safe) {
    return null;
  }
  const dir = resolve(session.home, 'shots');
  const file = resolve(dir, name + '-' + rev + '.png');
  return file.startsWith(dir + sep) ? { dir, file } : null;
}
function writeShot(home, { dir, file }, png) {
  mkdirSync(dir, { recursive: true });
  const directory = lstatSync(dir);
  if (!directory.isDirectory() || directory.isSymbolicLink() ||
    realpathSync(dir) !== join(realpathSync(home), 'shots')) {
    throw failure('io');
  }
  const target = lstatSync(file, { throwIfNoEntry: false });
  if (target && (!target.isFile() || target.isSymbolicLink())) {
    throw failure('io');
  }
  writeFileSync(file, png);
}
function html() {
  let text = readFileSync(new URL('viewer/index.html', root), 'utf8');
  for (const [k, v] of Object.entries({ ...C, ...KIT_COPY })) if (typeof v === 'string') {
    text = text.replaceAll('__' + k + '__', v);
  }
  const css = text.match(/<style>([\s\S]*?)<\/style>/)?.[1] ||
  '';
  return text.replace('__STYLE_HASH__', createHash('sha256').update(css).digest('base64'));
}
/** Create a loopback HTTP service without binding a port. */
function createHttpServer(session) {
  const token = randomUUID();
  const clients = new Set();
  let timer = null;
  const unsubscribe = session.subscribe(
    event => {
      const data = 'data: ' + JSON.stringify(event) + '\n\n';
      for (const res of clients) {
        res.write(data);
      }
    }
  );
  const server = createServer(
    async (req, res) => {
      const send = (status, value) => {
        res.writeHead(
          status,
          {
            'content-type': 'application/json',
            'cache-control': 'no-store',
            'x-content-type-options': 'nosniff'
          }
        );
        res.end(JSON.stringify(value) + '\n');
      };
      const port = server.address().port;
      const hosts = ['127.0.0.1:' + port, 'localhost:' + port];
      const path = req.url?.split('?')[0];
      const origin = req.headers.origin;
      if (
        !hosts.includes(req.headers.host) || origin !== undefined &&
        (path === '/tool' || !hosts.includes(origin.replace('http://', '')))
      ) {
        req.resume();
        send(403, { error: C.error.origin });
        return;
      }
      try {
        if (req.method === 'GET') {
          if (path === '/api/viewer') {
            send(200, { token, home: resolve(session.home) });
            return;
          }
          if (path === '/favicon.ico') {
            res.writeHead(204);
            res.end();
            return;
          }
          if (path === '/tools') {
            send(200, { tools: TOOLS });
            return;
          }
          if (path === '/api/state') {
            send(200, session.state());
            return;
          }
          if (path === '/api/events') {
            session.catchUp();
            res.writeHead(
              200,
              {
                'content-type': 'text/event-stream',
                'cache-control': 'no-cache',
                'connection': 'keep-alive'
              }
            );
            res.write(': ready\n\n');
            clients.add(res);
            if (!timer) {
              timer = setInterval(
                () => {
                  try {
                    session.catchUp();
                  } catch {
                    for (const client of clients) {
                      client.write('data: {"reset":true}\n\n');
                    }
                  }
                },
                400
              );
            }
            req.on(
              'close',
              () => {
                clients.delete(res);
                if (!clients.size) {
                  clearInterval(timer);
                  timer = null;
                }
              }
            );
            return;
          }
          if (routes.has(path)) {
            const value = path === '/' ? html():
            ['/player.mjs', '/kit-panel.mjs', '/music.mjs', '/tap.mjs'].includes(path) ?
            readFileSync(new URL(routes.get(path), root), 'utf8').replaceAll('../src/', './'):
            readFileSync(new URL(routes.get(path), root));
            res.writeHead(
              200,
              {
                'content-type': path === '/' ? 'text/html; charset=utf-8':
                'text/javascript; charset=utf-8',
                'cache-control': 'no-store',
                'x-content-type-options': 'nosniff'
              }
            );
            res.end(value);
            return;
          }
        }
        if (req.method === 'POST' && path === '/shot') {
          const type = req.headers['content-type']?.split(';')[0].trim();
          if (type !== 'image/png') {
            req.resume();
            send(415, { error: C.error.shot });
            return;
          }
          const png = await shotBody(req);
          const target = shotFile(session);
          if (!target) {
            throw failure('missing');
          }
          if (!isPng(png)) {
            throw failure('shot');
          }
          writeShot(session.home, target, png);
          send(200, { ok: true });
          return;
        }
        if (req.method === 'POST' && ['/tool', '/bench', '/api/input'].includes(path)) {
          if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') {
            req.resume();
            send(415, { error: C.error.content });
            return;
          }
          if (path === '/api/input') {
            const value = await body(req, 256, C.error.inputSize, true);
            send(200, { n: acceptInput(session, value) });
            return;
          }
          const value = await body(req);
          if (path === '/tool') {
            if (
              !value || typeof value !== 'object' || Array.isArray(value) ||
              Object.keys(value).some(k => !['tool', 'arguments'].includes(k))
            ) {
              throw failure('request');
            }
            send(200, { result: session.call(value.tool, value.arguments, 'http') });
            return;
          }
          const keys = ['renderer', 'p50', 'p95', 'gapP95', 'frames', 'w', 'h', 'dpr'];
          if (
            !value || Object.keys(value).length !== keys.length ||
            !['canvas', 'webgl'].includes(value.renderer) || !keys.slice(1).every(
              k => Number.isFinite(value[k]) && value[k] >= 0
            ) || value.frames !== 600
          ) {
            throw failure('bench');
          }
          writeFileSync(join(session.home, 'bench.json'), JSON.stringify(value, null, 2) + '\n');
          send(200, { ok: true });
          return;
        }
        req.resume();
        send(404, { error: C.error.route });
      } catch (e) {
        send(e.status || 400, { error: publicError(e).message });
      }
    }
  );
  server.requestTimeout = 30000;
  server.viewerToken = token;
  server.headersTimeout = 10000;
  server.on(
    'close',
    () => {
      clearInterval(timer);
      unsubscribe();
    }
  );
  server.once('error', unsubscribe);
  server.stop = () => {
    for (const res of clients) {
      res.end();
    }
    return new Promise(resolve => server.close(resolve));
  };
  return server;
}
/** Bind one loopback port and publish the session viewer URL. */
export async function startHttp({ port = 4747, session }) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw failure('port');
  }
  const server = createHttpServer(session);
  await new Promise(
    (resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', resolve);
    }
  );
  session.viewer = 'http://127.0.0.1:' + server.address().port +
  '/';
  writeFileSync(join(session.home, 'viewer.json'), JSON.stringify({
    port: server.address().port, token: server.viewerToken
  }) + '\n');
  return server;
}
/** Try the configured viewer port and its nine successors. */
export async function startAvailable(
  session, port = Number(process.env.VOXEL_GENESIS_PORT ?? 4747)
) {
  for (let i = 0; i < (port === 0 ? 1: 10); i++) {
    try {
      return await startHttp({ port: port + i, session });
    } catch (e) {
      if (e.code !== 'EADDRINUSE') {
        break;
      }
    }
  }
  session.viewer = null;
  return null;
}
