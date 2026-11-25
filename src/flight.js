import { CatmullRomCurve3, Vector3, MathUtils } from 'three';

export const districts = [
  { name: 'Harbor Approach', description: 'South breakwater', point: 0, color: '#65eddf' },
  { name: 'Lantern Mile', description: 'Downtown tower canyon', point: 2, color: '#ff73bd' },
  { name: 'Glass Gardens', description: 'Civic square and public park', point: 5, color: '#a2f4ba' },
  { name: 'Crown Heights', description: 'North ridge overlook', point: 9, color: '#bc9bff' },
  { name: 'Outer Harbor', description: 'Offshore skyline view', point: 13, color: '#ffbc86' },
];

const waypoints = [
  [-154, 121, 1055], [-205, 107, 857], [-224, 98, 566], [-223, 99, 359],
  [-194, 93, 200], [-115, 76, 113], [12, 66, 91], [141, 77, 44],
  [218, 104, -130], [300, 137, -335], [426, 177, -565], [610, 223, -799],
  [864, 228, -848], [1115, 198, -620], [1202, 155, -232],
  [1153, 123, 256], [916, 116, 685], [556, 133, 1005], [212, 139, 1128],
].map(point => new Vector3(...point));

export const route = new CatmullRomCurve3(waypoints, true, 'centripetal');
route.arcLengthDivisions = 1200;
route.updateArcLengths();
export const length = route.getLength();
export const routeSamples = route.getSpacedPoints(440).slice(0, -1);
export const park = { x: 10, z: 105, w: 228, d: 174 };
export const plaza = { x: -220, z: 355, w: 142, d: 135 };
export const bounds = { minX: -1550, maxX: 1600, minZ: -1370, maxZ: 1540 };

export const shore = [
  [-1080, 560], [-1040, 100], [-980, -490], [-718, -805], [-440, -995],
  [15, -1020], [440, -940], [720, -680], [705, -310], [622, -80],
  [704, 184], [832, 477], [715, 660], [427, 731], [400, 916],
  [62, 979], [-256, 971], [-545, 936], [-817, 771],
];

function isOnLand(x, z) {
  let inside = false;
  for (let i = 0, j = shore.length - 1; i < shore.length; j = i++) {
    const [leftX, leftZ] = shore[j], [rightX, rightZ] = shore[i];
    if ((leftZ > z) !== (rightZ > z) && x < leftX + (rightX - leftX) * (z - leftZ) / (rightZ - leftZ)) inside = !inside;
  }
  return inside;
}

export function nearestRoute(position) {
  let best = Infinity;
  let index = 0;
  for (let i = 0; i < routeSamples.length; i++) {
    const point = routeSamples[i];
    const distance = (point.x - position.x) ** 2 + (point.z - position.z) ** 2;
    if (distance < best) {
      best = distance;
      index = i;
    }
  }
  return index / routeSamples.length;
}

for (const district of districts) district.station = nearestRoute(waypoints[district.point]);
export function districtAt(station) {
  return districts.findLast(district => district.station <= station) ?? districts[0];
}

