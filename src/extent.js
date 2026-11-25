import { CatmullRomCurve3, Vector3 } from 'three';

export const tileSize = 640;
export const coreEdge = tileSize * 2.5;
const spineSpacing = tileSize * 3;

export const tileAt = coordinate => Math.floor((coordinate + tileSize / 2) / tileSize);
export const coreTile = (col, row) => Math.max(Math.abs(col), Math.abs(row)) <= 2;

const districts = [
  { name: 'Foundry Belt', description: 'Rail yards and manufacturing', color: '#f4b65f', style: 3 },
  { name: 'Signal Ward', description: 'Markets and residential towers', color: '#f1bf73', style: 4 },
  { name: 'Highline', description: 'Office towers and aerial transit', color: '#7fc6d7', style: 1 },
  { name: 'Breakwater', description: 'Canal blocks and freight streets', color: '#c4d695', style: 5 },
  { name: 'Stack District', description: 'Dense mixed-use blocks', color: '#f19376', style: 2 },
];

export function tileSeed(col, row) {
  const lowX = col | 0, lowZ = row | 0;
  const highX = Math.floor(col / 4294967296), highZ = Math.floor(row / 4294967296);
  const mixed = Math.imul(lowX ^ 0x6b4d, 0x45d9f3b) ^ Math.imul(lowZ ^ 0x720f, 0x119de1f3)
    ^ Math.imul(highX, 0x27d4eb2d) ^ Math.imul(highZ, 0x165667b1);
  return (mixed ^ mixed >>> 16) >>> 0;
}

export function districtFor(col, row) {
  return districts[tileSeed(Math.floor((col + 1) / 2), Math.floor((row + 1) / 2)) % districts.length];
}

const lateral = z => 108 * Math.sin(z * .00183) + 59 * Math.sin(z * .0046 + 1.38);
export const closestSpine = (x, z) => Math.round((x - lateral(z)) / spineSpacing);

export function spinePoint(track, z, out = new Vector3()) {
  return out.set(track * spineSpacing + lateral(z), 101 + 24 * Math.sin(z * .00245 + track * .7)
    + 16 * Math.sin(z * .0062 + 1.8), z);
}

export function makeDeparture(route, exit) {
  const start = route.getPointAt(exit);
  const tangent = route.getTangentAt(exit);
  const last = spinePoint(0, coreEdge + 154);
  const incoming = spinePoint(0, last.z - 69);
  const curve = new CatmullRomCurve3([
    start, start.clone().addScaledVector(tangent, 68), new Vector3(-215, 135, 1245),
    new Vector3(-138, 126, 1465), incoming, last,
  ]);
  curve.arcLengthDivisions = 512;
  return curve;
}
