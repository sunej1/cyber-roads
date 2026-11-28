import { CatmullRomCurve3, Vector3, MathUtils } from 'three';

export const tileSize = 640;
export const coreEdge = tileSize * 2.5;
export const blockSize = tileSize / 4;
const spineSpacing = tileSize * 3;
const beltLength = tileSize * 6;

export const tileAt = coordinate => Math.floor((coordinate + tileSize / 2) / tileSize);
export const coreTile = (col, row) => Math.max(Math.abs(col), Math.abs(row)) <= 2;

export const generatedDistricts = [
  { id: 'canal', name: 'Canal Exchange', description: 'Lock basins and dockside market streets', color: '#6ec6ba', style: 5, starts: 0, elevation: 48 },
  { id: 'downtown', name: 'Switchyard Center', description: 'Office towers over steel and glass arcades', color: '#f9ab68', style: 1, starts: 640, elevation: 53 },
  { id: 'industry', name: 'Foundry Belt', description: 'Freight rail and refinery complexes', color: '#ee9c68', style: 3, starts: 1760, elevation: 39 },
  { id: 'outskirts', name: 'Juniper Fringe', description: 'Terraced homes and planted shared courts', color: '#bfd99b', style: 0, starts: 2720, elevation: 35 },
];

export function tileSeed(col, row) {
  const lowX = col | 0, lowZ = row | 0;
  const highX = Math.floor(col / 4294967296), highZ = Math.floor(row / 4294967296);
  const mixed = Math.imul(lowX ^ 0x6b4d, 0x45d9f3b) ^ Math.imul(lowZ ^ 0x720f, 0x119de1f3)
    ^ Math.imul(highX, 0x27d4eb2d) ^ Math.imul(highZ, 0x165667b1);
  return (mixed ^ mixed >>> 16) >>> 0;
}

const beltOffset = track => track === 0 ? 0 : tileSeed(track, 37) % beltLength;
const beltStation = (track, z) => MathUtils.euclideanModulo(Math.abs(z) - coreEdge + beltOffset(track), beltLength);

export function arterialX(x, z) {
  return x + Math.sin(z * .00191 + x * .00124) * 121 + Math.sin(z * .0046 - x * .00176 + 1.02) * 39;
}

export function streetVertex(x, z) {
  return { x: arterialX(x, z), z: z + Math.sin(x * .0033 + z * .0016) * 42 + Math.sin(x * .0061) * 13 };
}

function trackX(track, z) {
  const main = track * spineSpacing;
  const station = beltStation(track, z);
  const canyon = MathUtils.smoothstep(station, 480, 745) * (1 - MathUtils.smoothstep(station, 1660, 1840));
  const curve = Math.sin(z * .0065 + track * .4) * (57 - 41 * canyon)
    + Math.sin(z * .0105 + 2) * (27 - 20 * canyon);
  return arterialX(main,z) + curve;
}

export function closestSpine(x, z) {
  const base = Math.round(x / spineSpacing);
  let nearest = base;
  for (const track of [base - 1, base + 1]) {
    if (Math.abs(x - trackX(track, z)) < Math.abs(x - trackX(nearest, z))) nearest = track;
  }
  return nearest;
}

function districtIndex(station) {
  return generatedDistricts.findLastIndex(district => district.starts <= station);
}

export function districtForPosition(x, z) {
  const track = closestSpine(x, z);
  const station = beltStation(track, z);
  const edge = Math.abs(x - trackX(track, z));
  const district = generatedDistricts[districtIndex(station)];
  if (edge > 657 + 93 * Math.sin(z * .0022)) {
    return district.id === 'downtown' ? generatedDistricts[0] : generatedDistricts[3];
  }
  return district;
}

export function spinePoint(track, z, out = new Vector3()) {
  const station = beltStation(track, z);
  const index = districtIndex(station);
  const district = generatedDistricts[index];
  const next = generatedDistricts[(index + 1) % generatedDistricts.length];
  const end = next.starts || beltLength;
  const blend = MathUtils.smoothstep(station, end - 230, end);
  const zWave = 6.4 * Math.sin(z * .0057 + track * .9) + 3.2 * Math.sin(z * .0117);
  return out.set(trackX(track, z), MathUtils.lerp(district.elevation, next.elevation, blend) + zWave, z);
}

export function riverAt(x, z) {
  const track = Math.round((x - 344) / spineSpacing);
  const station = beltStation(track,z);
  const dockBend = MathUtils.smoothstep(station,25,315) * (1 - MathUtils.smoothstep(station,455,920));
  const center = track * spineSpacing + 344 + Math.sin(z * .00152 + track * .74) * 176 + Math.sin(z * .00374) * 47
    - 263 * dockBend;
  const width = 43 + 12 * Math.sin(z*.0011+track)
    + 22 * MathUtils.smoothstep(station,0,120) * (1 - MathUtils.smoothstep(station,460,690));
  return { center, width, distance: Math.abs(x - center) - width };
}

