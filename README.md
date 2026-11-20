# Vice Harbor

An original open-world crime game that runs in a desktop browser from static files. No build step, no network requests, no external assets — everything drawn procedurally on a 2D canvas.

## Play

```bash
npx tsx serve.ts
# open http://localhost:8080
```

**Controls:** WASD/arrows move · E enter/exit vehicle · Space shoot/handbrake · ESC pause · ENTER start

## Features

- Procedural city: road grid, blocks, buildings, palms, sunset lighting
- On foot and by car, with driving physics and a speedometer
- Traffic and pedestrians
- Steal any car and drive it
- 0–5 star wanted level with police cruisers that spawn and pursue
- 4 chained missions with a story intro and cash rewards
- Combat with particles, blood and tyre-skid effects
- HUD with minimap, health, cash, wanted stars
- Start, pause, game-over and victory screens

## Source layout

| File | Job |
|---|---|
| `config.js` | constants, palette, city identity |
| `random.js` | seeded PRNG + math helpers |
| `world.js` | procedural city generation + collision |
| `entities.js` | Player, Pedestrian, Vehicle, PoliceCar |
| `combat.js` | bullets, particles, damage |
| `missions.js` | story intro + mission state machine |
| `input.js` | keyboard/mouse |
| `render.js` | camera, city and entity drawing |
| `hud.js` | minimap, bars, wanted stars, screens |
| `main.js` | game loop + state machine |

## Badges

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/axedotid/makefun-gta6-vice-harbor/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/axedotid/makefun-gta6-vice-harbor/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
