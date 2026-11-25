# Building a world

[//]: # (COPY-DRAFT)

A short guide for an agent or a person driving the engine through its four tools. The tool
text and the server instructions are the contract; this page only shows how they fit together.

## The four tools
- `world_open` opens or starts a world and replies with its size, block names, prefab names and a
  viewer link. Arguments: `name`, `size` as [width, depth, height] (each 8 or more, at most
  [160, 160, 64]; leave it out for the default 32 by 32 by 24), `seed`, `fresh` to start over, `from`
  to load a built world, `game` town or `kit` NAME for games.
  `grow: true` with a larger `size` enlarges a plain world and keeps its blocks; `shift: [x, z]` also
  moves them east by x and south by z, so the world grows west and north.
- `world_build` applies up to 200 ops in order and replies on one line: `rev`, `hash`, `count`, and
  `fell`, `lost` and `sank` (blocks that dropped, left the world or went under water).
- `world_look` reads the world as a small text map: top, height, side, info or town.
- `world_undo` takes back the last build, or the last few.

Axes: x runs right, z runs down the map, y runs up. Loose blocks fall without support.

## Three ways to start
1. From scratch: `world_open {name}`, then one `world_build` with ground, water, prefabs and trees.
2. From a proven world: `world_open {name, from: "small-town"}` (or `tiny-garden`, `hill-village`)
   builds it in one call.
3. From a picture: `world_open {name, from: "C:/path/map.png"}` turns an image into a world with no AI
   in the loop. The same image bytes always give the same world.

## A build in one call
A seaside town on the default size, as one `world_build`:

```json
{"ops":[
  ["paint","water",0,26,31,31],
  ["paint","road",0,14,31,15],
  ["paint","water",22,2,28,8],
  ["rep",3,7,0,0,[["stamp","cottage",1,8,0]]],
  ["rep",3,7,0,0,[["stamp","house",1,17,2]]],
  ["scatter","tree",0,0,20,6,6],
  ["car","amber",0,14,31,15]
]}
```

`paint` sets ground in a rectangle, `stamp` places a prefab by its low corner with quarter turns,
`rep` repeats ops with an offset, `scatter` places up to n of a prefab where there is room (the reply
says `placed=a/b`), and `car` drives a car of that colour around its box. The full op list is in the
`world_build` description.

## Checking the result
Trust the reply. If `fell`, `lost` and `sank` are all 0, nothing moved; look only when one is above
zero, or when you want to check a layout. A look costs about 1.3 KB of reply. Open the viewer link to
see the world turn and build; the car shows there, not in the text views.

## Limits
- A refused call changes nothing and says what to fix, for example a stamp past the world edge.
- Ask for houses by name: `house` and `cottage` are homes; `shop`, `market` and `workshop` are not.
- Saves are plain JSON lines under `VOXEL_GENESIS_HOME` (default `~/.voxel-genesis`); every world replays to
  the same hash.
