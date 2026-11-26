import assert from 'node:assert/strict';
import test from 'node:test';
import { Color, PerspectiveCamera, Scene, Vector3 } from 'three';
import { addStreetLamps, streetLighting } from '../src/street-lighting.js';

test('street lamps share their emitter tint with the light source', () => {
  const scene = new Scene();
  const lamps = addStreetLamps(scene, [
    [1, 6, 0, 1, .4, 1],
    [2, 6, 0, 1, .4, 1, 0, '#6ec6ba'],
    [3, 6, 0, 8, .4, 1],
  ], 640, -640);
  const emitterColor = new Color();
  assert.equal(lamps.length, 2);
  assert.equal(lamps[0].x, 641);
  assert.equal(lamps[0].z, -640);
  assert.equal(lamps[1].color, '#6ec6ba');
  for (const [index, lamp] of lamps.entries()) {
    scene.children[0].getColorAt(index, emitterColor);
    assert.equal(emitterColor.getHexString(), lamp.color.slice(1));
  }
  scene.children[0].getColorAt(2, emitterColor);
  assert.equal(emitterColor.getHexString(), 'ffcc87');
});

test('light slots cover nearby fixtures and turn off above street level', () => {
  const lighting = streetLighting(new Scene());
  const camera = new PerspectiveCamera();
  const origin = new Vector3(640, 0, 0);
  const fixture = (x, z) => ({ x: x + origin.x, y: 6, z, range: 33, power: 185, color: '#ffbe7d' });
  const beside = fixture(6, 0);
  const ahead = Array.from({ length: 6 }, (_, i) => fixture(0, -40 - i));
  const groups = [[beside, beside, ...ahead]];
  camera.position.y = 8;
  const update = now => lighting.update(now, .05, camera, origin, groups);

  update(0);
  const active = () => lighting.lights.filter(light => light.intensity > .2);
  assert.equal(active().length, 6);
  assert.ok(active().some(light => light.position.x === 6));
  assert.ok(!active().some(light => light.position.z === -45));

  camera.position.y = 160;
  for (let i = 1; i <= 20; i++) update(i * 50);
  assert.equal(active().length, 0);
});

test('small camera movements keep the same lamps until another is clearly closer', () => {
  const lighting = streetLighting(new Scene());
  const camera = new PerspectiveCamera();
  const origin = new Vector3();
  const groups = [Array.from({ length: 5 }, (_, i) => -2 + i).concat(20, -23)
    .map(x => ({ x, y: 6, z: -3, range: 33, power: 185, color: '#ffbe7d' }))];
  const activeAt = x => lighting.lights.some(light => light.position.x === x && light.intensity > .2);
  camera.position.y = 8;
  lighting.update(0, .05, camera, origin, groups);
  assert.ok(activeAt(20));

  camera.position.x = -2;
  lighting.update(112, .05, camera, origin, groups);
  assert.ok(activeAt(20));
  assert.ok(!activeAt(-23));

  camera.position.x = -8;
  for (let i = 0; i < 20; i++) lighting.update(224 + i * 50, .05, camera, origin, groups);
  assert.ok(activeAt(-23));
  assert.ok(!activeAt(20));
});
