# Engine roadmap

Measurements for 0.5.1.

## Goal
An engine for AI agents to build a voxel world from scratch. Optimised compute and zero lag are a
sub-goal. Scripts over AI compute: the framework stays deterministic.

## Where it stands (0.5.1)
- Four tools (`world_open`, `world_build`, `world_look`, `world_undo`) over MCP and a command-line door.
  Guide: docs/BUILDING-A-WORLD.md.
- Three ways to start: from scratch, `from` a proven world (small-town, tiny-garden, hill-village) in
  one call, or `from` an absolute PNG path (same bytes, same world, no AI).
- Agents build a seaside town or a park in 2 to 3 calls, with no size guess and zero refused calls.
  Larger worlds increase the size of look replies.
- Lag lines pass (0.5.0: build max 27.8 ms, Chrome frame gap p95 16.8 ms).
- Caps, no raise: tree 856 KiB (docs/ not counted), 144 files, tool bytes 2,480, world_open description
  224 characters.

## Next program (not started; each item needs a byte estimate first)
1. Accuracy: "six houses" is read as six buildings. On a bare request Claude built a shop as one of the
   six in 4 of 6 runs (one or two shops in every failing run, checked by stamp). Candidates: a short
   kind word in the prefab list (`house`, `cottage` = homes), or a build reply that counts homes.
2. Parts library: two or three tree shapes and heights; house roof and chimney
   variants by default; a bridge with rails and a slight arch; benches with a back. A new block set
   moves world hashes, so it is a set version (base@4), not a patch.
3. The car: one cell, the agent's colour, often hidden behind a house; agents cannot see it in the top
   or info views and look again to find it. Make it easy to see in the viewer and name it in a view.
4. Slimmer looks: a top look is about 1.3 KB on 32 x 32 and 1.9 KB on 40 x 40, and agents usually
   request one. Shrink the reply without losing what a look can show.
5. Edge stamps: agents can place a pine past the world edge, causing a refused call.
   In 2 of 12 trials, agents opened `from: small-town` for a seaside town, then started fresh.
6. Photos lane (lane B of the image pathway, parked): the agent fills a closed sheet a script expands.
7. Faster one-off opens: hill-village 110 ms, a 12-megapixel PNG 424 ms.
8. Neighbour counts and a real-time clock stay parked (meaning and checkpoints remain undecided).

## Known verification gaps
- Acceptance in the live connector and `bash check.sh` on a Mac remain unchecked.
  check.sh has never run on macOS or Linux.
- Phones, Safari and Firefox by hand; sound once in a real browser.
- Export paths on macOS or Linux (Windows prints a backslash in `kit`).
- Mover snaps its long side at rest 0.13 s late (polish 1): polish or accept.
