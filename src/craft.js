import * as THREE from 'three';
import { batch, beam, box, neon } from './scene-parts.js';

function hull(sections, material) {
  const positions = [], indices = [];
  for (const [z, width, low, high] of sections) {
    const height = high - low;
    const ring = [
      [-.72, low], [.72, low], [1, low + height * .22], [.93, high - height * .20],
      [.69, high], [-.69, high], [-.93, high - height * .20], [-1, low + height * .22],
    ];
    for (const [x, y] of ring) positions.push(x * width, y, z);
  }
  const last = (sections.length - 1) * 8;
  for (let i = 0; i < last; i += 8) {
    for (let j = 0; j < 8; j++) {
      const a = i + j, b = i + (j + 1) % 8;
      indices.push(a, b, a + 8, b, b + 8, a + 8);
    }
  }
  // Give the end panels their own vertices so they don't pull the bevel normals toward the ends.
  const nose = positions.length / 3, tail = nose + 8;
  positions.push(...positions.slice(0, 24), ...positions.slice(last * 3));
  for (let i = 1; i < 7; i++) indices.push(nose, nose + i + 1, nose + i, tail, tail + i, tail + i + 1);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, material);
}

function glowMap() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,0.88)');
  gradient.addColorStop(.2, 'rgba(255,255,255,0.62)');
  gradient.addColorStop(.48, 'rgba(255,255,255,0.15)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

export function createCraft(scene) {
  const group = new THREE.Group();
  group.rotation.order = 'YXZ';
  const paint = new THREE.MeshStandardMaterial({ color: '#c65235', metalness: .48, roughness: .32 });
  const trim = new THREE.MeshStandardMaterial({ color: '#232d37', metalness: .46, roughness: .43 });
  const alloy = new THREE.MeshStandardMaterial({ color: '#789099', metalness: .66, roughness: .30 });
  const glass = new THREE.MeshStandardMaterial({ color: '#234550', metalness: .36, roughness: .15, emissive: '#163548', emissiveIntensity: .36 });
  const cyan = neon('#5cecfc', 1.45), red = neon('#ff294e', 2.75);
  const exhaustLight = neon('#43dcff', 2.1);
  const white = neon('#fff4d1', 2.35);

  group.add(
    hull([[-5.9, 1.57, -.30, .30], [-4.62, 2.43, -.56, .61], [-1.9, 2.7, -.62, .82],
      [1.3, 2.52, -.59, .81], [3.73, 2.72, -.54, .91], [5.33, 2.44, -.36, .73], [5.54, 2.03, -.26, .62]], paint),
    hull([[-5.68, 1.38, -.52, -.26], [-3.6, 2.27, -.88, -.39], [4.58, 2.48, -.90, -.37], [5.67, 2.11, -.53, -.21]], trim),
    hull([[-3.33, 1.80, .52, .80], [-.98, 1.61, .62, 1.99], [1.25, 1.58, .63, 1.97], [4.18, 1.79, .68, .93]], glass),
    hull([[-1.34, 1.02, 1.78, 1.88], [-.98, 1.22, 1.91, 2.06], [1.25, 1.20, 1.88, 2.04], [1.59, 1.00, 1.79, 1.91]], paint),
    hull([[4.97, 2.31, -.38, .53], [5.67, 2.12, -.49, .57], [5.77, 1.97, -.39, .43]], trim),
  );

  const nozzleProfile = [[.48, 0], [.60, .13], [.59, .31], [.49, .47], [.36, .47], [.32, .21]];
  const nozzleGeometry = new THREE.LatheGeometry(nozzleProfile.map(([r, z]) => new THREE.Vector2(r, z)), 8);
  const coreGeometry = new THREE.CircleGeometry(.335, 8);
  const taillights = [], headlights = [], runningLights = [], trimDetails = [];
  const map = glowMap(), exhaust = [];
  for (const side of [-1, 1]) {
    const nacelle = hull([[-3.95, .25, -.29, .28], [-2.07, .61, -.63, .35], [1.23, .66, -.67, .34],
      [4.18, .76, -.66, .49], [5.47, .64, -.63, .44]], trim);
    const shoulder = hull([[-2.83, .17, .27, .37], [.93, .38, .28, .67], [3.78, .61, .32, 1.28],
      [4.64, .58, .26, 1.01], [5.57, .33, .24, .55]], paint);
    nacelle.position.x = side * 2.60;
    shoulder.position.x = side * 2.49;
    group.add(nacelle, shoulder);

    beam(headlights, side * .62, .10, -5.95, side * 1.43, .17, -5.92, .13, .13);
    beam(trimDetails, side * 3.18, -.24, -1.93, side * 3.33, -.24, 3.81, .21, .26);
    beam(runningLights, side * 3.29, -.24, -1.76, side * 3.44, -.24, 3.65, .10, .11);
    beam(taillights, side * .38, .15, 5.80, side * 1.55, .28, 5.80, .15, .12);
    beam(taillights, side * 1.66, .30, 5.81, side * 2.24, .58, 5.48, .15, .12);
    for (const x of [1.29, 1.60]) {
      beam(trimDetails, side * x, .87, 4.23, side * x, .80, 4.85, .15, .08);
    }
    beam(trimDetails, side * .84, .63, -4.53, side * .92, .72, -3.25, .22, .08);

    const nozzle = new THREE.Mesh(nozzleGeometry, alloy);
    nozzle.position.set(side * 2.60, -.12, 5.25);
    nozzle.rotation.x = Math.PI / 2;
    nozzle.scale.z = .79;
    const core = new THREE.Mesh(coreGeometry, exhaustLight);
    core.position.set(side * 2.60, -.12, 5.56);
    core.scale.y = .79;
    group.add(nozzle, core);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map, color: '#5ef2ff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    sprite.position.set(side * 2.60, -.12, 5.74);
    group.add(sprite);
    exhaust.push(sprite);
  }
  batch(group, box, white, headlights);
  batch(group, box, cyan, runningLights);
  batch(group, box, red, taillights);
  batch(group, box, trim, trimDetails);
  scene.add(group);
  return {
    group,
    update(flight, time, boosting) {
      group.position.copy(flight.position);
      group.position.y += Math.sin(time * 2.1) * .15;
      group.rotation.set(flight.pitch, -flight.yaw, flight.bank, 'YXZ');
      const glow = 1.8 + flight.speed * .020 + Math.sin(time * 12) * .13 + (boosting ? 1.6 : 0);
      for (const sprite of exhaust) {
        sprite.scale.set(glow, glow * .65, 1);
        sprite.material.opacity = .32 + flight.speed * .002 + (boosting ? .15 : 0);
      }
    },
  };
}
