// Discover only a live viewer serving the same local data folder.
import { readFileSync } from 'node:fs';
import { join, resolve as absolute } from 'node:path';
import { request } from 'node:http';
/** Verify the saved loopback port and instance token before returning its viewer URL. */
function probe(port, home, token) {
  return new Promise(resolve => {
    const req = request({ host: '127.0.0.1', port, path: '/api/viewer', timeout: 200 }, res => {
      let raw = '';
      res.on('data', chunk => {
        raw += chunk;
        if (raw.length > 1024) req.destroy();
      });
      res.on('error', () => resolve(null));
      res.on('end', () => {
        try {
          const found = JSON.parse(raw);
          resolve(res.statusCode === 200 && found.home === home &&
            typeof found.token === 'string' && (!token || found.token === token)
            ? 'http://127.0.0.1:' + port + '/' : null);
        } catch {
          resolve(null);
        }
      });
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(null));
    req.end();
  });
}
/** Check the recorded instance, then the standard viewer range for the same save folder. */
export async function viewerLink(home) {
  home = absolute(home);
  let record;
  try {
    record = JSON.parse(readFileSync(join(home, 'viewer.json'), 'utf8'));
  } catch {}
  if (Number.isInteger(record?.port) && record.port > 0 && record.port <= 65535 &&
    typeof record.token === 'string') {
    const link = await probe(record.port, home, record.token);
    if (link) return link;
  }
  const links = await Promise.all(Array.from({ length: 10 }, (_, i) => probe(4747 + i, home)));
  return links.find(Boolean) || null;
}
