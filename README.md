# Afterhour

Fly a hovercar through Meridian City in your browser. [Play Afterhour](https://sunej1.github.io/cyber-roads/).

The guided flight enters from the south harbor, passes between downtown towers, crosses a civic square and park, climbs to Crown Heights, and sweeps offshore. It then leaves Meridian City on a causeway into a city that keeps generating new districts. Take the controls any time to explore in any direction. Hover taxis, air shuttles, street cars, and pedestrians follow their own routes.

| Control | Action |
| --- | --- |
| W / S or up / down | Throttle / brake |
| A / D or left / right | Steer |
| Space / Ctrl or E / Q | Climb / descend |
| Shift + throttle | Boost |
| C or the camera button | Chase / nose camera |
| Drag the 3D view | Look around |
| V | Switch between manual and guided flight |
| R | Return to the nearest point on the route |
| Esc | Pause / resume |

Touch devices have on-screen flight controls. The 3D view requires a browser with WebGL 2.

## Develop locally

Use Node.js 22.12 or later. The game uses Vite, Three.js, and WebGL 2. The buildings, landscape, and vehicle are generated in code. The opening tour follows an arc-length-sampled 3D spline. Beyond the harbor, deterministic 640 m tiles stream around the player, and buildings leave clearance along the outbound air lanes.

```sh
npm ci
npm run dev
npm test
npm run build
```
