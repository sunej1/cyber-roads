import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { randomFor } from './flight.js';
import { box, neon } from './scene-parts.js';

const shuttle = new THREE.CylinderGeometry(.79, 1, 1, 6);
const car = new THREE.CylinderGeometry(.72, 1, 1, 8, 1, false, Math.PI / 8);
const person = new THREE.CylinderGeometry(.55, .8, 1, 5).scale(.53, 1.55, .44);
const white = neon('#fff0be', 3.3);
const roadLamps = new THREE.MeshBasicMaterial({ vertexColors: true });
const hull = new THREE.MeshStandardMaterial({ roughness: .41, metalness: .48 });
const canopy = new THREE.MeshStandardMaterial({ color: '#314957', roughness: .24, metalness: .56 });
const exhaust = neon('#85e0ff', 1.9);
const pedestrian = new THREE.MeshStandardMaterial({ roughness: .8 });
const paint = ['#536476', '#d3b65d', '#515752', '#a04334', '#b9bdad', '#42575a'];
const point = new THREE.Vector3();
const ahead = new THREE.Vector3();

// Bake the fixed offsets so paired lights and hull details share their material's draw call.
function shape(...parts) {
  return mergeGeometries(parts.map(([geometry, x, y, z, width, height, depth]) =>
    geometry.clone().scale(width, height, depth).translate(x, y, z)));
}

