# VOXEL ARENA

A fast, browser-based voxel FPS deathmatch — a fan tribute to [poxel.io](https://poxel.io), built from scratch with vanilla JavaScript and [three.js](https://threejs.org). No build step, no dependencies, no server — just open it and play.

> Fan-made tribute. Not affiliated with poxel.io.

## Features

- **FFA deathmatch** against 7 AI bots with patrol / hunt / engage behavior, line-of-sight targeting, strafing, and three difficulty tiers
- **5 weapons**: assault rifle, shotgun (8 pellets), sniper with scope zoom, rocket launcher with splash damage, pistol
- **3 classes**: Assault (balanced), Scout (fast + quick dash), Heavy (tanky + blast resistant)
- **Movement tech**: bunny-hop friendly jumping, dash (Q), rocket jumping, grenade cooking
- **Full FPS toolkit**: ADS, headshot multipliers, reloads, hitmarkers, kill feed, multi-kill announcements
- **HUD**: dynamic crosshair, radar minimap, live scoreboard (hold Tab), FPS meter, damage vignettes
- Procedurally built arena — central platform, corner towers, containers, crates, drifting clouds
- All sound effects synthesized at runtime with WebAudio — zero asset downloads
- Settings (sensitivity, volume, pixelate mode) persisted in localStorage

## Controls

| Key | Action |
| --- | --- |
| WASD | Move |
| Space | Jump |
| Shift / C | Run / Crouch |
| Q or X | Dash |
| LMB / RMB | Fire / Aim |
| E | Hold to aim |
| R | Reload |
| 1–5 / Wheel | Select weapon |
| G | Grenade |
| Tab | Scoreboard |
| M | Mute |

## Run it

Any static file server works:

```sh
python3 -m http.server 8080
# then open http://localhost:8080
```

(Opening `index.html` directly via `file://` also works in most browsers.)

## Project structure

```
index.html          entry point + all UI markup
css/style.css       HUD & menu styling
js/main.js          game loop, match flow, projectiles, explosions
js/player.js        FPS controller: movement, shooting, weapons
js/bot.js           bot AI, names, nametags
js/world.js         arena geometry, colliders, nav points, spawns
js/weapons.js       weapon stats + blocky viewmodels
js/effects.js       particles, tracers, impacts, explosions
js/audio.js         WebAudio-synthesized SFX
js/hud.js           DOM/canvas HUD rendering
vendor/three.min.js bundled three.js
```

## License

MIT
