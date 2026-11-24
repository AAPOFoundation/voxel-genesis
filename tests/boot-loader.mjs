// Record application modules loaded by the real handshake process for the work gate.
import { appendFileSync } from 'node:fs';
/** Observe imports without changing resolution or source. */
export async function load(url, context, nextLoad) {
  if (url.startsWith('file:') && process.env.VOXEL_GENESIS_TRACE) {
    appendFileSync(process.env.VOXEL_GENESIS_TRACE, url + '\n');
  }
  return nextLoad(url, context);
}
