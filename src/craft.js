import * as THREE from 'three';

function hull(sections, material) {
  const positions = [], indices = [];
  for (const [z, width, low, high] of sections) {
    const ring = [
      [-.72, low], [.72, low], [1, low + .29], [.93, high - .3],
      [.69, high], [-.69, high], [-.93, high - .3], [-1, low + .29],
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
  for (let i = 1; i < 7; i++) indices.push(0, i + 1, i, last, last + i, last + i + 1);
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
  const paint = new THREE.MeshStandardMaterial({ color: '#807482', metalness: .51, roughness: .38, side: THREE.DoubleSide });
  const trim = new THREE.MeshStandardMaterial({ color: '#242f43', metalness: .52, roughness: .42, side: THREE.DoubleSide });
  const glass = new THREE.MeshStandardMaterial({ color: '#16334f', metalness: .47, roughness: .17, emissive: '#142f55', emissiveIntensity: .44, side: THREE.DoubleSide });
  const light = (color, amount) => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(amount) });
  const cyan = light('#70efff', 3), red = light('#ff386d', 3.05);
  const exhaustLight = light('#70efff', 1.55);
  const white = light('#fff4d1', 2.35);
  const box = new THREE.BoxGeometry();
  const part = (material, x, y, z, w, h, d) => {
    const mesh = new THREE.Mesh(box, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    group.add(mesh);
    return mesh;
  };

  group.add(
    hull([[-5.9, 1.58, -.34, .31], [-4.75, 2.51, -.6, .65], [-1.7, 2.76, -.68, .84],
      [3.65, 2.75, -.62, .8], [5.25, 2.45, -.32, .63], [5.56, 2.17, -.15, .51]], paint),
    hull([[-4.9, 1.42, -.58, -.25], [-2.8, 2.32, -.94, -.37], [4.4, 2.52, -.85, -.37], [5.68, 2.32, -.41, -.08]], trim),
    hull([[-2.83, 1.87, .59, .9], [-1.25, 1.59, .68, 1.94], [1.92, 1.57, .71, 2], [3.5, 2.02, .6, 1.05]], glass),
    hull([[-1.23, 1.11, 1.8, 2.01], [-.69, 1.47, 1.84, 2.12], [1.74, 1.45, 1.84, 2.1], [2.15, 1.21, 1.75, 1.98]], paint),
    hull([[5.15, 2.44, -.27, .66], [5.67, 2.37, -.24, .61], [5.76, 2.12, -.16, .52]], trim),
  );

  const nozzleProfile = [[.43, 0], [.54, .14], [.47, .4], [.33, .4], [.28, .16]];
  const nozzleGeometry = new THREE.LatheGeometry(nozzleProfile.map(([r, z]) => new THREE.Vector2(r, z)), 8);
  const coreGeometry = new THREE.CircleGeometry(.3, 8);
  const map = glowMap(), exhaust = [];
  for (const side of [-1, 1]) {
    const nacelle = hull([[-3.97, .37, -.15, .38], [-2.7, .74, -.66, .6], [3.95, .78, -.67, .69],
      [5.41, .48, -.48, .42]], trim);
    nacelle.position.x = side * 2.61;
    group.add(nacelle);
    const panel = part(paint, side * 2.87, .66, 2.07, .69, .25, 4.1);
    panel.rotation.z = -side * .13;
    part(white, side * 1.68, .09, -5.48, 1.11, .15, .18);
    const running = part(cyan, side * 3.05, -.48, .47, .10, .15, 6.83);
    running.rotation.y = side * .019;
    part(red, side * .84, .36, 5.78, .94, .16, .07);
    part(red, side * 1.7, .36, 5.78, .46, .16, .07);
    part(trim, side * 1.9, 1.15, 3.94, .33, .81, 1.42).rotation.z = side * .13;
    const nozzle = new THREE.Mesh(nozzleGeometry, paint);
    nozzle.position.set(side * 2.61, -.15, 5.32);
    nozzle.rotation.x = Math.PI / 2;
    nozzle.scale.z = .76;
    const core = new THREE.Mesh(coreGeometry, exhaustLight);
    core.position.set(side * 2.61, -.15, 5.51);
    core.scale.y = .76;
    group.add(nozzle, core);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map, color: '#5ef2ff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    sprite.position.set(side * 2.61, -.15, 5.73);
    group.add(sprite);
    exhaust.push(sprite);
  }
  part(trim, 0, 1.56, 4.17, 4.62, .22, .95);
  part(paint, 0, 1.68, 4.17, 4.37, .08, .78);
  for (let i = -2; i <= 2; i++) part(trim, i * .44, .79, -2.91, .23, .09, 1.52);
  scene.add(group);
  return {
    group,
    update(flight, time, boosting) {
      group.position.copy(flight.position);
      group.position.y += Math.sin(time * 2.1) * .15;
      group.rotation.set(flight.pitch, -flight.yaw, flight.bank, 'YXZ');
      const glow = 2.2 + flight.speed * .027 + Math.sin(time * 12) * .15 + (boosting ? 1.7 : 0);
      for (const sprite of exhaust) {
        sprite.scale.set(glow, glow * .61, 1);
        sprite.material.opacity = .30 + flight.speed * .002;
      }
    },
  };
}
