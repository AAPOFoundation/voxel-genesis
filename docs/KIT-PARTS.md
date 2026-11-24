# Kit parts

[//]: # (COPY-DRAFT)

Use world_look with {"view":"kit"} first. The live catalogue is the first source.
Use {"view":"kit","of":"action"} for one kind. Omitted fields take these defaults.
Each example is one part, passed as the second item of a part operation.

Effects: add, set, flag, stamp, clear, ops, roll, draw, talk, go, if, each, note.
Operators: =, !=, <, <=, >, >=, and, or, not, +, -, *, /, %, min, max.

## place (world)

A named region, or a grid of regions. Cutting it leaves the blocks.

| Field | Type | Default |
|---|---|---|
| at | rect? | `null` |
| grid | grid? | `null` |
| tags | ids | `[]` |
| groups | rects | `{}` |
| props | object | `{}` |
| says | text | `""` |

```json
{"part":"place/lot","at":[1,1,8,8]}
```

## scene (world)

Plain build ops run once when this part is added or replaced.

| Field | Type | Default |
|---|---|---|
| ops | ops | `[]` |
| says | text | `""` |

```json
{"part":"scene/path","ops":[["paint","path",1,1,4,1]]}
```

## store (play)

A number per player or per game, such as cash or score.

| Field | Type | Default |
|---|---|---|
| start | int | `0` |
| min | int | `0` |
| max | int? | `null` |
| per | player\|game | `"player"` |
| says | text | `""` |
| show | bool | `true` |

```json
{"part":"store/cash","start":10}
```

## player (play)

A player, with an optional colour and bot.

| Field | Type | Default |
|---|---|---|
| says | text | `""` |
| colour | block? | `""` |
| bot | id? | `""` |

```json
{"part":"player/you"}
```

## board (play)

Properties and derived values for tagged places.

| Field | Type | Default |
|---|---|---|
| places | id? | `""` |
| props | object | `{"owner":""}` |
| calc | exprs | `{}` |
| mark | ring\|post\|none | `"ring"` |
| ground | block | `"grass"` |

```json
{"part":"board/lots"}
```

## action (play)

A move with conditions, costs and effects. Zero max means no limit.

| Field | Type | Default |
|---|---|---|
| on | text | `"place"` |
| when | conditions | `[]` |
| cost | exprs | `{}` |
| then | effects | `[]` |
| says | text | `""` |
| value | expr | `1` |
| max | uint | `0` |

```json
{"part":"action/save","then":[["add","cash",1]]}
```

## input (play)

A click on a place, or a key, that runs effects by itself, up to 4 a second. An agent fires one
with [in,click,x,y,z] or [in,key,k].

| Field | Type | Default |
|---|---|---|
| on | click\|key | `"click"` |
| at | id? | `""` |
| key | text | `""` |
| then | effects | `[]` |
| says | text | `""` |

```json
{"part":"input/tap","at":"lot","then":[["add","cash",1]]}
```

## dice (play)

Seeded dice. A roll effect sets roll.

| Field | Type | Default |
|---|---|---|
| sides | positive | `6` |

```json
{"part":"dice/cube"}
```

## deck (play)

Weighted cards drawn each round, or by an effect.

| Field | Type | Default |
|---|---|---|
| draw | round\|none | `"round"` |
| cards | cards | `[]` |

```json
{"part":"deck/news"}
```

## turn (play)

Player order, moves and end effects. Zero means no limit.

| Field | Type | Default |
|---|---|---|
| order | ids | `[]` |
| moves | uint | `0` |
| last | uint | `0` |
| end | effects | `[]` |
| says | text | `"turn"` |

```json
{"part":"turn/round","moves":3}
```

## goal (play)

A condition or final score, with an optional ending.

| Field | Type | Default |
|---|---|---|
| when | conditions | `[]` |
| score | expr? | `null` |
| says | text | `""` |
| win | bool | `true` |
| ends | bool | `true` |

```json
{"part":"goal/done","when":[[">=","cash",10]]}
```

## bot (play)

Rules for choosing legal affordable moves.

| Field | Type | Default |
|---|---|---|
| moves | uint | `1` |
| rules | rules | `[]` |

```json
{"part":"bot/steady"}
```

## advisor (play)

How many legal affordable moves to list.

| Field | Type | Default |
|---|---|---|
| top | uint | `5` |

```json
{"part":"advisor/help"}
```

## beat (story)

An objective that follows another beat and completes on a condition.

| Field | Type | Default |
|---|---|---|
| chapter | id? | `""` |
| after | id? | `""` |
| when | conditions | `[]` |
| goal | text | `""` |
| says | text | `""` |
| then | effects | `[]` |

```json
{"part":"beat/first","when":[[">=","cash",1]]}
```

## voice (talk)

A character with a name and colour.

| Field | Type | Default |
|---|---|---|
| says | text | `""` |
| colour | block | `"amber"` |

```json
{"part":"voice/pip"}
```

## talk (talk)

Lines and choices, opened by a trigger or effect.

| Field | Type | Default |
|---|---|---|
| voice | id? | `""` |
| on | trigger | `""` |
| lines | texts | `[]` |
| asks | asks | `[]` |

```json
{"part":"talk/hello","voice":"pip"}
```

## tune (music)

Sixteenth steps: degree, . rest, - hold. Waves: sine triangle square.

| Field | Type | Default |
|---|---|---|
| bpm | bpm | `84` |
| scale | scale | `[0,2,4,7,9]` |
| root | int | `60` |
| voices | voices | `[{"wave":"triangle","oct":0,"vol":5,"steps":""}]` |

```json
{"part":"tune/stroll","voices":[{"wave":"triangle","oct":0,"vol":5,"steps":"0 . 2 ."}]}
```

## mood (music)

The highest ranked matching mood selects a tune.

| Field | Type | Default |
|---|---|---|
| tune | id? | `""` |
| when | conditions | `[]` |
| rank | int | `0` |

```json
{"part":"mood/calm"}
```
