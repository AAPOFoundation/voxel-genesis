// Own the line-based tool REPL and its shared request framing.
import { failure } from './errors.mjs';
import { C, TOOL_COPY as TOOLS } from './copy.mjs';
import { readLines } from './mcp-stdio.mjs';
/** Read tool-name and JSON lines through the shared session. */
export async function serveRepl(
  getSession,
  input = process.stdin,
  output = process.stdout
) {
  const send = value => output.write(JSON.stringify(value) + '\n');
  await readLines(
    input,
    async line => {
      try {
        const m = line.trim().match(/^(\w+)(?:\s+([\s\S]+))?$/);
        if (!m) {
          throw failure('request');
        }
        if (m[1] === 'help') {
          send({ tools: TOOLS });
          return;
        }
        let args = {};
        if (m[2]) {
          try {
            args = JSON.parse(m[2]);
          } catch {
            throw failure('json');
          }
        }
        const session = await getSession();
        send(session.call(m[1], args, 'repl'));
      } catch (e) {
        send({ error: e.message });
      }
    },
    () => send({ error: C.error.record })
  );
}
