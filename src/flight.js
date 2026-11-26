import { CatmullRomCurve3, Vector3, MathUtils } from 'three';
import { closestSpine, coreEdge, makeDeparture, spinePoint } from './extent.js';
import { harborMarket, isOnLand, lanternMile, park, plaza, streetPoint, streets } from './meridian-plan.js';
export { park, plaza, shore } from './meridian-plan.js';

export const districts = [
  { name: 'Harbor Approach', description: 'South breakwater', point: 0, color: '#65eddf' },
  { name: 'Lantern Mile', description: 'Night market and tower canyon', point: 2, color: '#ff73bd' },
  { name: 'Glass Gardens', description: 'Civic square and public park', point: 5, color: '#a2f4ba' },
  { name: 'Crown Heights', description: 'Tower canyon and transit decks', point: 9, color: '#bc9bff' },
  { name: 'Westbank', description: 'Market streets and old warehouses', point: 15, color: '#ffbc86' },
];

const waypoints = [
  [-154, 110, 1055], [-208, 86, 854], [-218, 63, 643], [-196, 55, 518],
  [-223, 57, 361], [-204, 52, 222], [-120, 50, 112], [9, 51, 91],
  [157, 53, 35], [215, 57, -148], [276, 63, -327], [225, 78, -550],
  [56, 81, -677], [-137, 69, -690], [-322, 62, -525], [-493, 56, -367],
  [-556, 57, -163], [-563, 58, 54], [-625, 59, 212], [-531, 51, 405],
  [-435, 51, 586], [-433, 57, 780], [-347, 62, 923], [-274, 71, 1062],
].map(point => new Vector3(...point));

export const route = new CatmullRomCurve3(waypoints);
route.arcLengthDivisions = 1200;
route.updateArcLengths();
export const length = route.getLength();
export const routeSamples = route.getSpacedPoints(560);
export const harborExit = 1;
export const departure = makeDeparture(route);
const departureLength = departure.getLength();
const departureSamples = departure.getSpacedPoints(94);

export function nearestRoute(position, through = 1) {
  let best = Infinity;
  let index = 0;
  for (let i = 0; i < Math.min(routeSamples.length, 1 + Math.floor(through * (routeSamples.length - 1))); i++) {
    const point = routeSamples[i];
    const distance = (point.x - position.x) ** 2 + (point.z - position.z) ** 2;
    if (distance < best) {
      best = distance;
      index = i;
    }
  }
  return index / (routeSamples.length - 1);
}

for (const district of districts) district.station = nearestRoute(waypoints[district.point]);
export function districtAt(station) {
  return districts.findLast(district => district.station <= station) ?? districts[0];
}

export function intersectsBuilding(position, building, clearance = 3.5) {
  if (position.y >= building.h + clearance || position.y <= (building.base ?? -Infinity) - clearance) return false;
  const dx = position.x - building.x, dz = position.z - building.z;
  if (!building.yaw) return Math.abs(dx) < building.w / 2 + clearance && Math.abs(dz) < building.d / 2 + clearance;
  const max = (building.w + building.d) / 2 + clearance;
  if (Math.abs(dx) >= max || Math.abs(dz) >= max) return false;
  const sin = Math.sin(building.yaw), cos = Math.cos(building.yaw);
  return Math.abs(dx * cos - dz * sin) < building.w / 2 + clearance
    && Math.abs(dx * sin + dz * cos) < building.d / 2 + clearance;
}

export function footprintsOverlap(a, b, gap) {
  const dx=b.x-a.x, dz=b.z-a.z;
  if (Math.max(Math.abs(dx),Math.abs(dz))>(a.w+a.d+b.w+b.d)/2+gap) return false;
  const angle=(b.yaw??0)-(a.yaw??0);
  const s=Math.abs(Math.sin(angle)), c=Math.abs(Math.cos(angle));
  const overlapsAxes = (first,second) => {
    const sine=Math.sin(first.yaw??0), cosine=Math.cos(first.yaw??0);
    return Math.abs(dx*cosine-dz*sine)<(first.w+second.w*c+second.d*s)/2+gap
      && Math.abs(dx*sine+dz*cosine)<(first.d+second.w*s+second.d*c)/2+gap;
  };
  return overlapsAxes(a,b) && overlapsAxes(b,a);
}

