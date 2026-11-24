// Own MCP negotiation, bounded line framing and tool dispatch.
import { C, TOOL_COPY as TOOLS, PROTOCOL, PROTOCOLS, SERVER_INSTRUCTIONS } from './copy.mjs';
/** Read bounded UTF-8 records while recovering after oversized input. */
export async function readLines(input, onLine, onOversize) {
  input.setEncoding('utf8');
  let pending = '';
  let discarding = false;
  for await (const chunk of input) {
    const parts = chunk.split('\n');
    for (let i = 0; i < parts.length; i++) {
      if (!discarding) {
        pending += parts[i];
      }
      if (Buffer.byteLength(pending) > 1048576) {
        pending = '';
        discarding = true;
      }
      if (i < parts.length - 1) {
        if (discarding) {
          onOversize();
        } else if (pending.trim()) {
          await onLine(pending);
        }
        pending = '';
        discarding = false;
      }
    }
  }
  if (discarding) {
    onOversize();
  } else if (pending.trim()) {
    await onLine(pending);
  }
}
/** Serve MCP requests and log the first successful handshake once. */
export async function serveStdio(
  getSession,
  input = process.stdin,
  output = process.stdout,
  onInitialise = () => {}
) {
  let initialised = false;
  const send = value => output.write(JSON.stringify(value) + '\n');
  const error = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });
  await readLines(
    input,
    async line => {
      let r;
      try {
        r = JSON.parse(line);
      } catch {
        error(null, - 32700, C.error.json);
        return;
      }
      if (
        !r || Array.isArray(r) || r.jsonrpc !== '2.0' || typeof r.method !== 'string' ||
        Object.hasOwn(r, 'id') && !(typeof r.id === 'string' || Number.isFinite(r.id))
      ) {
        error(null, - 32600, C.error.request);
        return;
      }
      if (!Object.hasOwn(r, 'id')) {
        return;
      }
      const { id, method, params = {} } = r;
      if (method === PROTOCOL.initialise) {
        if (
          !params || typeof params.protocolVersion !== 'string' ||
          !params.protocolVersion.length || params.protocolVersion.length > 80
        ) {
          error(id, - 32602, C.error.protocol);
          return;
        }
        const first = !initialised;
        initialised = true;
        send(
          {
            jsonrpc: '2.0',
            id,
            result: {
              protocolVersion: PROTOCOLS.includes(params.protocolVersion) ?
              params.protocolVersion: PROTOCOLS[0],
              instructions: SERVER_INSTRUCTIONS,
              capabilities: { tools: { listChanged: false } },
              serverInfo: { name: PROTOCOL.server, version: PROTOCOL.version }
            }
          }
        );
        if (first) {
          await onInitialise();
        }
        return;
      }
      if (method === 'ping') {
        send({ jsonrpc: '2.0', id, result: {} });
        return;
      }
      if (!initialised) {
        error(id, - 32002, C.error.first);
        return;
      }
      if (method === 'tools/list') {
        send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
        return;
      }
      if (method !== 'tools/call') {
        error(id, - 32601, C.error.method);
        return;
      }
      if (!params || !TOOLS.some(t => t.name === params.name)) {
        error(id, - 32602, C.error.tool);
        return;
      }
      try {
        const s = await getSession();
        const v = s.call(params.name, params.arguments, 'mcp');
        send(
          {
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text: typeof v === 'string' ? v: JSON.stringify(v) }],
              isError: false
            }
          }
        );
      } catch (e) {
        send(
          {
            jsonrpc: '2.0',
            id,
            result: { content: [{ type: 'text', text: e.message }], isError: true }
          }
        );
      }
    },
    () => error(null, - 32600, C.error.record)
  );
}
