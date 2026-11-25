# Design

Voxel Genesis runs four local tools over one deterministic voxel core.
Node 20 or newer runs the source directly, with no packages or build step.

## Architecture

The CLI selects MCP stdio, local JSON HTTP, a line REPL, or a single call.
Every tool reaches the same session and schema validator.
The session owns the current world, append-only log, writer lock, catch-up and content-free usage metrics.
The browser uses the same pure core through a player that checks replay hashes.

| Module | Ownership |
|---|---|
| src/copy.mjs | Tool, error and viewer wording |
| src/validate.mjs | The supported JSON schema subset |
| src/errors.mjs, src/budget.mjs | Domain errors, safe public messages and UTF-8 budgets |
| src/core/index.mjs | Atomic batches, settle, replay and work counters |
| src/core/ops.mjs | Primitive validation, application and repetition expansion |
| src/core/palette.mjs, src/core/prefabs.mjs | Current catalogue wrapping frozen base@1 modules |
| src/core/codec.mjs, src/core/look.mjs | Hashes, RLE and bounded text views |
| src/session.mjs | One current world, local log and cooperating writers |
| src/mcp-stdio.mjs, src/http.mjs, src/repl.mjs | Transport framing and protocol boundaries |
| src/connect.mjs | Project-scoped client configuration |
| viewer/player.mjs | Ordered playback, reduced motion and resynchronisation |
| viewer/geometry.mjs, viewer/gl-renderer.mjs | Mesh construction and WebGL resources |
| viewer/camera.mjs, viewer/canvas-renderer.mjs | Fit bounds and cached canvas fallback |
| scripts/usage-data.mjs | Shared usage evidence and recovery calculations |

The core accepts the engine through createCore(engine).
It imports no Node modules and uses seeded integer operations for canonical state.
The vendored UMD engine remains byte-identical to its recorded SHA-256.
Package metadata deliberately omits type, so Node can load that UMD file through createRequire.

## Composable kit

