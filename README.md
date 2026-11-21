# Vice Harbor

An original open-world crime game that runs in a desktop browser from static files. No build step, no network requests, no external assets — the whole city, its traffic, its police and its sunset lighting are drawn procedurally on a 2D canvas.

## Play

```bash
npx tsx serve.ts
```

Then open the printed URL. **WASD/arrows** move · **E** enter or exit a vehicle · **Space** shoot / handbrake · **R** change radio station · **ESC** pause · **ENTER** start · **C** continue a saved game.

## What is in it

- A procedural city on a road grid, with blocks, buildings, palms and stunt ramps
- Travel on foot and by car, with driving physics, drift and a speedometer
- Traffic and pedestrians going about their day
- Any car can be stolen and driven
- A 0–5 star wanted level, with police cruisers that spawn and pursue
- Six chained missions with a story intro and cash rewards
- Combat with muzzle flashes, blood, explosions and tyre marks
- A day/night cycle where windows glow and streetlights pool light after dark
- Wanted decay: stay out of sight for 20 seconds and a star drops off
- A radio with three fictional stations and their own track lists
- Autosave to localStorage every 15 seconds, with Continue on the title screen
- A HUD with minimap, health, cash, wanted stars and the current objective

## Source layout

| File | Job |
|---|---|
| `config.js` | constants, palette, city identity |
| `random.js` | seeded PRNG and math helpers |
| `world.js` | city generation, collision, ramps |
| `entities.js` | Player, Pedestrian, Vehicle, PoliceCar |
| `combat.js` | bullets, particles, damage |
| `missions.js` | story intro and the mission state machine |
| `input.js` | keyboard and mouse |
| `render.js` | camera, city and entity drawing, sky |
| `hud.js` | minimap, bars, wanted stars, screens |
| `radio.js` | stations and now-playing |
| `savegame.js` | localStorage save and load |
| `main.js` | game loop and state machine |

## Badges

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/axedotid/makefun-gta6-vice-harbor/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/axedotid/makefun-gta6-vice-harbor/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
