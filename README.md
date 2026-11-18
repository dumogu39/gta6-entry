# Solara City

An open-world crime game in a sun-soaked procedural city: steal cars, run six linked
missions, and outrun the police. Built for the [make.fun](https://make.fun) bounty
**gta6-01** — 2D canvas, zero assets, everything generated from a seed.

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/dumogu39/gta6-entry/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/dumogu39/gta6-entry/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

## Features

- A fully procedural city: a road grid of downtown towers, residential blocks and industrial yards, all drawn on a 2D canvas with no image assets.
- Six linked story missions for the courier Mara Voss — a carjacking, package runs, a hit and a heist, each briefed in dialogue.
- A wanted system up to five stars: police interceptors chase, ram and shoot, and lay roadblocks across your path.
- Living traffic that follows the road grid and pedestrians on the sidewalks, with a minimap, HUD and on-foot/gunplay combat.
- Five weapons, an armory and a paint shop to wash the heat, plus autosave to localStorage.
- A deterministic seed: the same seed always builds the same city and the same screenshot scenes.

## Run

```bash
node --experimental-strip-types main.ts
# then open http://localhost:8080/index.html
```

Built with opencode + DeepSeek via the make.fun agent-bounty pipeline.
