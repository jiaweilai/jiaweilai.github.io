# na-polune.github.io — Neon Rain

a cyberpunk city in the rain, rendered live with [three.js](https://threejs.org).

## Layout

| Path | What it is |
| --- | --- |
| `index.html` | The main site: hero, identity, work, scenarios, contact. Scroll drives a camera flight through the city. |
| `js/main.js` | Renderer, camera path, lightning, HUD wiring. |
| `js/city.js` | Procedural skyline (one instanced draw call with shader windows), neon signs, billboards, wet-street reflector, hologram. |
| `js/rain.js` | GPU rain streaks and ground splashes that follow the camera. |
| `js/traffic.js` | Flying vehicles on sky lanes with light trails. |
| `js/post.js` | Bloom plus a CRT/video pass: chromatic aberration, scanlines, glitch, grain, lens rain. |
| `js/audio.js` | Procedural rain and thunder with WebAudio (off by default). |
| `js/config.js` | Quality tiers and world constants. |
| `scenarios/polune-city.html` | The earlier isometric 2D city simulation, kept as a demo scenario. |