export function randomFor(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const forward = new Vector3();
const trial = new Vector3();
const damp = MathUtils.damp;
const angleTo = (current, target) => Math.atan2(Math.sin(target - current), Math.cos(target - current));
const heading = direction => Math.atan2(direction.x, -direction.z);

export function newFlight(station = 0) {
  return {
    position: route.getPointAt(station),
    station,
    transfer: null,
    spine: null,
    yaw: heading(route.getTangentAt(station)),
    speed: 0,
    lift: 0,
    bank: 0,
    pitch: 0,
    distance: 0,
    warning: 0,
  };
}

export function nearestGuideFlight(position) {
  const flight = newFlight(nearestRoute(position,harborExit));
  let nearestDistance = Math.hypot(flight.position.x - position.x, flight.position.z - position.z);
  departureSamples.forEach((point, index) => {
    const distance = Math.hypot(point.x - position.x, point.z - position.z);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      flight.transfer = index / (departureSamples.length - 1) * departureLength;
      flight.position.copy(point);
      flight.yaw = heading(departure.getTangentAt(flight.transfer / departureLength));
    }
  });
  if (Math.max(Math.abs(position.x), Math.abs(position.z)) >= coreEdge) {
    const track = closestSpine(position.x, position.z);
    const direction = position.z < 0 ? -1 : 1;
    const point = spinePoint(track, position.z);
    if (Math.hypot(point.x - position.x, point.z - position.z) <= nearestDistance) {
      flight.transfer = null;
      flight.spine = { track, direction };
      flight.position.copy(point);
      flight.yaw = heading(spinePoint(track, point.z + direction).sub(point));
    }
  }
  return flight;
}

export function advanceFlight(flight, input, guided, dt, buildings) {
  flight.warning = Math.max(0, flight.warning - dt);
  if (guided) {
    flight.speed = damp(flight.speed, 53 + 8 * flight.position.y / 225, 1.15, dt);
    const step = flight.speed * dt;
    if (flight.spine) {
      const { track, direction } = flight.spine;
      const z = flight.position.z;
      spinePoint(track, z + direction, forward).sub(flight.position);
      spinePoint(track, z + direction * step / forward.length(), flight.position);
      forward.normalize();
    } else if (flight.transfer !== null || flight.station + step / length >= harborExit) {
      flight.transfer = flight.transfer === null ? (flight.station + step / length - harborExit) * length : flight.transfer + step;
      flight.station = harborExit;
      const u = Math.min(1, flight.transfer / departureLength);
      departure.getPointAt(u, flight.position);
      departure.getTangentAt(u, forward);
      if (u === 1) flight.spine = { track: 0, direction: 1 };
    } else {
      flight.station += step / length;
      route.getPointAt(flight.station, flight.position);
      route.getTangentAt(flight.station, forward);
    }
    const turn = angleTo(flight.yaw, heading(forward));
    flight.yaw += turn * (1 - Math.exp(-6 * dt));
    flight.bank = damp(flight.bank, -MathUtils.clamp(turn * 1.6, -0.4, 0.4), 4, dt);
    flight.pitch = damp(flight.pitch, -forward.y * 0.9, 4, dt);
    flight.distance += step;
    return;
  }

  const steer = Number(input.has('right')) - Number(input.has('left'));
  const vertical = Number(input.has('rise')) - Number(input.has('sink'));
  const accelerating = input.has('throttle');
  const braking = input.has('brake');
  if (braking) flight.speed = damp(flight.speed, 0, 5.2, dt);
  else if (accelerating) flight.speed = damp(flight.speed, input.has('boost') ? 105 : 65, 1.5, dt);
  else flight.speed = damp(flight.speed, Math.min(18, flight.speed), 0.85, dt);
  flight.lift = damp(flight.lift, vertical * 33, 4, dt);
  flight.yaw += steer * (1.26 - flight.speed * 0.0045) * dt;
  flight.bank = damp(flight.bank, -steer * (0.22 + flight.speed * 0.0026), 5, dt);
  flight.pitch = damp(flight.pitch, -flight.lift * 0.012 + (accelerating ? 0.055 : 0), 4, dt);

  trial.set(
    flight.position.x + Math.sin(flight.yaw) * flight.speed * dt,
    MathUtils.clamp(flight.position.y + flight.lift * dt, 22, 430),
    flight.position.z - Math.cos(flight.yaw) * flight.speed * dt,
  );
  // shortcut: Tower bounds cover the full footprint and roof slab; rooftop obstacle flying would need individual mast and crown bounds.
  if (buildings.some(building => intersectsBuilding(trial, building, 5))) {
    flight.speed = 0;
    flight.lift = 0;
    flight.warning = 2.2;
    return;
  }
  flight.distance += flight.position.distanceTo(trial);
  flight.position.copy(trial);
}

