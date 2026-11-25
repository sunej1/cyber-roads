import assert from 'node:assert/strict';
import { test } from 'node:test';
import { advanceFlight, districtAt, districts, generateBuildings, intersectsBuilding, length, nearestRoute, newFlight, park, plaza, route } from '../src/flight.js';

const dt = 1 / 120;

test('the guided loop clears the city and traverses both public spaces', () => {
  const buildings = generateBuildings();
  assert.ok(buildings.length > 110);
  assert.ok(length > 5000 && length < 6000);
  const samples = route.getSpacedPoints(2200);
  for (const point of samples) {
    assert.ok(buildings.every(building => !intersectsBuilding(point, building, 14)), `route obstructed at ${point.toArray()}`);
  }
  for (const space of [plaza, park]) {
    assert.ok(samples.some(point => point.y < 110
      && Math.abs(point.x - space.x) < space.w / 2
      && Math.abs(point.z - space.z) < space.d / 2));
  }
  for (const district of districts) {
    assert.equal(districtAt(district.station), district);
    const point = route.getPointAt(district.station);
    assert.ok(Math.abs(nearestRoute(point) - district.station) < .003);
  }
  assert.ok(samples.some(point => point.y > 210 && point.z < -700));
  assert.ok(samples.some(point => point.x > 1100 && point.y > 110));
  const flight = newFlight(.995);
  const inputs = new Set();
  for (let i = 0; i < 340; i++) advanceFlight(flight, inputs, true, dt, buildings);
  assert.ok(flight.station < .03 && flight.distance > 100);
  assert.ok(flight.position.distanceTo(route.getPointAt(flight.station)) < .01);
});

test('manual flight boosts, climbs and stops short of a tower', () => {
  const normal = newFlight(), boosted = newFlight();
  const throttle = new Set(['throttle']), boost = new Set(['throttle', 'boost', 'rise']);
  for (let i = 0; i < 120; i++) {
    advanceFlight(normal, throttle, false, dt, []);
    advanceFlight(boosted, boost, false, dt, []);
  }
  assert.ok(boosted.speed > normal.speed);
  assert.ok(boosted.position.y > normal.position.y + 15);

  const flight = newFlight();
  flight.position.set(0, 80, 35);
  flight.yaw = 0;
  const tower = { x: 0, z: 0, w: 40, d: 40, h: 150 };
  for (let i = 0; i < 240; i++) advanceFlight(flight, throttle, false, dt, [tower]);
  assert.equal(flight.speed, 0);
  assert.ok(flight.warning > 0);
  assert.ok(!intersectsBuilding(flight.position, tower));
});
