# Make a game

[//]: # (COPY-DRAFT)

Each JSON list below is an ordered sequence of tool calls. Use the live catalogue first.
Parts compose freely. Examples are starting points, and your own bundles use the same shapes.
Turns are optional. Leave out turn, bot, deck and advisor parts and replies drop moves and end.

## New game

Read the catalogue, open an example, then replace its story with a small building objective.
```json
[
  {"tool":"world_look","arguments":{"view":"kit"}},
  {"tool":"world_open","arguments":{"name":"kite","kit":"quest","fresh":true}},
  {"tool":"world_build","arguments":{"ops":[["cut","story"],
    ["part",{"part":"beat/kite","goal":"Find the kite.","when":[[">=","blocks.sun",1]]}]]}},
  {"tool":"world_build","arguments":{"ops":[["box","sun",1,1,1,1,1,1]]}}
]
```

## Game in progress

Build a step, attach music, then change one field. Existing builds remain in place.
```json
[
  {"tool":"world_open","arguments":{"name":"steps","fresh":true}},
  {"tool":"world_build","arguments":{"ops":[["box","brick",1,1,1,1,1,1]]}},
  {"tool":"world_build","arguments":{"ops":[["kit","garden","music"]]}},
  {"tool":"world_build","arguments":{"ops":[["edit","tune/spring","bpm",80]]}}
]
```

## Mix and match

Keep the quest's world and story, add garden music, then copy a tune and an inline voice.
When a place loses its owner, its ring returns to ground. Use one board per place tag for district grounds.
```json
[
  {"tool":"world_open","arguments":{"name":"mix","kit":"quest","fresh":true}},
  {"tool":"world_build","arguments":{"ops":[["cut","music"],["kit","garden","music"],
    ["part","property:tune/stroll"],["part",{"part":"voice/nib","says":"Nib"}]]}},
  {"tool":"world_build","arguments":{"ops":[["part",{"part":"place/dock","at":[1,1,6,6],"tags":["harbour"]}],["part",{"part":"place/stall","at":[9,1,14,6],"tags":["market"]}],["part",{"part":"board/harbour","places":"harbour","ground":"water"}],["part",{"part":"board/market","places":"market","ground":"path"}]]}},
  {"tool":"world_look","arguments":{"view":"kit","of":"check"}}
]
```

## Your own folder

Copy fixtures/kit/project/voxel-kit/tide.json into your project's voxel-kit folder.
Start the connector from that project. The catalogue discovers local JSON bundles on each call.
The copied fixture's strings are draft wording. Edit parts using the live kind documentation.
```json
[
  {"tool":"world_look","arguments":{"view":"kit"}},
  {"tool":"world_open","arguments":{"name":"shore","fresh":true}},
  {"tool":"world_build","arguments":{"ops":[["kit","tide"]]}},
  {"tool":"world_look","arguments":{"view":"kit","of":"check"}}
]
```

## Check before you commit

Inspect a live world, validate the folder with the CLI, then run the four suites.
```json
[
  {"tool":"world_open","arguments":{"name":"checked","kit":"garden","fresh":true}},
  {"tool":"world_look","arguments":{"view":"kit","of":"check"}}
]
```
```sh
node bin/voxel-genesis.mjs kit check
node bin/voxel-genesis.mjs check ./voxel-kit/my-game.json --seeds 12
node scripts/kit-docs.mjs
bash check.sh
```
Keep frozen fixtures intact. Sound starts off; use the viewer's sound button to hear a tune.
Add --script game.json for building moves, --ab other.json for comparison, or --json for agents.
