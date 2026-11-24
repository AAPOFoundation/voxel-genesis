// Own solid prefab recipes, rotation and terrain footings.
const box = (b, x, y, z, xx, yy, zz) => ['box', b, x, y, z, xx, yy, zz];
const tree = (leaf, h, tiers) => [
  box('trunk', 1, 0, 1, 1, h - 2, 1),
  ...tiers.flatMap(
    y => [
      box(leaf, 0, y, 1, 0, y, 1),
      box(leaf, 2, y, 1, 2, y, 1),
      box(leaf, 1, y, 0, 1, y, 0),
      box(leaf, 1, y, 2, 1, y, 2)
    ]
  ),
  box(leaf, 1, h - 1, 1, 1, h - 1, 1)
];
export const PREFABS = {
  workshop: {
    size: [5, 5, 6],
    ops: [box('timber', 0, 0, 0, 4, 2, 4), box('slate', 0, 3, 0, 4, 3, 4),
      box('brick', 3, 4, 3, 3, 5, 3)]
  },
  market: {
    size: [6, 6, 7],
    ops: [box('sun', 0, 0, 0, 5, 3, 5), box('roof', 0, 4, 0, 5, 4, 5),
      box('roof', 1, 5, 1, 4, 5, 4), box('cream', 2, 6, 2, 3, 6, 3)]
  },
  cottage: {
    size: [5, 5, 5],
    ops: [
      box('cream', 0, 0, 0, 4, 2, 4),
      box('roof', 0, 3, 0, 4, 3, 4),
      box('roof', 1, 4, 0, 3, 4, 4),
      box('timber', 2, 0, 0, 2, 1, 0)
    ]
  },
  house: {
    size: [5, 6, 7],
    ops: [
      box('cream', 0, 0, 0, 4, 3, 5),
      box('brick', 0, 4, 0, 4, 4, 5),
      box('brick', 1, 5, 0, 3, 5, 5),
      box('slate', 3, 6, 4, 3, 6, 4),
      box('timber', 2, 0, 0, 2, 1, 0)
    ]
  },
  shop: {
    size: [6, 5, 5],
    ops: [
      box('sun', 0, 0, 0, 5, 2, 4),
      box('roof', 0, 3, 0, 5, 3, 4),
      box('roof', 1, 4, 1, 4, 4, 3),
      box('timber', 2, 0, 0, 3, 1, 0),
      box('cream', 0, 2, 0, 0, 2, 0),
      box('cream', 2, 2, 0, 2, 2, 0),
      box('cream', 4, 2, 0, 4, 2, 0)
    ]
  },
  tower: {
    size: [4, 4, 12],
    ops: [box('slate', 0, 0, 0, 3, 11, 3), box('brick', 0, 5, 0, 3, 5, 3)]
  },
  barn: {
    size: [7, 5, 6],
    ops: [
      box('timber', 0, 0, 0, 6, 3, 4),
      box('brick', 0, 4, 0, 6, 4, 4),
      box('brick', 1, 5, 1, 5, 5, 3),
      box('slate', 2, 0, 0, 4, 2, 0),
      box('timber', 3, 0, 0, 3, 2, 0)
    ]
  },
  tree: { size: [3, 3, 6], ops: tree('leaf', 6, [3, 4]) },
  pine: { size: [3, 3, 7], ops: tree('needle', 7, [2, 4, 5]) },
  bridge: {
    size: [6, 3, 2],
    ops: [
      box('deck', 0, 0, 0, 5, 0, 2),
      box('timber', 0, 1, 0, 5, 1, 0),
      box('timber', 0, 1, 2, 5, 1, 2)
    ]
  },
  well: {
    size: [2, 2, 3],
    ops: [box('rock', 0, 0, 0, 1, 1, 1), box('timber', 0, 2, 0, 1, 2, 1)]
  },
  bench: { size: [2, 1, 1], ops: [box('timber', 0, 0, 0, 1, 0, 0)] }
};