function colorGeometry(geometry, color) {
  const colors = new Float32Array(geometry.attributes.position.count * 3);
  for (let i = 0; i < colors.length; i += 3) color.toArray(colors, i);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

const airframe = shape(
  [shuttle, 0, 0, -.29, 1.65, .92, 4.16],
  [box, 0, -.07, -3.71, 1.59, .39, 1.19],
  [box, -.99, -.20, 1.02, 1.68, .54, 4.44],
  [box, .99, -.20, 1.02, 1.68, .54, 4.44],
  [car, 0, .37, 2.49, .71, .55, 1.24],
);
const flightDeck = shape([shuttle, 0, .73, -.66, 1.31, 1.05, 2.42]);
const thrustPorts = shape(
  [box, -1.27, -.21, 3.24, .72, .24, .16],
  [box, 1.27, -.21, 3.24, .72, .24, .16],
);
const landingLights = shape(
  [box, -.62, .02, -4.24, .40, .19, .49],
  [box, .62, .02, -4.24, .40, .19, .49],
);

const chassis = shape(
  [car, 0, -.09, 0, 1.35, .76, 2.63],
  [box, 0, -.10, -2.23, 2.13, .36, .47],
  [box, 0, -.13, 2.25, 2.19, .38, .46],
);
const cabin = shape(
  [car, 0, .54, .12, 1.08, .66, 1.41],
  [box, 0, -.34, 0, 2.12, .24, 4.43],
);
const headlights = shape(
  [box, -.79, .04, -2.31, .48, .19, .49],
  [box, .79, .04, -2.31, .48, .19, .49],
);
const tailLights = shape(
  [box, -.84, -.04, 2.32, .39, .20, .48],
  [box, .84, -.04, 2.32, .39, .20, .48],
);
const roadLights = mergeGeometries([
  colorGeometry(headlights, white.color),
  colorGeometry(tailLights, new THREE.Color('#ff562f').multiplyScalar(3.2)),
]);

export function addMovingTraffic(parent, circuits, roads, footpaths, seed) {
  const random = randomFor(seed);
  const actors = [];
  circuits.forEach(({ curve, count, speed, length }) => {
    for (let slot = 0; slot < count; slot++) {
      const size = (slot % 5 === 0 ? 1.55 : .77 + random() * .51);
      actors.push({ curve, speed: speed / length, phase: (slot + .24 + random() * .39) / count, size });
    }
  });
  const airCount = actors.length;
  roads.forEach(road => {
    const length = road.end - road.start;
    const count = Math.max(1, Math.floor(length / 175));
    const speed = (11 + random() * 12) / length;
    for (let slot = 0; slot < count; slot++) {
      actors.push({ road, speed, phase: (slot + random() * .69) / count, size: .77 + random() * .57 });
    }
  });

  const poses = actors.map(() => ({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0, scale: 1 }));
  const dummy = new THREE.Object3D();
  dummy.rotation.order = 'YXZ';
  const parts = [];
  const part = (geometry, material, count, start, colors = false) => {
    if (!count) return;
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    if (colors) {
      for (let i = 0; i < count; i++) mesh.setColorAt(i, new THREE.Color(paint[Math.floor(random() * paint.length)]));
    }
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    parent.add(mesh);
    parts.push({ mesh, count, start });
  };
  part(airframe, hull, airCount, 0, true);
  part(flightDeck, canopy, airCount, 0);
  part(thrustPorts, exhaust, airCount, 0);
  part(landingLights, white, airCount, 0);
  const roadCount = actors.length - airCount;
  part(chassis, hull, roadCount, airCount, true);
  part(cabin, canopy, roadCount, airCount);
  part(roadLights, roadLamps, roadCount, airCount);

  const walkers = [];
  for (const [x, z, toX, toZ, count] of footpaths) {
    const angle = Math.atan2(toX - x, z - toZ);
    const length = Math.hypot(toX - x, toZ - z);
    for (let i = 0; i < count; i++) walkers.push({
      x, z, toX, toZ, angle, speed: (1.05 + random() * .67) / length, phase: (i + random() * .78) / count,
      lateral: random() * 2.8 - 1.4, size: .84 + random() * .2,
    });
  }
  const walkersAt = poses.length;
  walkers.forEach(() => poses.push({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0, scale: 1 }));
  part(person, pedestrian, walkers.length, walkersAt, true);

  return time => {
    actors.forEach(({ curve, road, phase, speed, size }, index) => {
      const progress = (time * speed + phase) % 1;
      const pose = poses[index];
      if (curve) {
        curve.getPointAt(progress, point);
        curve.getPointAt((progress + .0014) % 1, ahead).sub(point);
        pose.x = point.x;
        pose.y = point.y + Math.sin(time * 1.1 + index) * .58;
        pose.z = point.z;
        pose.yaw = Math.atan2(-ahead.x, -ahead.z);
        pose.pitch = Math.atan2(ahead.y, Math.hypot(ahead.x, ahead.z));
        pose.scale = size;
      } else {
        const { horizontal, lane: cross, start, end, direction, path }=road;
        if (path) {
          const dx=path.toX-path.x, dz=path.toZ-path.z;
          const at=direction===1?progress:1-progress;
          const offset=direction*(path.kind==='avenue'?3.4:1.85)/(end-start);
          pose.x=path.x+at*dx+dz*offset;
          pose.z=path.z+at*dz-dx*offset;
          pose.y=path.bridge?1.53:.99;
          pose.yaw=Math.atan2(-dx*direction,-dz*direction);
        } else {
          const across=THREE.MathUtils.lerp(start,end,direction===1?progress:1-progress);
          pose.x=horizontal?across:cross;
          pose.y=.92;
          pose.z=horizontal?cross:across;
          pose.yaw=horizontal?-direction*Math.PI/2:direction===1?Math.PI:0;
        }
        pose.scale = size * Math.min(1, progress * 34, (1 - progress) * 34);
      }
    });

    walkers.forEach(({ x, z, toX, toZ, angle, speed, phase, lateral, size }, index) => {
      const roundTrip = (time * speed + phase) % 2;
      const progress = roundTrip <= 1 ? roundTrip : 2 - roundTrip;
      const pose = poses[walkersAt + index];
      pose.x = THREE.MathUtils.lerp(x, toX, progress) + Math.cos(angle) * lateral;
      pose.z = THREE.MathUtils.lerp(z, toZ, progress) + Math.sin(angle) * lateral;
      pose.y = 1.75 + Math.sin(time * 8 + index) * .105;
      pose.yaw = -angle;
      pose.scale = size;
    });
    for (const { mesh, count, start } of parts) {
      for (let i = 0; i < count; i++) {
        const { x, y, z, pitch, yaw, scale } = poses[start + i];
        dummy.rotation.set(pitch, yaw, 0, 'YXZ');
        dummy.position.set(x, y, z);
        dummy.scale.setScalar(scale);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  };
}
