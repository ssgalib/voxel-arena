# VOXEL ARENA

A fast, browser-based voxel FPS deathmatch — a fan tribute to [poxel.io](https://poxel.io), built from scratch with vanilla JavaScript and [three.js](https://threejs.org). No build step, no dependencies, no server — just open it and play.

> Fan-made tribute. Not affiliated with poxel.io.

## Features

- **Online multiplayer** — peer-to-peer over WebRTC (no server): host a private match and share the 5-char code; up to 7 players plus bot fill
- **FFA deathmatch** against AI bots with patrol / hunt / engage behavior, line-of-sight targeting, strafing, and three difficulty tiers
- **5 weapons**: assault rifle, shotgun (8 pellets), sniper with scope zoom, rocket launcher with splash damage, pistol
- **3 classes**: Assault (balanced), Scout (fast + quick dash), Heavy (tanky + blast resistant)
- **Movement tech**: bunny-hop friendly jumping, dash (Q), rocket jumping, grenade cooking, sprint & crouch
- **Pickups**: health packs and grenade restocks around the map; quad damage contested at the center platform
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

## Multiplayer

Click **MULTIPLAYER — HOST / JOIN** in the menu:

- **Host**: creates a private match and shows a room code (e.g. `X7K2M`). Share it; joined players appear in the lobby. Press START when ready.
- **Join**: enter a code and wait for the host to start.

How it works:

- Pure **peer-to-peer WebRTC** (via [trystero](https://github.com/sey/trystero), vendored in `vendor/trystero.js`) with signaling over public Nostr relays — no game server, works on any static host
- The **host is authoritative**: it simulates bots, validates hits, awards damage/kills, owns pickups, projectiles' splash damage, and match end
- Clients fully predict their own movement and shots (~30 Hz input / 20 Hz snapshots); remote players render interpolated at ~120 ms
- Bots backfill to 8 total combatants; difficulty follows the host's menu selection
- Pausing mid-match only opens the menu — the online match keeps running
- Late joiners are rejected once a match is running; if the host leaves, everyone returns to the menu

## Pickups

- **Health packs** (green cross, 4 spots) restore +40 HP, respawn after 12s
- **Grenade restock** (amber, 4 spots) refills all 3 grenades, respawns after 15s
- **Quad damage** (purple octahedron, center platform) doubles your damage for 25s, respawns after 45s

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
js/main.js          game loop, match flow, netplay glue, projectiles, explosions
js/player.js        FPS controller: movement, shooting, weapons
js/bot.js           bot AI, names, difficulty tiers
js/avatar.js        shared character mesh + nametag builder
js/netplayer.js     networked entities (host-side avatar, client-side ghost)
js/net.js           trystero room/protocol adapter
js/world.js         arena geometry, colliders, nav points, spawns
js/weapons.js       weapon stats + blocky viewmodels
js/pickups.js       health / grenade / quad pickups
js/effects.js       particles, tracers, impacts, explosions
js/audio.js         WebAudio-synthesized SFX
js/hud.js           DOM/canvas HUD rendering
vendor/three.min.js bundled three.js
vendor/trystero.js  bundled WebRTC matchmaking (Nostr signaling)
```

## License

MIT
