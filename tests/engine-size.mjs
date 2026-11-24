// Plain pin: main d35ea5f.
import { mkdirSync, mkdtempSync, readdirSync } from 'node:fs';
import { TOOL_COPY as tools, SERVER_INSTRUCTIONS as info } from '../src/copy.mjs';
const json = JSON.stringify, fails = [];
const check = (rule, ok) => { if (!ok) fails.push(rule); };
mkdirSync('.agent-work/size', { recursive: true });
const home = () => mkdtempSync('.agent-work/size/run-');
process.env.VOXEL_GENESIS_HOME = home();
process.env.VOXEL_GENESIS_NO_LOG = '1';
delete process.env.VOXEL_GENESIS_KIT;
const { createToolSession } = await import('../src/session.mjs');
const fresh = () => createToolSession({ home: home() });
const open = (s, args) => {
  try { return s.call('world_open', args); } catch (e) {
    if (!e.code) throw e;
    return { err: e.code };
  }
};
const text = json(tools.find(t => t.name === 'world_open').inputSchema.properties.size);
check('case 1', /width.*depth.*height/.test(text));
check('case 2', [8, 48, 32].every(n =>
  new RegExp('(^|[^0-9])' + n + '([^0-9]|$)').test(text)));
check('case 3 bytes', Buffer.byteLength(json({ jsonrpc: '2.0', id: 1,
  result: { tools } })) + Buffer.byteLength(info) <= 2480);
check('case 3 copy', tools.every(t => t.description.length <=
  (t.name === 'world_build' ? 640 : t.name === 'world_open' ? 224 : 160)));
for (const size of [[7,8,8], [8,7,8], [8,8,7], [49,8,8], [8,49,8], [8,8,33]]) {
  const s = fresh(), r = open(s, { name: 'bad', size });
  check('case 4 no ' + size, (r.ok === false || r.err === 'size') &&
    !s.world && readdirSync(s.home + '/worlds').length === 0);
}
for (const size of [[48,48,32], [8,8,8]]) {
  const s = fresh(), r = open(s, { name: 'good', size });
  check('case 4 yes ' + size, !r.err && r.ok !== false &&
    json([s.world?.w, s.world?.d, s.world?.h]) === json(size));
}
const plain = '{"size":[32,32,24],"seed":1,"rev":0,"count":1024,"hash":"fb543699",' +
  '"viewer":"run serve","blocks":"grass earth rock path road water deck brick cream sun ' +
  'slate roof timber trunk leaf needle plaster amber blue tile","prefabs":"workshop:5x5x6 ' +
  'market:6x6x7 cottage:5x5x5 house:5x6x8 shop:6x5x5 tower:4x4x12 barn:7x5x6 tree:3x3x6 ' +
  'pine:3x3x7 bridge:6x3x2 well:2x2x3 bench:2x1x1"}';
check('case 5', json(open(fresh(), { name: 'plain' })) === plain);
for (const f of fails) console.log('FAIL ' + f);
console.log('engine-size: ' + fails.length + ' failures');
process.exitCode = +!!fails.length;
