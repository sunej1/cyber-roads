import * as THREE from 'three';
import { randomFor } from './flight.js';

const box = new THREE.BoxGeometry();
const shuttle = new THREE.CylinderGeometry(.79, 1, 1, 6);
const person = new THREE.CylinderGeometry(.55, .8, 1, 5);
const white = new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff0be').multiplyScalar(3.3) });
const red = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff562f').multiplyScalar(3.2) });
const hull = new THREE.MeshStandardMaterial({ roughness: .41, metalness: .48 });
const canopy = new THREE.MeshStandardMaterial({ color: '#263b46', roughness: .19, metalness: .65 });
const exhaust = new THREE.MeshBasicMaterial({ color: new THREE.Color('#85e0ff').multiplyScalar(1.9) });
const pedestrian = new THREE.MeshStandardMaterial({ roughness: .8 });
const paint = ['#536476', '#d3b65d', '#515752', '#a04334', '#b9bdad', '#42575a'];
const point = new THREE.Vector3();
const ahead = new THREE.Vector3();

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
  const part = (geometry, material, count, start, details, colors = false) => {
    if (!count) return;
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    if (colors) {
      for (let i = 0; i < count; i++) mesh.setColorAt(i, new THREE.Color(paint[Math.floor(random() * paint.length)]));
    }
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    parent.add(mesh);
    parts.push({ mesh, count, start, details });
  };
  part(shuttle, hull, airCount, 0, [0, 0, 0, 2.15, 1.23, 4.5], true);
  part(shuttle, canopy, airCount, 0, [0, 1, -.55, 1.39, .93, 2.77]);
  part(box, exhaust, airCount, 0, [0, -.1, 4.2, 2.9, .25, .67]);
  part(box, white, airCount, 0, [0, .05, -4.25, 1.75, .22, .35]);
  const roadCount = actors.length - airCount;
  part(shuttle, hull, roadCount, airCount, [0, 0, 0, 1.45, .95, 2.6], true);
  part(box, white, roadCount, airCount, [0, 0, -2.45, 1.45, .24, .21]);
  part(box, red, roadCount, airCount, [0, 0, 2.45, 1.45, .26, .22]);

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
  part(person, pedestrian, walkers.length, walkersAt, [0, 0, 0, .53, 1.55, .44], true);

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
    for (const { mesh, count, start, details } of parts) {
      const [x, y, z, w, h, d] = details;
      for (let i = 0; i < count; i++) {
        const pose = poses[start + i];
        const scale = pose.scale;
        dummy.rotation.set(pose.pitch, pose.yaw, 0, 'YXZ');
        dummy.position.set(x * scale, y * scale, z * scale).applyQuaternion(dummy.quaternion)
          .add(point.set(pose.x, pose.y, pose.z));
        dummy.scale.set(w * scale, h * scale, d * scale);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  };
}
