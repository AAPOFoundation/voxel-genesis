# Testing

Run all four suites without installing packages:

```sh
bash check.sh
node scripts/check.mjs --changed
```

The check runner starts independent suites concurrently and prints their summaries in a stable order.
It reports total seconds and exits nonzero on failures or missing summaries.
The changed mode includes staged, unstaged and untracked paths relative to HEAD.
Unknown Git state selects all suites. No changes selects zero suites.
The CI matrix runs Node 20 and 22 on Ubuntu and Windows.
Local results do not prove that remote matrix passed.

## Lint

Checks cover dependency-free packaging, vendor hash, catalogue names, tool schemas, copy and loopback-only code.
Source, viewer, CLI, scripts and tests have a 100-character line limit and 400-line file limit.
The check runner alone may spawn local Git and suite processes outside tests.
Tool definitions plus server instructions share a 2,500-byte budget.
README operation examples and catalogue names are checked against the registered sets.

## Kit checks

[//]: # (COPY-DRAFT)

The kit suites cover normalisation, atomic edits, replay, turns, story, speech and music.
Package D adds kit-games, kit-proves, dev-cost, kit-review and an additional kit-mix case.
kit-docs regenerates the kind reference and replays all five guide recipes and README JSON.
kit-arc compares rendered cells and panels after each call, including the opening call.
Every script changes visible content in at least 80 percent of calls.
The first story objective, or the courier delivery goal, completes within three calls.
MCP job budgets count argument bytes plus returned text, excluding protocol framing and setup.
The caps are 4 calls/5,000 bytes, 1/400, 1/300 and 2/900, with zero refused calls.
Run node scripts/kit-docs.mjs to check generated docs, or add --write to regenerate them.
The script freezer accepts --write followed by a bundle id and refuses an existing expectation.
Run all checks on the committed tree and a fresh local clone. Tests need no other Git branch.
Automated checks do not establish appearance, sound quality or whether a game is fun.

## Check your own game

[//]: # (COPY-DRAFT)

Run `node bin/voxel-genesis.mjs check ./voxel-kit/my-game.json` or `node scripts/game-check.mjs <bundle.json>`.
Flags: `--seeds 12`, `--turns 40`, `--json`, `--only=lint|invariants|ab|taste`.
Add `--script game.json` for fixed `{open, batches}`, including building moves outside advice.
The checked bundle supplies size and rules; scripts keep their opening seed (default 1).
Every seed checks advice determinism and legality. A script proves completion within the cap;
without one, an ending goal the bot cannot reach fails invariants. Scripts replay twice.
Add `--ab other.json` for two advice bots, or omit it for an idle baseline.
Rows report the first human seat's wins, mean score, range, turns, bytes, actions and first beat.
Beat timing counts play batches: zero means opening, `-` means none. Bytes are arguments plus replies.
A/B fails only on crashes unless `--win-band 0.3,0.8` checks each variant's human win rate.
Taste uses script progress when supplied, and counts action use across seeds plus the script.
The shared kit-arc measure includes opening. Objectives must remain visible until the last beat.
Property reports unused action/divest because advice never selects its zero value.
Any failure returns exit status 1, otherwise 0. Sections keep running after findings.
Import `gameCheck({bundle, script, ab, seeds, turns, only, winBand})` for compact result data.
Bundle and script accept paths or parsed objects. Temporary homes stay in a scratch folder (git-ignored).
Manual taste review still covers appearance, sound and play quality.
`check kit/courier.json` without `--script` exits 1 on taste (first-objective), which tests/game-check.mjs treats as intended.

## Invariants

The harness uses a scratch folder (git-ignored) and never needs the user's saved worlds.
Core assertions live in core-cases.mjs; transport and playback assertions live in door-cases.mjs.
The top-level harness also runs dispatch and renderer regression checks.

| Area | Assertions |
|---|---|
| Determinism | Repeated fixtures and frozen hash/count/revision records agree |
| Batch splitting | One batch, reference batches and individual operations reach the same hash |
| Physics | Drops stack, unsupported blocks fall, water receives blocks, leaves cling and fixed spans remain |
| Prefabs | All twelve prefabs settle at four turns within their footprints, with rock slope footings |
| Rejections | Every negative case stays within 200 bytes and leaves state, revision and log unchanged |
| Atomicity | A bad fiftieth operation rejects the whole batch |
| Storage | Reopen, RLE, undo, redo, monotonic revision and fresh backups |
| Budgets | All tool replies and map views stay within their documented limits |
| MCP | Negotiation, startup ordering, notifications, ping, bad JSON and oversized-line recovery |
| Doors | MCP, HTTP, REPL and CLI values agree after viewer-address normalisation |
| HTTP | Loopback bind, Host, Origin, routes, content type, body cap and state hash |
| Playback | Uneven frame times and reduced motion preserve every revision hash |
| Writers | Alternating processes agree and the viewer receives ordered revision events |
| Usage | Exact seven keys, no argument content, opt-out and summary rows |
| Game seam | A temporary test system and operation run through the same core |

Dispatch checks add indexed error suggestions, no-op stamps, life counts and physics locations.
They verify set headers, set-sensitive hashes, warm work counters and the combined tool budget.
Project configuration tests preserve unrelated entries and replay three calls through each written configuration.
Fixture logs exercise review rankings, reply targets and recovery counts.
Camera mathematics covers both requested widths at 16 angles at the fitted starting zoom.
Polish checks cover phone width fill, centred zoom limits and working first zoom-button presses.
Canvas cache checks cover reuse, invalidation and disposal.
Boot checks trace actual modules and compare seven paired first-reply samples against bare Node.
The boot ratio must be at most 3.5; tool listing loads at most eight application modules.

Run a focused invariant group with --only=physics-facts,prefabs or another rule name.
The frozen reference records are written by node tests/invariants.mjs --freeze.
Do not edit frozen reference records by hand.

## Engine and taste

Engine assertions cover the vendored world's physics, deterministic saves and simple agents.
Taste checks cover the permitted palette, motion caps, reduced motion, wording and family-safe catalogue names.
Node render probes measure mesh and dynamic geometry work; they do not execute a GPU.
Renderer doubles check resource lifetime, patch uploads, viewer selection and fallback.

Open /?bench=1 on the hill village to record 600 real browser frames.
The viewer writes renderer, p50, p95, gapP95, frames, width, height and device scale to bench.json.
The browser target is render p95 at most 8 ms and frame-gap p95 at most 18 ms.
The canvas fallback target from the taste review is p95 below 16.7 ms.
A proxy timing cannot establish either target.
The town canvas proxy uses CachedCanvasRenderer, the actual fallback, and requires one static rebuild.
Its warm median stays below 6 ms; this excludes browser paint and GPU costs.
HUD callbacks are checked during load and playback, including zero callbacks across 120 idle frames.
The live taste round requires an average of at least eight, with no criterion below six.

## Town game

tests/town-cases.mjs covers the pack seam, exact first turns, idle ending and advisor reference scores.
It checks deterministic replay, single-batch equivalence, CLI replay, undo and atomic refusals.
Every batch stays settled with no falls, losses or sinking; life stays within ten definitions.
Playback hashes and HUD numbers agree after every revision with reduced motion on and off.
Open is capped at 1,200 bytes, town builds at 500 and town views at 900.
The complete game averages at most 450 argument-plus-reply bytes per turn, with four tools unchanged.
Run node scripts/town-bot.mjs 7 for scores and byte measurements.
The fixture writer refuses existing files unless an authorised --refreeze is requested.
Both write modes check the reference simulation before writing.
The family taste round remains a separate review; automated checks do not establish that play is fun.

## Catalogue and taste-review regressions

tests/polish.mjs replays all four base@1 fixtures against preserved expectations.
It checks legacy session reopen, undo/redo, viewer snapshots and version-specific RLE bounds.
New-world expectations are frozen for base@3. Both older sets retain their recorded hashes.
base-two-expected.json preserves the old explicit town moves and the base@2 reference records.
Craft assertions cover doors, two cottage window cells, plain roofs and the two-block chimney.
Both renderer paths receive the same car and pet parts; reduced motion leaves their positions fixed.
Build hints cover partial and zero scatter placement, repetition and bridge approaches at all turns.
Loopback tests verify CLI open/info links, missing/stale viewer records and closed-server fallback.
The served module import graph and favicon are requested cleanly without 400 or 403 responses.
This checks route availability, not a real browser console or final visual approval.

## Review controls and viewer checks

Open the local viewer with /?step=1 to disable its automatic animation loop.
From the browser console, window.genesisStep(seconds) advances playback and paints exactly once.
It returns {busy, bodies, rev}. Try 1/60 for a fall frame, or 0 to paint without advancing.
Normal pause and reduced-motion settings still apply. A full requested duration uses small steps.
Stamp and town builds arrive by height layer, 80 ms apart; reduced motion finishes them at once.

tests/viewer-controller.mjs uses the existing DOM and GL doubles to check step mode, falls,
one render per call, paused layers, reduced motion, revision completion and no scheduled frames.
tests/layout.mjs computes fixed-height budgets from the shipped CSS and worst-case HUD wording.
It checks 1280x800 and 375x812, including wrapped buttons, needs and the final line.
It also requires a viewport-height flex column, zero canvas minimum and fixed-height siblings.
This conservative text-width estimate complements a live browser check; it is not a screenshot.

Advice checks try every suggested move through validation across twelve helper games.
They cover affordability, varied kinds, actual needs and waking a home within two road moves.
Discovery checks cover a closed recorded port, malformed or missing records, other save folders
and the live fallback range 4747 through 4756. All requests stay on loopback.

For usage and weekly reviews:

```sh
node scripts/usage-summary.mjs --since 0 --fixture small-town
node scripts/weekly-review.mjs
```

The weekly report lists errors, bytes, slow calls and up to five fixed-rule suggestions.
It writes reviews/YYYY-MM-DD.md. An empty log prints no data and exits successfully.
