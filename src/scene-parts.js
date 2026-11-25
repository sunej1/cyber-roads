import * as THREE from 'three';

export const box = new THREE.BoxGeometry();
export const neon = (color, intensity = 2) => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity) });

export function texture(width, height, paint) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  paint(canvas.getContext('2d'));
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  return map;
}

export function batch(parent, geometry, material, items) {
  if (!items.length) return;
  const mesh = new THREE.InstancedMesh(geometry, material, items.length);
  const dummy = new THREE.Object3D();
  const up = new THREE.Vector3(0, 1, 0);
  items.forEach(([x, y, z, w, h, d, rotation = 0, color], index) => {
    dummy.position.set(x, y, z);
    if (typeof rotation === 'number') dummy.quaternion.setFromAxisAngle(up, rotation);
    else dummy.quaternion.copy(rotation);
    dummy.scale.set(w, h, d);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
    if (color) mesh.setColorAt(index, new THREE.Color(color));
  });
  mesh.computeBoundingSphere();
  parent.add(mesh);
  return mesh;
}

export const line = (array, x, y, z, toX, toZ, width, height = .18, color) => {
  const dx = toX - x, dz = toZ - z;
  array.push([(x + toX) / 2, y, (z + toZ) / 2, width, height, Math.hypot(dx, dz), Math.atan2(dx, dz), color]);
};

const up = new THREE.Vector3(0, 1, 0);
export function beam(array, x, y, z, toX, toY, toZ, width, depth = width, color) {
  const axis = new THREE.Vector3(toX - x, toY - y, toZ - z);
  const length = axis.length();
  const rotation = new THREE.Quaternion().setFromUnitVectors(up, axis.divideScalar(length));
  array.push([(x + toX) / 2, (y + toY) / 2, (z + toZ) / 2, width, length, depth, rotation, color]);
}
