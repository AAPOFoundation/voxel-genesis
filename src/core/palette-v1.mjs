// Own the versioned block catalogue, glyphs and allowed colours.
export const SET_ID = 'base@1';
const LAMP = [
  { at: [.16, 0,.16], size: [.07,.8,.07], color: '#3d3a36', every: 5, seed: 6 },
  { at: [.16,.8,.16], size: [.2,.1,.2], color: '#fdb817', every: 5, seed: 6 }
];
const BLOOM = [
  { at: [.3, 0,.3], size: [.12,.14,.12], color: '#fdb817', every: 3, seed: 1 },
  { at: [.7, 0,.62], size: [.12,.12,.12], color: '#ffffff', every: 4, seed: 2 },
  { at: [.55, 0,.2], size: [.12,.13,.12], color: '#ea8f7c', every: 5, seed: 3 },
  { at: [.78, 0,.25], size: [.09,.22,.09], color: '#6b8f3e', every: 3, seed: 4 }
];
const ROOF = [
  { at: [.32, 0,.32], size: [.3,.16,.3], color: '#9a958c', every: 2, seed: 7 },
  { at: [.74, 0,.7], size: [.05,.5,.05], color: '#3d3a36', every: 3, seed: 8 }
];
const WATER = [
  { at: [.36, 0,.6], size: [.3,.04,.3], color: '#ffffff', every: 2, seed: 5 },
  { at: [.36,.04,.6], size: [.1,.08,.1], color: '#ffffff', every: 4, seed: 5 }
];
export const BLOCKS = [
  ['grass', '.', '#8fb35a', { fixed: true, plantable: true, details: BLOOM }],
  ['earth', ',', '#c9ad7f', { fixed: true, plantable: true }],
  ['rock', '^', '#d2bd97', { fixed: true }],
  ['path', '=', '#ecdfc6', { fixed: true, details: LAMP }],
  [
    'road',
    '#',
    '#3d3a36',
    {
      fixed: true,
      road: true,
      details: [{ at: [.5, 0,.5], size: [.5,.03,.08], color: '#f6eedd' }]
    }
  ],
  ['water', '~', '#5aa9c9', { fixed: true, liquid: true, details: WATER }],
  ['deck', '-', '#b89f77', { fixed: true }],
  ['brick', 'B', '#be5727', { windows: true, details: ROOF }],
  ['cream', 'C', '#f6eedd', { windows: true, details: ROOF }],
  ['sun', 'S', '#fdb817', { windows: true, details: ROOF }],
  ['slate', 'T', '#7d98a8', { windows: true, details: ROOF }],
  ['roof', 'R', '#ea8f7c', {}],
  ['timber', 'W', '#b89f77', {}],
  ['trunk', 'I', '#8a5a3c', { support: true }],
  ['leaf', '*', '#4f8a4a', { clings: true }],
  ['needle', 'o', '#63a055', { clings: true }]
].map(([name, glyph, colour, flags]) => ({ name, glyph, colour,...flags }));
export const ALLOWED = [
  ...new Set(
    [
      '#f8f4ed',
      '#1d1d1d',
      '#be5727',
      '#fdb817',
      ...BLOCKS.map(b => b.colour),
      '#82a850',
      '#6b8f3e',
      '#9a958c',
      '#ffffff'
    ]
  )
];
/** Register the pinned block definitions on a new engine world. */
export function definePalette(world) {
  for (const { name, glyph, colour,...flags } of BLOCKS) {
    world.defineBlock(name, { ...JSON.parse(JSON.stringify(flags)), glyph, color: colour });
  }
}
