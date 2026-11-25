# Changelog

## Unreleased

## 0.7.0

[//]: # (COPY-DRAFT)

- Grow a plain world in place with `world_open {name, size, grow: true}`. Add `shift: [x, z]` to grow
  west and north. Grows replay, undo and export like builds.
- Raise world limits to [160, 160, 64], with width and depth up to 160 and height still 64.
- Raise world limits to [96, 96, 64], keeping the default [32, 32, 24] and existing world hashes.
- Encode all 64 height levels with one character per cell in height views.
- Add `swap` to replace a material in a box or across the world.
- Add `mirror` to copy non-air cells across an integer or half-cell plane on x, y or z.
- Both ops settle, report falls, replay and undo with their build batch.
- Scale the write budget above the old maximum volume, reaching 160,000 at 96 by 96 by 64.

## 0.6.0

[//]: # (COPY-DRAFT)

- Renamed to voxel-genesis: package, command, MCP entry, VOXEL_GENESIS_* settings and the ~/.voxel-genesis save folder.
- Prepare public docs, the npm package and client connection snippets.
- No change to tools or worlds.
- Licensed under Apache 2.0.

## 0.5.1

[//]: # (COPY-DRAFT)

- `world_open` says the size order and limits in its schema: `[width, depth, height], each 8 to [48, 48, 32].` Its description now reads `game town: the town game; kit NAME: game parts; from small-town, tiny-garden, hill-village or .png path: built world.` Tool bytes 2,475.
- The viewer no longer shows the `img sha256:` note under a world built from a PNG. The saved note and the world hash are unchanged.
- The caption under a world's title reads at body size (16px) with room under the rule.
- Measured with cold agents: no size guess and 0 refused for Codex and Claude. Codex builds a seaside town or a park in 2 calls (was 3). Claude takes a median 3 calls on the test brief (open, build, one check look), and on 0.5.0 took 5 (town) or 4 (park) on a bare request.

## 0.5.0

- `world_undo` restores the world kept from before each recent build instead of replaying the log: about 250 ms to 4 ms on a 48 by 48 world. Saves are unchanged.
- `world_open` takes `from` (small-town, tiny-garden or hill-village) and builds that proven world in one call. Tool bytes cap 2,480, description cap 224.
- `from` also takes an absolute PNG path: same image bytes, same world, no AI. Size cap 846 KiB.
- The size refusal names the order: [width, depth, height], at most [48, 48, 32]. `.PNG` paths open.

## 0.4.1

[//]: # (COPY-DRAFT)

- Name the kit ops in the tool text. `world_build` now ends with ` Game parts, no kit needed: [part,{part:kind/id,..}]; [in,click,x,y,z].` and `world_look` says ` Kit view lists kinds; of store,goal gives both docs.`
- Click refusals say what to do: `no input part matches; clicks land only inside places; add a place part with at`, `no input part matches; click inside a place, such as ID at X1,Z1,X2,Z2`, `click is outside the world; use x 0 to W, y 0 to H, z 0 to D`, `wrong op shape; send ["in","click",x,y,z] or ["in","key",k]`, and for an unknown key, `wrong op shape; use up, left, down, right or space`. The kit check and build warnings add `input/ID: clicks land only inside places; add a place part with at` when a click input has no place.
- `move` on an unknown id says `move: no such mover; pets do not walk. Put [mover,id,block,x,z] before it.`
- Let one kit look list 2 to 6 kinds, such as `of store,input,goal`, with a fix line for a bad list.
- `do` on an input part now says how to fire it, with a working `["in","click",x,y,z]` or
  `["in","key",k]` op, and the kit view lists `in`.
- `["kit","part",{...}]` and the like now say to send the op on its own, with the op written out, and
  the kit view says each op is its own array.

## 0.4.0

[//]: # (COPY-DRAFT)

- Kept each session on the world it opened when another session opens a different world.
- Let a beat finish in the same reply as the drop that completes it.
- Left turn words out of replies when a game has no turn, bot, deck or advisor part.
- Credited the first player when a game has players and no turns.
- Named the action and its limit when an action is used up.
- Added `export NAME` to save a live world as a kit bundle and a run script.
- Listed current warnings and the story line when a kit world reopens.
- Showed the props a game sets on its places in the play view.
- Added a recipe for district grounds with one board per place tag.
- Added a `note` op and effect that write short lines to a world feed. Build replies show new lines and the viewer shows the latest.
- Added `?motion=reduce` to the viewer link to turn off motion that is not needed.
- Added `genesisShot()` in step mode to save the world picture as a PNG in the save folder.
- Added clicks and keys in the viewer. A click picks the block under the pointer; W, A, S, D and Space send keys.
- Kept clicks and keys in a small queue beside the world. They never change the world or its saves.
- Added `world_look {"view":"input"}` to read waiting inputs. A build reply ends `input K new` while inputs wait.
- Showed "Sent to the game." for a moment after a tap reaches the game.
- Added `mover` and `move` ops. Up to 16 movers stand on the world and walk round walls to a cell.
- Build replies say `moved`, `bump` or `blocked` for each walk, three lines at most.
- Added the names `mover.ID.x`, `mover.ID.z` and `mover.ID.place` for game parts.
- The viewer walks movers at car speed and places them at once with reduced motion.
- Added the kit kind `input`. A click on a bound place, or a bound key, plays its effects into the world by itself, up to 4 a second.
- Kept other clicks and keys, and bound ones past the limit, in the queue for the agent.
- Added `node bin/voxel-genesis.mjs tools` to print the four tool descriptions for shell agents.
- The `set` effect now refuses a place's id, at and tags.
- Shortened the `world_open` reply: it leaves out the name, size and seed when they match what the call sent, and an empty world list.
- A mover turns its body at a corner instead of snapping.
- The command-line door suggests `@file` when its arguments are not valid JSON.
- Players no longer see the `input:` prefix on a refused tap.
- A mover keeps the way it faced when it arrives, until the viewer resyncs.
- A kit lookup that matches nothing lists the kinds it accepts, or how to add a missing part and the parts that exist.
- The viewer marks the places a player can tap, and shows a pointer only over them.

## 0.3.0

[//]: # (COPY-DRAFT)

- Added composable world, play, story, talk and music parts through the existing four tools.
- Added property, quest, town, garden and courier examples with deterministic script replay.
- Added generated kind docs, five recipes and MCP developer cost checks.
- Added kit usage tables, fixed review rules and support for capital letters in error codes.
- Added opt-in procedural music and story panels with reduced-motion checks.

## 0.2.2

- Queued arriving build batches so fixture runs animate, including a newly opened world.
- Deferred resync until playback finishes, with a bounded backlog and revision/hash checks.
- Kept sinking blocks at the water with a slow shrink in both renderers and surface coordinates.
- Paired town needs with affordable remedies, counted sleeping homes and named multi-road repairs.
- Preferred free lots and disclosed advice that replaces parks, trees or buildings.
- Added game prices to open help and the README, and price/coins detail to refusals.
- Re-froze the seed-7 helper at 168 hearts, 56 people and two stars under the corrected advice.

## 0.2.1

- Ranked affordable town advice by current needs, with varied choices and roads for sleeping homes.
- Added plain needs chips, worded endings, goal labels and the same-seed helper score.
- Kept all five viewer controls in the viewport and added a CSS layout budget check.
- Added manual frame stepping with ?step=1 and height-layer building playback.
- Added base@3 windows on every cottage and house face, paired tower windows and a roof cap.
- Preserved old catalogue saves and helper replay; made toy cars larger with a pale cab.
- Added live viewer fallback scanning and clear guidance for unsupported repeated game operations.
- Updated quick start order, building and game prompts, and local review documentation.

## 0.2.0

- Added the 24-turn town game, ranked advice, helper replay, hearts and stars through the same four tools.
- Added per-world rule packs and deterministic game saves, replay and undo.
- Added an accessible DOM town HUD with event-driven updates and reduced-motion playback.
- Added town fixtures, rule and budget checks, and a worked first three turns.
- Added base@2 plain walls, deliberate windows, clean roof tiles and a taller chimney.
- Preserved base@1 save replay and added working zoom, front-facing doors and readable cars and pets.
- Added live CLI viewer discovery, scatter placement counts and open bridge approach hints.

## 0.1.0

- Added four local voxel tools through MCP, HTTP, REPL and CLI doors.
- Added deterministic saves, undo, versioned catalogue records and atomic batches.
- Added the watch-only viewer, WebGL rendering and cached canvas fallback.
- Added project configuration for Claude Code and Grok, plus local usage reviews.
- Added fixture, physics, protocol, renderer and work-count checks with a cross-platform CI matrix.

Licence: Apache 2.0, see LICENSE.
