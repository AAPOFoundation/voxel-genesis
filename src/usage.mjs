// Own the content-free local usage log and its data directory.
import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { C } from './copy.mjs';
import { bytes } from './budget.mjs';
/** Resolve the local data directory without exposing configuration values. */
export function dataHome() {
  return process.env.VOXEL_GENESIS_HOME || join(homedir(), '.voxel-genesis');
}
/** Append metrics only; arguments and error messages never enter the log. */
export function logUsage(home, door, tool, start, input, output, code = null, kit) {
  if (process.env.VOXEL_GENESIS_NO_LOG === '1') {
    return;
  }
  try {
    mkdirSync(home, { recursive: true });
    const file = join(home, 'usage.jsonl');
    if (existsSync(file) && statSync(file).size >= 5 * 1024 * 1024) {
      renameSync(file, join(home, 'usage.1.jsonl'));
    }
    const row = {
      t: Date.now(),
      door,
      tool,
      ms: + (performance.now() - start).toFixed(3),
      in: bytes(input),
      out: bytes(output),
      err: code
    };
    if (kit !== undefined) row.kit = kit;
    appendFileSync(file, JSON.stringify(row) + '\n');
  } catch {
    process.stderr.write(C.error.io + '\n');
  }
}