[//]: # (COPY-DRAFT)

The live kind table defines 17 parts across world, play, story, talk and music.
Bundles are data examples. The engine uses part kinds and never selects behaviour by bundle id.
The Node resolver copies parts into saved logs; pure replay needs no source bundle files.
Town exposes read-only facts through its pack, leaving its existing game rules unchanged.
Music timing belongs to the viewer and does not enter the deterministic world state.
Generated docs share the kind table. Weekly review groups only recognised usage labels.

## World and physics

Size is [width, depth, height], with width and depth from 8 to 160 and height from 8 to 64.
x points right, z points down the map and y points up.
Coordinates are integers and box corners are inclusive in either order.
Seeds range from 0 to 2147483647. Names use lowercase letters, digits and hyphens, up to 32 characters.
A new world has grass at y=0.

Fixed blocks can span gaps. Loose blocks need support underneath.
Leaves can also cling beside a trunk. Unsupported blocks fall; water receives sinking blocks.
Every primitive operation settles before the next one, with a limit of 3,600 ticks.
A failed batch discards its isolated candidate and leaves the save unchanged.

## Catalogue and operations

The current set has 20 block names and twelve prefab names from the catalogue modules.
Buildings remain solid. Plain plaster, amber and blue separate walls and windows from decoration.
Selected blue cells make cottage windows; the ground row stays plain beside the timber door.
House and barn roofs use plain burnt orange tile. The house has a two-block tile chimney.
The original 16 blocks and recipes remain in palette-v1.mjs and prefabs-v1.mjs for legacy replay.
Doors face low z at turns 0, visible from the default yaw of pi minus 0.7.
Rotating a prefab changes its footprint around the submitted low corner.
Rock footings fill terrain gaps below its highest ground column.

The README lists all 13 operations with examples.
Batches allow 1 to 200 submitted operations and 2,000 expanded operations.
The attempted cell write limit is 20,000 up to the old 48 by 48 by 32 volume.
Above that volume it scales proportionally, rounded up, to 160,000 at 96 by 96 by 64.
Repetition cannot nest. A vertical shift requires a 3D operation.
Cars follow rectangular routes and pets use plantable columns. A world holds at most 12 life definitions.
These definitions enter the hash; animated positions do not.

## Results and budgets

Open returns world metadata, catalogue names, up to ten other worlds and a viewer URL or run serve hint.
Build and undo use rev, hash, count, fell, lost, sank, life and changed text fields.
Changed counts final cell differences, so stamping an identical building reports zero.
Life reports the current number of life definitions.
Scatter adds placed=N/requested, aggregated across repeated operations in the submitted batch.
An unsupported bridge approach adds note=bridge-ends-open when either end lacks nearby dry land.
Up to three physics locations identify submitted operation paths and coordinates.
An error names the operation path and bad value, with an alias or nearest name within distance two.

| Value | Maximum UTF-8 bytes |
|---|---:|
| world_open | 1,200 |
| world_build | 400 plain, 500 town |
| world_look | 3,000 |
| world_undo | 200 |
| Error | 200 |
| MCP tool list plus server instructions | 2,500 |

## Save and concurrency

The data directory defaults to ~/.voxel-genesis and can be selected with VOXEL_GENESIS_HOME.
Each worlds/name.jsonl begins with v, set, world, size, seed, rules and engine fields.
The current format is v=1, set=base@3, with rules=none@0 or town@1.
base@1 and base@2 retain their block ids, prefab recipes and replay hashes.
Old catalogue sets retain the original auto planner; new worlds use affordable, need-ranked advice.
Clone, undo and viewer snapshots carry the world's set. New worlds use base@3 without migration.
Later records contain ops or undo. Revision is the number of records after the header.
Undo appends a record, so revisions remain monotonic. Fresh opening preserves a .bak.jsonl file.

Unknown or absent sets and incompatible format or rule versions are refused.
An engine mismatch is reported. There is no automatic save migration.
The FNV-1a hash covers dimensions, cells, life, rules id and set id.
Before calls, sessions stat the log and apply appended records or replay when needed.
An exclusive local lock serialises writers. An abandoned lock requires operator attention.
Warm reads do no replay, operation application or settle work.

## Protocols and local serving

MCP uses newline-delimited JSON-RPC with a 1 MiB record cap.
Known protocol versions are 2025-06-18, 2025-03-26 and 2024-11-05.
Unknown client versions negotiate the newest supported version.
Handshake and tool listing do not load the core or bind HTTP.
The first tool call starts a session and attempts the viewer port.

The HTTP server binds only 127.0.0.1 and validates Host and Origin.
POST /tool accepts JSON up to 256 KiB. It is a local JSON API, not MCP Streamable HTTP.
GET /tools lists tools; /api/state and /api/events serve snapshots and revision events.
Static viewer routes are allowlisted. The favicon receives 204.
POST /bench accepts the measured 600-frame record and saves it locally.

MCP, REPL and serve try port 4747 and the next nine ports, or VOXEL_GENESIS_PORT.
Call mode reads viewer.json in the same save folder and verifies its loopback port and instance token.
The 200 ms probe returns a live link or run serve on missing, stale or unrelated instances.
MCP starts its own viewer; serve is intended for CLI use.
Connect updates only the current project's .mcp.json and .grok/config.toml entries for voxel-genesis.
Other entries survive. Ambiguous TOML forms, multiline TOML strings and symbolic links are refused.
Client compatibility is checked through local Claude Code and Grok sessions.

## Viewer

WebGL is the default, with cached canvas fallback when unavailable or selected by renderer=canvas.
The starting view fits occupied bounds with eight percent total margin, including height and details.
Tall phone canvases fit to width. Centred zoom spans 0.6 to 2 times that fit.
Closer zooms may crop outer edges for inspection; zooming out restores the full world.
The canvas takes the page's spare height.
The static GL mesh changes once per revision; animated cell edits use a patch buffer.
The canvas fallback caches static paint and redraws regions containing moving geometry.
Both renderers use the same larger toy car body, cab and four dark wheels, and larger pet bodies.

The player settles operations in order, checking the resulting hash at every revision.
Gaps, undo, hidden tabs or excessive backlog request a fresh snapshot.
Reduced motion finishes canonical steps while cars and pets remain still.
The preference is observed live. Pause building also stops agents in the current implementation.
Browser appearance and frame timings require the separate human review described in TESTING.md.
The stack prefers locally installed DM Sans, as named in taste-review-3, with system fallbacks.
No font file was supplied, bundled or fetched, so DM Sans rendering is not guaranteed.

## Usage and review

Usage rows contain exactly t, door, tool, ms, in, out and err.
They contain no arguments, world names or error messages. Logs rotate at 5 MiB.
VOXEL_GENESIS_NO_LOG=1 disables logging. Nothing is sent to a remote service.
An initialise row starts a session boundary and records startup time.
Usage summary accepts --since and --fixture and reports calls, bytes, errors and unrecovered errors.
A later success on the same tool recovers pending errors within that session boundary.
The weekly report uses seven days of rows and fixed rules, with at most five ranked suggestions.

## Game seam

src/core/rules.mjs selects none@0 or town@1 per world.
src/games/town.mjs owns the pure town rules, advisor, drawing and derived HUD numbers.
The town board is fixed at 36 by 36 by 16, with 36 lots and 24 turns.
Only the turn operation advances game time; animation ticks never change game state.
The saved game contains t, coins and lots. Stats and the memoised helper score are derived.
The hash includes game state only when present, preserving the three plain-world fixture hashes.
Clone, replay, snapshots and viewer playback retain the rule id and a deep copy of game state.
Town verbs join the existing dispatcher. Decoration operations remain legal without advancing the game.
Open teaches the game, build reports its needs, and the town view lists ranked moves with reasons.
The DOM HUD updates on load and operation changes in both rendering paths, with no idle frame work.
scripts/town-bot.mjs shares the advisor and freezes explicit moves only after matching reference scores.

## Questioned requirements

| Spec item | Verdict | Why |
|---|---|---|
| "8 tools or fewer" | Cut to 4 | Tool definitions are paid for in every session. Save, load, list, catalogue and viewer link fold into `world_open`. Get-block and summary fold into `world_look`. |
| A save tool | Cut | Every build appends to the op log. Nothing to forget. |
| Dry run | Cut | `world_undo` gives the same safety with no second code path. |
| Hollow boxes | Cut | A loose block needs a block under it, so a hollow roof falls in. Buildings are solid, like the towers on the home page. |
| Whole-grid reads | Cut | `world_look` returns one ASCII map capped at 3,000 bytes. |
| Many worlds per session | Cut | One current world per process saves an id argument on every call. |
| Free-form car routes | Cut | A car loops a rectangle. One short op. |
| PNG for agents | Cut | It needs a second software renderer. Agents read ASCII. People read the viewer. |
| Blast | Kept as `pop`, radius 3 or less | It is the one op that shows debris. Copy never uses the engine's word. |
| WebGL renderer | Default, with canvas fallback | Both renderers share the deterministic core. |
| REPL | Kept, first to drop | A compact line-based command interface. |

## Viewer refinements

Viewer discovery verifies the saved token and absolute home, then scans ports 4747 through 4756.
The endpoint reports its home so another save folder cannot supply the fallback viewer.
The page uses a viewport-height column with fixed siblings and a zero-minimum flexible canvas.
Needs are plain DOM chips and receive no idle-frame updates. Endings include the same-seed helper.
Debug step mode advances in bounded physics steps and performs one render per explicit call.
Presentation layers temporarily hide pending stamp cells without advancing physics.
Once all layers arrive, normal settling resumes; reduced motion reveals all pending layers first.
Layer writes use world.set so both renderer caches see the changes. Saved operations are unchanged.

## Neutral parts and the turn pack

Not every game takes turns, so the neutral parts stand alone.
The turn pack is the turn, bot, deck and advisor kinds. It is frozen: its code and wording stay.
The pack is present when a part of any of those four kinds exists. Without it, the play line has
no `| moves N`, the `can` line has no `end`, and with nothing legal the `can` line is left out.
With it, every reply keeps the exact wording it had before.
The acting player is the pack's current player when set, otherwise the first player by id, or
`you` when there are no player parts. No `who` key is written for neutral play.
An action past its `max` is refused as `PATH.max: ID used N of MAX; FIX`. FIX is `use [end]`
with the pack, otherwise `try ID` for another legal action, or `wait`.
A session that has opened a world stays on that world. Only a session that has never opened one
follows `home/current`, so the `call` door and `serve` work as before.
After each primitive op settles, the kit takes one more step only if that settle saw a falling
body, then settles again. A beat that needs dropped blocks completes in the drop's own reply.
Kit-only ops get no extra step, so the 16-beat cap per step holds. The viewer player does the same.
