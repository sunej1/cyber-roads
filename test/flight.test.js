import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Vector3 } from 'three';
import { closestSpine, coreEdge, districtForPosition, landmarksNear, spinePoint, streetVertex, tileAt, tileSize } from '../src/extent.js';
import { airCircuits, streetRuns } from '../src/traffic.js';
import { generateTile, localTraffic } from '../src/world.js';
import { advanceFlight, departure, districtAt, districts, generateBuildings, harborExit, intersectsBuilding, length, nearestGuideFlight, nearestRoute, newFlight, park, plaza, route } from '../src/flight.js';

const dt = 1 / 120;

test('the low Meridian tour passes the civic spaces and joins the outbound lanes smoothly', () => {
  const buildings = generateBuildings();
  assert.ok(buildings.length > 250);
  assert.ok(new Set(buildings.map(b => b.type)).size >= 12);
  assert.ok(length > 3900 && length < 4900);
  const samples = route.getSpacedPoints(2200);
  assert.ok(samples.every(point => buildings.every(b => !intersectsBuilding(point,b,15))));
  assert.ok(samples.filter(point => point.y < 78).length > samples.length * .85);
  for (const space of [plaza, park]) {
    assert.ok(samples.some(point => point.y < 67 && Math.abs(point.x-space.x) < space.w/2 && Math.abs(point.z-space.z) < space.d/2));
  }
  for (const district of districts) {
    assert.equal(districtAt(district.station),district);
    assert.ok(Math.abs(nearestRoute(route.getPointAt(district.station))-district.station) < .003);
  }
  assert.ok(route.getPointAt(harborExit).distanceTo(departure.getPointAt(0)) < .01);
  const firstTile = generateTile(0,3);
  const obstacles = buildings.concat(firstTile.buildings.map(b => ({ ...b, x:b.x+firstTile.x, z:b.z+firstTile.z })));
  for (const point of departure.getSpacedPoints(400)) {
    assert.ok(obstacles.every(b => !intersectsBuilding(point,b,14)), `departure obstructed at ${point.toArray()}`);
  }
  const flight = newFlight(.96);
  const input = new Set();
  let previous = flight.position.clone();
  const districtsVisited = new Set();
  for (let i=0;i<120*90;i++) {
    advanceFlight(flight,input,true,dt,obstacles);
    assert.ok(flight.position.distanceTo(previous) < 1.5, 'the guide should never teleport');
    previous.copy(flight.position);
    if (flight.spine) districtsVisited.add(districtForPosition(flight.position.x,flight.position.z).id);
  }
  assert.equal(flight.spine.track,0);
  assert.deepEqual([...districtsVisited].slice(0,4),['canal','downtown','industry','outskirts']);
  assert.ok(flight.position.distanceTo(spinePoint(0,flight.position.z)) < .01);
});

test('manual flight boosts, climbs and respects rotated building footprints', () => {
  const normal = newFlight(), boosted = newFlight();
  const throttle = new Set(['throttle']), boost = new Set(['throttle','boost','rise']);
  for (let i=0;i<120;i++) {
    advanceFlight(normal,throttle,false,dt,[]);
    advanceFlight(boosted,boost,false,dt,[]);
  }
  assert.ok(boosted.speed > normal.speed);
  assert.ok(boosted.position.y > normal.position.y + 15);
  const flight = newFlight();
  flight.position.set(0,80,39);
  flight.yaw=0;
  const tower = {x:0,z:0,w:24,d:50,h:150,yaw:Math.PI/4};
  assert.ok(intersectsBuilding({x:14,y:80,z:14},tower,0));
  assert.ok(!intersectsBuilding({x:-14,y:80,z:14},tower,0));
  for (let i=0;i<240;i++) advanceFlight(flight,throttle,false,dt,[tower]);
  assert.equal(flight.speed,0);
  assert.ok(flight.warning > 0);
  assert.ok(!intersectsBuilding(flight.position,tower));

  const exploration=newFlight();
  exploration.position.set(1549.5,130,1250);
  exploration.yaw=Math.PI/2;
  for (let i=0;i<120;i++) advanceFlight(exploration,throttle,false,dt,[]);
  assert.ok(exploration.position.x>1550);
  assert.equal(exploration.warning,0);
});

test('the district belt has connected avenues, bridges, freight tracks and distinct land use', () => {
  const canal=generateTile(0,3), downtown=generateTile(0,4);
  const industry=generateTile(0,6), outskirts=generateTile(0,8);
  assert.ok(canal.roads.some(road=>road.bridge));
  assert.ok(industry.roads.some(road=>road.kind==='rail'));
  assert.ok(industry.blocks.some(lot=>lot.use==='yard' || lot.use==='tanks'));
  assert.ok(outskirts.blocks.some(lot=>lot.use==='grove'));
  assert.ok(outskirts.buildings.every(b=>b.h<60));
  assert.ok(downtown.buildings.length > industry.buildings.length * 3);
  assert.ok(downtown.buildings.filter(b=>b.h>75).length > 25);
  assert.ok(downtown.roads.length > outskirts.roads.length);
  const border=streetVertex(0,2240);
  assert.ok(canal.roads.some(r=>r.kind==='avenue' && r.toX+canal.x===border.x && r.toZ+canal.z===border.z));
  assert.ok(downtown.roads.some(r=>r.kind==='avenue' && r.x+downtown.x===border.x && r.z+downtown.z===border.z));
  assert.ok([canal,downtown,industry,outskirts].every(tile=>tile.roads.some(r=>Math.abs(r.x-r.toX)>8 && Math.abs(r.z-r.toZ)>8)));
});

