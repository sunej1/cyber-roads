# Cyber Roads

Fly a hovercar through Meridian City in your browser. [Play Cyber Roads](https://sunej1.github.io/cyber-roads/).

**Explore Meridian** puts you at the controls of a stationary hovercar at Harbor Approach. **Start guided flight** takes you between Meridian’s towers and across its waterfront before following the south causeway. **Start district tour** picks up at the canal. The tour passes the Sable Locks, Keystone Exchange, Lift 24, Kiln Nine, and Juniper Reservoir as it winds through downtown blocks, a freight belt, and wooded outskirts.

The city map and local radar show your heading. The radar also shows the streets, rail lines, bridges, and landmarks loaded around the vehicle. The route line appears during guided flight. Arterial roads connect across tile boundaries. Shops face the surrounding streets, canal markets lead to waterfront walks, freight yards sit beside the rail line, and housing follows quieter loops. Civic squares open off the main streets.

| Control | Action |
| --- | --- |
| W / S or up / down | Throttle / brake |
| A / D or left / right | Steer |
| Space / Ctrl or E / Q | Climb / descend |
| Shift + throttle | Boost |
| C or the camera button | Chase / nose camera |
| Drag the 3D view | Look around |
| V | Take control or join guided flight |
| R | Optional recovery to a nearby safe air lane at rest. You keep control. |
| Esc | Pause / resume |

The pause menu lets you resume in the current mode or restart at Harbor Approach. Touch devices have on-screen flight controls. The 3D view requires a browser with WebGL 2.

## Rendering

**Ray effects** switches wet-surface reflections and contact shadows. It starts on for desktop browsers with HDR render-target support. Nearby reflection rays sample the frame’s depth buffer. Separate mirrored views of the street and water supply reflections of buildings outside the main view. The two views refresh on alternating frames. Rain, low fog and local lighting run in either mode. Reduced-motion settings hide rain streaks. [Three.js Reflector](https://threejs.org/docs/pages/Reflector.html).

Building shells stream with the city tiles. A second hierarchy groups storefront and façade geometry into small clusters. The camera selects clusters by projected detail size, with frustum culling, hysteresis, and fixed limits on live geometry. As you approach, the renderer adds fitting details such as door hardware, windowsills, shutters, and vent housings to shared instance buffers. This is a browser-scale adaptation of [Nanite’s cluster and screen-space detail ideas](https://dev.epicgames.com/documentation/en-us/unreal-engine/nanite-virtualized-geometry-in-unreal-engine).

The surface atlas was generated with the built-in ImageGen tool as four orthographic materials for cast concrete, gunmetal cladding, block masonry, and wet asphalt. Close window panes show view-dependent interiors with ceilings, blinds, and furniture. At a distance they use filtered façade textures.

Ground materials layer scanned surface detail with larger stains, repairs, and wear patterns that are visible in flight. The asphalt and meadow maps come from Cozy Roads. The [worn asphalt](https://polyhaven.com/a/worn_asphalt), [concrete pavers](https://polyhaven.com/a/square_concrete_pavers), [gravel](https://polyhaven.com/a/gravel_floor_03), and meadow source assets are [Poly Haven CC0 scans](https://polyhaven.com/license).

## Develop locally

Use Node.js 22.12 or later. The game uses Vite, Three.js, and WebGL 2. The buildings, landscape, and vehicle are generated in code. The opening tour follows an arc-length-sampled 3D spline. Beyond the harbor, deterministic 640 m tiles stream around the player, and buildings leave clearance along the outbound air lanes.

```sh
npm ci
npm run dev
npm test
npm run build
```
