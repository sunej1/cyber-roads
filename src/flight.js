import { CatmullRomCurve3, Vector3, MathUtils } from 'three';
import { closestSpine, coreEdge, makeDeparture, spinePoint } from './extent.js';
import { blockDepth, blockWidth, isOnLand, park, plaza, streetFront } from './meridian-plan.js';
export { park, plaza, shore } from './meridian-plan.js';

export const districts = [
  { name: 'Harbor Approach', description: 'South breakwater', point: 0, color: '#65eddf' },
  { name: 'Lantern Mile', description: 'Downtown tower canyon', point: 2, color: '#ff73bd' },
  { name: 'Glass Gardens', description: 'Civic square and public park', point: 5, color: '#a2f4ba' },
  { name: 'Crown Heights', description: 'Tower canyon and transit decks', point: 9, color: '#bc9bff' },
  { name: 'Westbank', description: 'Canals and old warehouse lanes', point: 15, color: '#ffbc86' },
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
  const add = (building, front) => {
    const overlapsPublicSpace = [park, plaza].some(space =>
      Math.abs(space.x - building.x) < (space.w + building.w) / 2 + 7
      && Math.abs(space.z - building.z) < (space.d + building.d) / 2 + 7);
    const offshore = [-1, 1].some(x => [-1, 1].some(z =>
      !isOnLand(building.x + x * (building.w / 2 + 2), building.z + z * (building.d / 2 + 2))));
    if (offshore || overlapsPublicSpace || routeSamples.some(point => intersectsBuilding(point, building, 22))) return;
    if (front) {
      building = { ...building,yaw:front.yaw,frontage:true,streetGap:front.gap,
        w:front.road.horizontal?building.w:building.d,d:front.road.horizontal?building.d:building.w };
    }
    buildings.push(building);
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
    { x: -386, z: 74, w: 95, d: 81, h: 213, type: 4, sign: 'ORBIT', style: 1 },
    { x: 32, z: -179, w: 74, d: 79, h: 173, type: 7, sign: 'VERDANT', style: 5 },
    { x: 409, z: -302, w: 78, d: 66, h: 219, type: 5, sign: 'CROWN', style: 0 },
    { x: 568, z: -432, w: 80, d: 73, h: 204, type: 3, style: 1 },
    { x: -651, z: 388, w: 65, d: 63, h: 85, type: 10, sign: 'TIDELINE', style: 3 },
    { x: -349, z: 909, w: 56, d: 55, h: 59, type: 12, sign: 'VERDANT', style: 5 },
    { x: 689, z: 516, w: 79, d: 81, h: 127, type: 6, sign: 'TIDELINE', style: 5 },
  ];
  landmarks.forEach(building=>add(building));

  for (let row = -7; row <= 7; row++) {
    for (let column = -7; column <= 6; column++) {
      const x = column * blockWidth, z = row * blockDepth;
      const density = Math.hypot((x + 95) / 1120, (z + 25) / 1040);
      if (density>1.10 || (x>590 && z<110)) continue;
      const westbank=x<-505 && z>150, waterfront=z>=700;
      const civic = Math.hypot((x-park.x)/220,(z-park.z)/160)<1.25
        || Math.hypot((x-plaza.x)/190,(z-plaza.z)/150)<1.20;
      const hubs = Math.min(Math.hypot((x+204)/310,(z-562.5)/270),Math.hypot((x-204)/320,(z+62.5)/380));
      const w = (westbank?82:65)+random()*22, d = (westbank?55:54)+random()*24;
      const front = streetFront({x,z,w,d});
      if (!front) continue;
      const h = westbank?19+random()*29 : waterfront?14+random()*31 : civic?34+random()*37
        : 39+120*Math.max(0,1-hubs*.55)+(front.road.kind==='avenue'?30:0)+random()*56;
      const pool = westbank?[10,13,15]:waterfront?[13,14,16]:civic?[3,4,7,12]:[0,1,2,3,4,5,6,7,8,9,14];
      const type = pool[Math.floor(random()*pool.length)];
      const style = westbank?3:waterfront?5:Math.floor(random()*6);
      if (landmarks.some(tower => Math.abs(tower.x - x) < (w + tower.w) / 2 + 19
        && Math.abs(tower.z - z) < (d + tower.d) / 2 + 19)) continue;
      add({ x,z,w,d,h,type,style,retail:!westbank },front);
    }
  }
  for (let row = -7; row <= 7; row++) {
    for (let column = -7; column <= 6; column++) {
      const x = column * blockWidth, z = row * blockDepth;
      if (Math.hypot((x+95)/1080,(z-35)/1020)>1) continue;
      for (const [dx, dz] of [[-37,-33],[37,-33],[-37,33],[37,33]]) {
        const footprint = {
          x:x+dx,z:z+dz,w:24+random()*15,d:24+random()*12,h:9+random()**1.65*(z>=700?20:38),
          type:13+Math.floor(random()*4),style:Math.floor(random()*6),retail:x>-510,
        };
        if (buildings.some(b => {
          const quarterTurn = Math.abs(b.yaw)===Math.PI/2;
          return Math.abs(b.x-footprint.x)<((quarterTurn?b.d:b.w)+footprint.w)/2+5
            && Math.abs(b.z-footprint.z)<((quarterTurn?b.w:b.d)+footprint.d)/2+5;
        })) continue;
        const front=streetFront(footprint);
        if (front) add(footprint,front);
      }
    }
  }
  return buildings;
}