test('the central air lane weaves between tower walls and passes the five mapped landmarks', () => {
  const cache = new Map();
  const get = (col,row) => {
    const key=`${col}/${row}`;
    if (!cache.has(key)) cache.set(key,generateTile(col,row));
    return cache.get(key);
  };
  const underpasses=new Set();
  let enclosed=0,sampled=0;
  for (let z=2300;z<3260;z+=8) {
    const p=spinePoint(0,z),col=tileAt(p.x),row=tileAt(z);
    let left=false,right=false;
    for (let dx=-1;dx<=1;dx++) for (let dz=-1;dz<=1;dz++) {
      const tile=get(col+dx,row+dz);
      if (!tile) continue;
      const local={x:p.x-tile.x,y:p.y,z:p.z-tile.z};
      for (const bridge of tile.skywalks) {
        assert.ok(!intersectsBuilding(local,bridge,15));
        if (intersectsBuilding({...local,y:bridge.base+2},bridge,5)) {
          assert.ok(local.y<bridge.base-15);
          underpasses.add(bridge);
        }
      }
      for (const b of tile.buildings) {
        assert.ok(!intersectsBuilding(local,b,15));
        if (b.h<local.y+20 || Math.abs(b.z-local.z)>90) continue;
        const offset=b.x-local.x;
        if (offset<0 && offset>-120) left=true;
        if (offset>0 && offset<120) right=true;
      }
    }
    if (left && right) enclosed++;
    sampled++;
  }
  assert.ok(underpasses.size>=2);
  assert.ok(enclosed/sampled>.78, `${enclosed} of ${sampled} sectors have tall buildings flanking the route`);
  const expected=['Sable Locks','Keystone Exchange','Lift 24','Kiln Nine','Juniper Reservoir'];
  const landmarks=landmarksNear(0,3290,1650).filter(mark=>Math.abs(mark.x)<430).sort((a,b)=>a.z-b.z);
  assert.deepEqual(landmarks.map(mark=>mark.landmark),expected);
  for (const mark of landmarks) {
    const tile=get(tileAt(mark.x),tileAt(mark.z));
    const placed=tile.landmarks.find(b=>b.landmark===mark.landmark);
    assert.ok(placed, `${mark.landmark} was excluded from its district`);
    const p=spinePoint(0,mark.z);
    assert.ok(p.y<mark.h && Math.abs(p.x-mark.x)<133);
  }
});

test('distant tiles regenerate identically and leave their local air lanes clear', () => {
  for (const [col,row] of [[0,3],[0,67],[-3,-7],[6,10],[-30,302],[-15721,-33905],[1628403,23234]]) {
    const tile=generateTile(col,row);
    assert.deepEqual(tile,generateTile(col,row));
    assert.equal(tile.x,col*tileSize);
    const track=closestSpine(tile.x,tile.z);
    const point=new Vector3();
    for (let z=-tileSize/2;z<=tileSize/2;z+=3) {
      spinePoint(track,tile.z+z,point);
      point.x-=tile.x;
      point.z-=tile.z;
      assert.ok(tile.buildings.every(b=>!intersectsBuilding(point,b,15)),`blocked spine in ${col}/${row}`);
    }
    const { circuits }=localTraffic(tile);
    assert.ok(circuits[0].curve.getSpacedPoints(700).every(probe=>tile.buildings.concat(tile.skywalks).every(b=>!intersectsBuilding(probe,b,9))));
    const recovered=nearestGuideFlight(new Vector3(tile.x,100,tile.z));
    assert.ok(recovered.spine);
    assert.equal(recovered.spine.direction,row<0?-1:1);
  }
});

test('Meridian traffic circuits loop and clear the towers and the player route', () => {
  const buildings=generateBuildings();
  const circuits=airCircuits(buildings);
  assert.ok(circuits.reduce((sum,lane)=>sum+lane.count,0)>=70);
  const guided=route.getSpacedPoints(820);
  for (const {curve} of circuits) {
    assert.ok(curve.getPointAt(0).distanceTo(curve.getPointAt(1))<.02);
    for (const point of curve.getSpacedPoints(900)) {
      assert.ok(buildings.every(b=>!intersectsBuilding(point,b,9)));
      assert.ok(guided.every(player=>player.distanceToSquared(point)>11**2));
    }
  }
  assert.ok(streetRuns(buildings).length>80);
});