export function groundAt(x, z) {
  const riverBank = riverAt(x, z).distance;
  const coast = Math.max(Math.abs(x), Math.abs(z)) - (coreEdge + 43 + 36 * Math.cos(x * .0071 - z * .0033));
  return -10 + 10 * MathUtils.smoothstep(Math.min(coast, riverBank), -15, 16);
}

const landmarkPlans = [
  { name: 'Sable Locks', code: 'LOCK 04', at: 340, side: 1, offset: 114, w: 72, d: 81, h: 69, type: 11, style: 5, ad: 'freight' },
  { name: 'Keystone Exchange', code: 'KEYSTONE', at: 904, side: -1, offset: 82, w: 76, d: 71, h: 206, type: 8, style: 1, ad: 'kairos' },
  { name: 'Lift 24', code: 'LIFT 24', at: 1401, side: 1, offset: 91, w: 83, d: 74, h: 226, type: 9, style: 2, ad: 'metro' },
  { name: 'Kiln Nine', code: 'KILN 09', at: 2150, side: -1, offset: 102, w: 103, d: 84, h: 118, type: 10, style: 3, ad: 'grid' },
  { name: 'Juniper Reservoir', code: 'JUNIPER', at: 3110, side: 1, offset: 105, w: 53, d: 52, h: 61, type: 12, style: 0, ad: 'verdant' },
];

const alternates = [
  [['Fallow Locks','LOCK 11'], ['East Weir','WEIR 12'], ['Parcel Basin','PIER 16']],
  [['Aster Exchange','ASTER'], ['Copper Exchange','COPPER'], ['Relay Exchange','RELAY']],
  [['Arcway Lift','LIFT 07'], ['Civic Lift','LIFT 18'], ['Midline Lift','LIFT 32']],
  [['Kiln Five','KILN 05'], ['Delta Works','DELTA'], ['Ashbury Works','ASHBURY']],
  [['Alder Reservoir','ALDER'], ['Rook Reservoir','ROOK'], ['Cedar Reservoir','CEDAR']],
];

export function landmarksNear(x, z, range) {
  const result = [];
  const firstTrack = Math.floor((x - range) / spineSpacing);
  const lastTrack = Math.ceil((x + range) / spineSpacing);
  for (let track = firstTrack; track <= lastTrack; track++) {
    for (const direction of [-1, 1]) {
      const start = coreEdge - beltOffset(track);
      const first = Math.floor((z * direction - range - start) / beltLength);
      const last = Math.floor((z * direction + range - start) / beltLength);
      for (let cycle = first; cycle <= last; cycle++) for (let index=0;index<landmarkPlans.length;index++) {
        const plan=landmarkPlans[index];
        const firstTour=track===0 && cycle===0 && direction===1;
        const seed=tileSeed(track+direction*843,cycle*11+index);
        const variant=firstTour ? null : alternates[index][seed % 3];
        const along=start+cycle*beltLength+plan.at+(firstTour?0:seed%83-41);
        const worldZ=along*direction;
        if (along<coreEdge+104 || Math.abs(worldZ-z)>range) continue;
        const guide=trackX(track,worldZ);
        const side=firstTour || seed%5>1 ? plan.side : -plan.side;
        let anchor=guide+side*plan.offset;
        if (groundAt(anchor,worldZ)<-1.2) anchor=guide-side*(plan.offset+7);
        if (groundAt(anchor,worldZ)<-1.2 || Math.abs(anchor-x)>range) continue;
        const yaw=Math.atan2(trackX(track,worldZ+10)-trackX(track,worldZ-10),20)*.45;
        const h=variant ? plan.h*(.89+(seed%33)/100) : plan.h;
        result.push({ ...plan, h, code:variant?.[1]??plan.code, x:anchor, z:worldZ, yaw,
          towardGuide:anchor>guide?-1:1, landmark:variant?.[0]??plan.name });
      }
    }
  }
  return result;
}

export function makeDeparture(route) {
  const start = route.getPointAt(1);
  const tangent = route.getTangentAt(1);
  const last = spinePoint(0, coreEdge + 164);
  const incoming = spinePoint(0, last.z - 69);
  const curve = new CatmullRomCurve3([
    start, start.clone().addScaledVector(tangent, 63), new Vector3(-258, 76, 1260),
    new Vector3(-211, 58, 1456), incoming, last,
  ]);
  curve.arcLengthDivisions = 512;
  return curve;
}
