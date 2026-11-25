#!/usr/bin/env node
// Select a local transport or project command without eager core loading.
const boot = 0;
import { C, TOOL_COPY } from '../src/copy.mjs';
import { serveStdio } from '../src/mcp-stdio.mjs';
const [mode,...args] = process.argv.slice(2);
let session;
let server;
let pending;
const getSession = () => pending ??= (
  async () => {
    const { createToolSession } = await import('../src/session.mjs');
    session = createToolSession();
    if (['mcp', 'repl', 'serve'].includes(mode)) {
      const { startAvailable } = await import('../src/http.mjs');
      server = await startAvailable(
        session,
        mode === 'serve' && args[0] !== undefined ? Number(args[0]):
        undefined
      );
    } else if (mode === 'call') {
      const { viewerLink } = await import('../src/viewer-link.mjs');
      session.viewer = await viewerLink(session.home);
    }
    return session;
  }
)();
const print = value => process.stdout.write(JSON.stringify(value) + '\n');
try {
  if (mode === 'mcp') {
    await serveStdio(
      getSession,
      process.stdin,
      process.stdout,
      async () => {
        const { dataHome, logUsage } = await import('../src/usage.mjs');
        logUsage(dataHome(), 'mcp', 'initialize', boot, null, null);
      }
    );
  } else if (mode === 'repl') {
    const { serveRepl } = await import('../src/repl.mjs');
    await serveRepl(getSession);
  } else if (mode === 'serve') {
    const s = await getSession();
    print({ viewer: s.viewer });
    if (!server) {
      process.exitCode = 1;
    }
  } else if (mode === 'call') {
    const { input } = await import('../src/cli-input.mjs');
    const s = await getSession();
    print(s.call(args[0], input(args[1]), 'call'));
  } else if (mode === 'tools') {
    print({ tools: TOOL_COPY });
  } else if (mode === 'check') {
    const { gameCheckCli } = await import('../scripts/game-check.mjs');
    gameCheckCli(args);
  } else if (mode === 'kit') {
    const { createKitFiles } = await import('../src/kit-files.mjs');
    const { kitError } = await import('../src/kit-copy.mjs');
    const files = createKitFiles({ cwd: args[1] });
    if (args[0] === 'check') print(files.check());
    else if (args[0] === 'list') print(files.catalogue());
    else throw kitError('kit', 'type', 'check|list');
  } else if (mode === 'connect') {
    const { connect } = await import('../src/connect.mjs');
    print(await connect(args[0]));
  } else if (mode === 'export') {
    const { exportWorld } = await import('../src/export.mjs');
    print(exportWorld(args));
  } else if (mode === 'run') {
    const { input } = await import('../src/cli-input.mjs');
    const { failure } = await import('../src/errors.mjs');
    const f = input('@' + args[0]);
    const s = await getSession();
    if (!f || !Array.isArray(f.batches)) {
      throw failure('arguments');
    }
    s.call('world_open', f.open, 'run');
    for (const ops of f.batches) {
      if (ops?.grow) {
        s.call('world_open', { name: s.world.name, size: ops.grow, grow: true,
          ...(ops.shift !== undefined ? { shift: ops.shift } : {}) }, 'run');
      } else {
        s.call('world_build', { ops }, 'run');
      }
    }
    const { summary } = await import('../src/core/codec.mjs');
    print({ ok: true, rev: s.world.rev,...summary(s.world) });
  } else {
    const { failure } = await import('../src/errors.mjs');
    throw failure('help');
  }
} catch (e) {
  const { publicError } = await import('../src/errors.mjs');
  print({ error: e.message === C.help ? e.message: publicError(e).message });
  process.exitCode = 1;
} finally {
  if (mode !== 'serve' && server) {
    await server.stop();
  }
}