export function generateBuildings() {
  const random = randomFor(7043);
  const buildings = [];
  const roadbeds = streets.map(road=>{
    const [x,z]=streetPoint(road,road.length/2);
    return { x,z,w:road.width,d:road.length,yaw:road.yaw };
  });
  const publicSpaces = [park,plaza,harborMarket];
  const canPlace = (building) => {
    const { x,z,w,d,yaw }=building;
    const sin=Math.sin(yaw), cos=Math.cos(yaw);
    for (const along of [-1,1]) for (const depth of [-1,1]) {
      const u=along*(w/2+3), v=depth*(d/2+3);
      if (!isOnLand(x+u*cos+v*sin,z-u*sin+v*cos)) return false;
    }
    return !publicSpaces.some(space=>footprintsOverlap(building,space,6))
      && !roadbeds.some(road=>footprintsOverlap(building,road,4.8))
      && !buildings.some(other=>footprintsOverlap(building,other,6));
  };
  const onFrontage = (road, along, side, w, d, streetGap) => {
    const [x,z]=streetPoint(road,along,side*(road.width/2+streetGap+d/2));
    return { x,z,w,d,yaw:road.yaw-side*Math.PI/2,frontage:true,streetGap };
  };
  const limitToGuide = building => {
    for (const point of routeSamples) {
      if (intersectsBuilding(point,building,22)) building.h=point.y-23;
    }
  };

  const landmarks = [
    { x: -132, z: 803, w: 71, d: 56, h: 158, type: 14, sign: 'NOCTURNE', style: 2 },
    { x: -339, z: 818, w: 72, d: 58, h: 121, type: 11, sign: 'PORT / 01', style: 3 },
    { x: -366, z: 628, w: 85, d: 78, h: 164, type: 5, sign: 'KAIROS', style: 4 },
    { x: -84, z: 597, w: 79, d: 84, h: 188, type: 9, sign: 'NOVA', style: 1 },
    { x: -358, z: 393, w: 76, d: 82, h: 183, type: 7, sign: 'LANTERN', style: 4 },
    { x: -99, z: 397, w: 72, d: 80, h: 232, type: 5, sign: 'SABLE', style: 0 },
    { x: 77, z: 469, w: 87, d: 79, h: 211, type: 2, sign: 'OYAMA', style: 1 },
    { x: 263, z: 271, w: 91, d: 68, h: 283, type: 8, sign: 'MERIDIAN', style: 1 },
    { x: 345, z: 176, w: 60, d: 53, h: 214, type: 2, style: 2 },
    { x: -392, z: -13, w: 76, d: 72, h: 213, type: 4, sign: 'ORBIT', style: 1 },
    { x: 32, z: -179, w: 74, d: 79, h: 173, type: 7, sign: 'VERDANT', style: 5 },
    { x: 409, z: -302, w: 78, d: 66, h: 219, type: 5, sign: 'CROWN', style: 0 },
    { x: 568, z: -432, w: 80, d: 73, h: 204, type: 3, style: 1 },
    { x: -651, z: 388, w: 65, d: 63, h: 85, type: 10, sign: 'TIDELINE', style: 3 },
    { x: 709, z: 514, w: 63, d: 53, h: 127, type: 6, sign: 'TIDELINE', style: 5 },
  ];
  for (const landmark of landmarks) {
    const candidates=[];
    for (const road of streets) {
      const dx=landmark.x-road.x, dz=landmark.z-road.z;
      const along=dx*road.dx+dz*road.dz, offset=dx*road.dz-dz*road.dx;
      const side=Math.sign(offset)||1;
      for (const size of [1,.82]) for (const shift of [0,-16,16,-33,33,-48,48]) {
        const w=landmark.w*size, d=landmark.d*size, at=along+shift;
        if (!road.sections.some(([start,end])=>at>=start+w/2 && at<=end-w/2)) continue;
        const gap=MathUtils.clamp(Math.abs(offset)-d/2-road.width/2,6,27);
        const building={...landmark,...onFrontage(road,at,side,w,d,gap),retail:true};
        const distance=Math.hypot(building.x-landmark.x,building.z-landmark.z);
        if (distance<108) candidates.push({building,score:distance+(1-size)*100});
      }
    }
    candidates.sort((a,b)=>a.score-b.score);
    const match=candidates.find(({building})=>canPlace(building)
      && !routeSamples.some(point=>intersectsBuilding(point,building,22)));
    if (match) buildings.push(match.building);
  }

  const byHierarchy = [...streets].sort((a,b)=>Number(b.kind==='avenue')-Number(a.kind==='avenue'));
  const infill = (road, at, side, w, d, narrow) => {
    const building=onFrontage(road,at,side,w,d,road.kind==='avenue'?7:5.5);
    if (!canPlace(building)) return;
    const {x,z}=building;
    const westbank=x<-480 && z>110;
    const port=road.kind==='quay' || z>722;
    const civic=Math.hypot((x-park.x)/177,(z-park.z)/145)<1.2
      || Math.hypot((x-plaza.x)/142,(z-plaza.z)/137)<1.2;
    const hubs=Math.min(Math.hypot((x+204)/300,(z-550)/250),Math.hypot((x-204)/345,(z+135)/330));
    const highStreet=road.kind==='avenue' || (hubs<.95 && w>46 && random()<.43);
    const low=port || westbank || civic || narrow;
    building.h=low ? 16+random()*(civic?36:27)
      : 31+random()*36+Math.max(0,1-hubs*.60)*(highStreet?138:54);
    limitToGuide(building);
    const {h}=building;
    const pool=h<32?[13,14,15,16]:westbank?[10,11,13,15,16]:port?[11,13,15,16]:
      civic?[1,3,4,7,12,13,15]:h<75?[0,1,2,3,13,15,16]:[0,1,2,3,4,5,6,7,8,9];
    const type=pool[Math.floor(random()*pool.length)];
    const style=westbank?3:port?5:Math.floor(random()*6);
    buildings.push({ ...building,type,style,retail:!westbank || road.kind==='avenue' || w<34 });
  };
  for (const narrow of [false,true]) for (const road of byHierarchy) {
    const pitch=narrow?34:59;
    for (const [start,end] of road.sections) {
      const count=Math.round((end-start)/pitch);
      if (!count) continue;
      const span=(end-start)/count;
      for (const side of [-1,1]) for (let i=0;i<count;i++) {
        const at=start+span*(i+.5);
        const w=Math.min(span-7,(narrow?21:40)+random()*(narrow?9:16));
        const d=(narrow?18:33)+random()*(narrow?11:23);
        if (w>=(narrow?16:28)) infill(road,at,side,w,d,narrow);
      }
    }
  }

  const { road:marketRoad, blocks }=lanternMile;
  for (let i=buildings.length-1;i>=0;i--) {
    const b=buildings[i], facing=Math.sin(b.yaw);
    if (b.z-b.w/2<lanternMile.start || b.z+b.w/2>lanternMile.end || Math.abs(facing)<.999) continue;
    const roadCenter=b.x+facing*(b.d/2+b.streetGap+marketRoad.width/2);
    if (Math.abs(roadCenter-marketRoad.x)>.01) continue;
    if (b.sign) b.nightMarket=true;
    else buildings.splice(i,1);
  }
  const marketRandom=randomFor(54911);
  for (const [start,end] of blocks) {
    const count=Math.floor((end-start)/22);
    const span=(end-start)/count;
    for (const side of [-1,1]) for (let i=0;i<count;i++) {
      const at=start+span*(i+.5)-marketRoad.z;
      const d=26+marketRandom()*10, w=span-6.5-marketRandom()*2.3;
      const gap=7+marketRandom()*4;
      const b=[d,20,12,10].map(depth=>onFrontage(marketRoad,at,side,w,depth,depth<20?6:gap)).find(canPlace);
      if (!b) continue;
      b.h=38+marketRandom()*38+(i%3===1?22:0);
      if (b.d<20) b.h=Math.min(b.h,31+marketRandom()*16);
      limitToGuide(b);
      const type=[0,1,3,13,14][Math.floor(marketRandom()*5)];
      const style=[0,1,2,4,5][Math.floor(marketRandom()*5)];
      buildings.push({ ...b,type,style,retail:true,nightMarket:true });
    }
  }
  return buildings;
}
