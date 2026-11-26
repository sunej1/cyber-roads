import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Color, Group, LineCurve3, Matrix4, Vector3 } from 'three';
import { addMovingTraffic } from '../src/street-life.js';

const setup = (circuits, roads, footpaths = []) => {
  const group = new Group();
  const update = addMovingTraffic(group, circuits, roads, footpaths, 18725);
  return { meshes: group.children, update };
};

test('traffic meshes stay within their batch, triangle, and footprint budgets', () => {
  const curve = new LineCurve3(new Vector3(0, 25, 0), new Vector3(0, 35, -240));
  const circuit = { curve, count: 2, speed: 34, length: curve.getLength() };
  const road = { path:{x:0,z:0,toX:312,toZ:234,kind:'avenue'}, start:0, end:390, direction:1 };
  const air = setup([circuit], []).meshes;
  const { meshes: ground, update } = setup([], [road]);
  const { meshes: walkers } = setup([], [], [[0, 0, 10, 10, 2]]);
  assert.deepEqual(air.map(mesh => mesh.count), [2, 2, 2, 2]);
  assert.deepEqual(ground.map(mesh => mesh.count), [2, 2, 2]);
  assert.deepEqual(walkers.map(mesh => mesh.count), [2]);
  const triangles = meshes => meshes.reduce((total, { geometry }) => total + geometry.index.count / 3, 0);
  assert.ok(triangles(air) <= 96);
  assert.ok(triangles(ground) <= 60);
  assert.ok(triangles(walkers) <= 20);

  for (const { geometry } of air) {
    geometry.computeBoundingBox();
    const { min, max } = geometry.boundingBox;
    assert.ok(min.x >= -1.84 && max.x <= 1.84);
    assert.ok(min.z >= -4.5 && max.z <= 3.87);
  }

  for (const { geometry } of ground) {
    geometry.computeBoundingBox();
    const { min, max } = geometry.boundingBox;
    // The old road hull used a hexagon with radial scales 1.45 and 2.6.
    const halfWidth = Math.sin(Math.PI / 3) * 1.45;
    assert.ok(min.x >= -halfWidth && max.x <= halfWidth);
    assert.ok(min.z >= -2.6 && max.z <= 2.6);
  }

  update(5);
  const chassis = new Matrix4();
  const detail = new Matrix4();
  ground[0].getMatrixAt(0, chassis);
  for (const mesh of ground.slice(1)) {
    mesh.getMatrixAt(0, detail);
    assert.ok(detail.equals(chassis));
  }
  const position = new Vector3().setFromMatrixPosition(chassis);
  const along=position.x*.8+position.z*.6;
  assert.ok(along>0 && along<road.end);
  assert.ok(Math.abs(position.x*.6-position.z*.8-3.4)<1e-5);

  const lamps = ground.find(mesh => mesh.material.vertexColors);
  const { position: vertices, color, normal } = lamps.geometry.attributes;
  const front = new Color('#fff0be').multiplyScalar(3.3);
  const rear = new Color('#ff562f').multiplyScalar(3.2);
  const sides = new Set();
  const faceDirections = new Set();
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i), z = vertices.getZ(i);
    assert.ok(Math.abs(x) > .5 && Math.abs(z) > 2);
    const expected = z < 0 ? front : rear;
    assert.ok(Math.abs(color.getX(i) - expected.r) < 1e-6);
    assert.ok(Math.abs(color.getY(i) - expected.g) < 1e-6);
    assert.ok(Math.abs(color.getZ(i) - expected.b) < 1e-6);
    sides.add(`${Math.sign(x)},${Math.sign(z)}`);
    const vertical = Math.round(normal.getY(i));
    if (vertical === 0) assert.equal(Math.round(normal.getZ(i)), Math.sign(z));
    faceDirections.add(vertical);
  }
  assert.equal(sides.size, 4);
  assert.deepEqual(faceDirections, new Set([-1, 0, 1]));
});
