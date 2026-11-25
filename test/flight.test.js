import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Vector3 } from 'three';
import { closestSpine, coreEdge, spinePoint, tileAt, tileSize } from '../src/extent.js';
import { airCircuits, streetRuns } from '../src/traffic.js';
import { generateTile, localTraffic } from '../src/world.js';
import { advanceFlight, departure, districtAt, districts, generateBuildings, harborExit, intersectsBuilding, length, nearestGuideFlight, nearestRoute, newFlight, park, plaza, route } from '../src/flight.js';

const dt = 1 / 120;

test('the guided route clears Meridian and traverses both public spaces', () => {
  const buildings = generateBuildings();
  assert.ok(buildings.length > 220);
  assert.equal(new Set(buildings.map(({type})=>type)).size,8);
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
  const harborPoint = route.getPointAt(harborExit);
  assert.ok(harborPoint.distanceTo(departure.getPointAt(0)) < .01);
  for (const point of departure.getSpacedPoints(400)) {
    const tile = generateTile(tileAt(point.x),tileAt(point.z));
    const obstacles = tile ? tile.buildings.map(b => ({...b,x:b.x+tile.x,z:b.z+tile.z})) : buildings;
    assert.ok(obstacles.every(b => !intersectsBuilding(point,b,14)), `departure obstructed at ${point.toArray()}`);
  }
  const flight = newFlight(.925);
  const inputs = new Set();
  const regions = new Set();
  let previous = flight.position.clone();
  for (let i = 0; i < 120 * 70; i++) {
    advanceFlight(flight, inputs, true, dt, buildings);
    assert.ok(flight.position.distanceTo(previous) < 1.5, 'the guide should never teleport');
    previous.copy(flight.position);
    if (flight.position.z > coreEdge) regions.add(tileAt(flight.position.z));
  }
  assert.equal(flight.spine.track,0);
  assert.ok(regions.size >= 4);
  assert.ok(flight.position.distanceTo(spinePoint(0, flight.position.z)) < .01);
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


test('distant tiles regenerate identically and leave their local air lanes clear', () => {
  for (const [col,row] of [[0,3],[0,67],[-3,-7],[6,10],[-30,302],[-15721,-33905],[1628403,23234]]) {
    const tile = generateTile(col,row);
    assert.deepEqual(tile,generateTile(col,row));
    assert.ok(tile.buildings.length >= 18);
    assert.equal(tile.x,col*tileSize);
    const track = closestSpine(tile.x,tile.z);
    const point = new Vector3();
    for (let z=-tileSize/2; z<=tileSize/2; z+=3) {
      spinePoint(track,tile.z+z,point);
      point.x-=tile.x;
      point.z-=tile.z;
      assert.ok(tile.buildings.every(b=>!intersectsBuilding(point,b,19)), `blocked spine in ${col}/${row}`);
    }
    const { circuits } = localTraffic(tile);
    assert.ok(circuits[0].curve.getSpacedPoints(700).every(probe=>tile.buildings.every(b=>!intersectsBuilding(probe,b,9))));
    const spawn = new Vector3(tile.x,100,tile.z);
    const recovered = nearestGuideFlight(spawn);
    assert.ok(recovered.spine);
    assert.equal(recovered.spine.direction,row < 0 ? -1 : 1);
  }
  const manual = newFlight();
  manual.position.set(1549.5,130,1250);
  manual.yaw = Math.PI/2;
  for (let i=0;i<120;i++) advanceFlight(manual,new Set(['throttle']),false,dt,[]);
  assert.ok(manual.position.x > 1550);
  assert.equal(manual.warning,0);
});

test('Meridian traffic circuits loop and clear the towers and the player route', () => {
  const buildings = generateBuildings();
  const circuits = airCircuits(buildings);
  assert.ok(circuits.reduce((sum,lane)=>sum+lane.count,0)>=70);
  const guided = route.getSpacedPoints(820);
  for (const {curve} of circuits) {
    assert.ok(curve.getPointAt(0).distanceTo(curve.getPointAt(1)) < .02);
    for (const point of curve.getSpacedPoints(900)) {
      assert.ok(buildings.every(b=>!intersectsBuilding(point,b,9)));
      assert.ok(guided.every(player=>player.distanceToSquared(point)>11**2));
    }
  }
  assert.ok(streetRuns(buildings).length>80);
});