export function intersectsBuilding(position, building, clearance = 3.5) {
  return position.y < building.h + clearance
    && Math.abs(position.x - building.x) < building.w / 2 + clearance
    && Math.abs(position.z - building.z) < building.d / 2 + clearance;
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
const wrap = MathUtils.euclideanModulo;
const damp = MathUtils.damp;
const angleTo = (current, target) => Math.atan2(Math.sin(target - current), Math.cos(target - current));
const heading = direction => Math.atan2(direction.x, -direction.z);

export function newFlight(station = 0) {
  return {
    position: route.getPointAt(station),
    station,
    yaw: heading(route.getTangentAt(station)),
    speed: 0,
    lift: 0,
    bank: 0,
    pitch: 0,
    distance: 0,
    warning: 0,
  };
}

export function advanceFlight(flight, input, guided, dt, buildings) {
  flight.warning = Math.max(0, flight.warning - dt);
  if (guided) {
    flight.speed = damp(flight.speed, 53 + 8 * flight.position.y / 225, 1.15, dt);
    flight.station = wrap(flight.station + flight.speed * dt / length, 1);
    route.getPointAt(flight.station, flight.position);
    route.getTangentAt(flight.station, forward);
    const turn = angleTo(flight.yaw, heading(forward));
    flight.yaw += turn * (1 - Math.exp(-6 * dt));
    flight.bank = damp(flight.bank, -MathUtils.clamp(turn * 1.6, -0.4, 0.4), 4, dt);
    flight.pitch = damp(flight.pitch, -forward.y * 0.9, 4, dt);
    flight.distance += flight.speed * dt;
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
  const inside = trial.x > bounds.minX && trial.x < bounds.maxX && trial.z > bounds.minZ && trial.z < bounds.maxZ;
  // shortcut: Tower bounds cover the full footprint and roof slab; rooftop obstacle flying would need individual mast and crown bounds.
  if (!inside || buildings.some(building => intersectsBuilding(trial, building, 5))) {
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
  const add = building => {
    const overlapsPublicSpace = [park, plaza].some(space =>
      Math.abs(space.x - building.x) < (space.w + building.w) / 2 + 7
      && Math.abs(space.z - building.z) < (space.d + building.d) / 2 + 7);
    const offshore = [-1, 1].some(x => [-1, 1].some(z =>
      !isOnLand(building.x + x * (building.w / 2 + 2), building.z + z * (building.d / 2 + 2))));
    if (offshore || overlapsPublicSpace || routeSamples.some(point => intersectsBuilding(point, building, 22))) return;
    buildings.push(building);
  };

  const landmarks = [
    { x: -132, z: 803, w: 71, d: 56, h: 158, type: 3, sign: 'NOCTURNE', style: 2 },
    { x: -339, z: 818, w: 72, d: 58, h: 121, type: 2, sign: 'PORT / 01', style: 1 },
    { x: -366, z: 628, w: 85, d: 78, h: 164, type: 1, sign: 'KAIROS', style: 2 },
    { x: -84, z: 597, w: 79, d: 84, h: 188, type: 2, sign: 'NOVA', style: 1 },
    { x: -358, z: 393, w: 76, d: 82, h: 183, type: 1, sign: 'LANTERN', style: 2 },
    { x: -99, z: 397, w: 72, d: 80, h: 232, type: 3, sign: 'SABLE', style: 2 },
    { x: 77, z: 469, w: 87, d: 79, h: 211, type: 2, sign: 'OYAMA', style: 1 },
    { x: 263, z: 271, w: 91, d: 68, h: 283, type: 1, sign: 'MERIDIAN', style: 1 },
    { x: 345, z: 176, w: 60, d: 53, h: 214, type: 2, style: 2 },
    { x: -386, z: 74, w: 95, d: 81, h: 213, type: 3, sign: 'ORBIT', style: 1 },
    { x: 32, z: -179, w: 74, d: 79, h: 173, type: 2, sign: 'VERDANT', style: 2 },
    { x: 409, z: -302, w: 78, d: 66, h: 219, type: 1, sign: 'CROWN', style: 2 },
    { x: 568, z: -432, w: 80, d: 73, h: 204, type: 3, style: 1 },
    { x: 689, z: 516, w: 79, d: 81, h: 127, type: 3, sign: 'TIDELINE', style: 1 },
  ];
  landmarks.forEach(add);

  for (let row = -7; row <= 7; row++) {
    for (let column = -7; column <= 6; column++) {
      const x = column * 136 + (random() - 0.5) * 26;
      const z = row * 125 + (random() - 0.5) * 32;
      const density = Math.hypot((x + 95) / 1120, (z + 25) / 1040);
      if (density > 1.03 + random() * 0.12 || (x > 590 && z < 110)) continue;
      if (z > 770 && (x < -580 || x > 430)) continue;
      const w = 55 + random() * 47;
      const d = 49 + random() * 51;
      const h = 27 + 159 * (1 - Math.min(0.94, density)) + random() ** 1.25 * 103;
      const type = Math.floor(random() * 4);
      const style = Math.floor(random() * 4);
      if (landmarks.some(tower => Math.abs(tower.x - x) < (w + tower.w) / 2 + 19
        && Math.abs(tower.z - z) < (d + tower.d) / 2 + 19)) continue;
      add({ x, z, w, d, h, type, style });
    }
  }
  for (let row = -5; row <= 6; row++) {
    for (let column = -6; column <= 5; column++) {
      const x = column * 136, z = row * 125;
      if (Math.hypot((x + 95) / 965, (z - 35) / 920) > 1) continue;
      if (buildings.some(b => Math.abs(b.x - x) < b.w / 2 + 53
        && Math.abs(b.z - z) < b.d / 2 + 43)) continue;
      for (const side of [-1, 1]) {
        add({
          x: x + side * 30, z: z + (random() - .5) * 16,
          w: 37 + random() * 12, d: 29 + random() * 15, h: 8 + random() * 7,
          type: 0, style: (row + column + (side === 1 ? 1 : 0) + 20) % 4,
        });
      }
    }
  }
  return buildings;
}
