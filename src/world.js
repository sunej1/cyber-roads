import { CatmullRomCurve3, Vector3 } from 'three';
import { closestSpine, coreTile, districtFor, spinePoint, tileSize, tileSeed } from './extent.js';
import { intersectsBuilding, randomFor } from './flight.js';

export const blockSize = tileSize / 5;
const edge = tileSize / 2;
const outline = new Vector3();

export function generateTile(col, row) {
  if (coreTile(col, row)) return null;
  const x = col * tileSize, z = row * tileSize;
  const seed = tileSeed(col, row);
  const random = randomFor(seed);
  const district = districtFor(col, row);
  const buildings = [], blocks = [];
  const isCanal = district.style === 5;
  const track = closestSpine(x, z);
  const passingGuide = [];
  for (let across = -edge - 28; across <= edge + 28; across += 8) {
    spinePoint(track, z + across, outline);
    passingGuide.push({ x: outline.x - x, y: outline.y, z: across });
  }
  const add = building => {
    if (!passingGuide.some(point => intersectsBuilding(point, building, 36))) buildings.push(building);
  };

  for (let j = 0; j < 5; j++) {
    for (let i = 0; i < 5; i++) {
      const localX = -edge + (i + .5) * blockSize;
      const localZ = -edge + (j + .5) * blockSize;
      if (isCanal && (i === 2 || (i === 3 && (j + row) % 3 === 0))) continue;
      const industrial = district.style === 3;
      const publicSpace = industrial && (i + j * 2 + seed % 11) % 9 === 0 ? 'yard'
        : !industrial && (i === 2 && j === 2 || (i + j * 3 + seed % 17) % 19 === 0) ? 'garden' : null;
      blocks.push({ x: localX, z: localZ, publicSpace });
      if (publicSpace) continue;
      const mainType = industrial ? (random() > .45 ? 6 : 0) : Math.floor(random() * 8);
      const mainH = industrial ? 20 + random() * 53 : 38 + random() ** 1.3 * (district.style === 1 ? 193 : 142);
      add({ x: localX - 13, z: localZ + 10, w: 47 + random() * 22, d: 47 + random() * 19, h: mainH,
        type: mainType, style: random() < .67 ? district.style : Math.floor(random() * 6) });
      if (random() < .84) {
        add({ x: localX + 37, z: localZ - 31, w: 17 + random() * 8, d: 20 + random() * 17, h: 9 + random() * (industrial ? 21 : 62),
          type: random() < .5 ? 0 : 2, style: Math.floor(random() * 6) });
      }
      if (random() < .60) {
        add({ x: localX + 40, z: localZ + 21, w: 13 + random() * 11, d: 27 + random() * 16,
          h: 7 + random() * 13, type: 0, style: district.style });
      }
    }
  }
  return { x, z, seed, district, buildings, blocks };
}

export function localTraffic(tile) {
  const points = [
    [-251,93,-243], [-2,105,-189], [226,92,-216], [249,88,-2],
    [198,83,233], [-6,109,228], [-228,98,227], [-254,87,9],
  ].map(([x, y, z]) => new Vector3(x, y, z));
  const nominal = new CatmullRomCurve3(points, true);
  const samples = nominal.getSpacedPoints(145).slice(0, -1);
  const track = closestSpine(tile.x, tile.z);
  for (const point of samples) {
    for (const building of tile.buildings) {
      if (intersectsBuilding(point, building, 14)) point.y = building.h + 30;
    }
    spinePoint(track, point.z + tile.z, outline);
    if (Math.abs(outline.x - tile.x - point.x) < 26) point.y = Math.max(point.y, outline.y + 34);
  }
  for (const step of [1, -1]) {
    for (let i = 0; i < samples.length * 2; i++) {
      const current = samples[(samples.length + (i * step) % samples.length) % samples.length];
      const next = samples[(samples.length + ((i + 1) * step) % samples.length) % samples.length];
      next.y = Math.max(next.y, current.y - Math.hypot(next.x - current.x, next.z - current.z) * .28);
    }
  }
  const curve = new CatmullRomCurve3(samples, true);
  curve.arcLengthDivisions = 440;
  const roads = [];
  for (const center of [-192, -64, 64, 192]) {
    roads.push({ horizontal: true, lane: center + 3, start: -307, end: 307, direction: 1 });
    roads.push({ horizontal: false, lane: center - 3, start: -307, end: 307, direction: 1 });
  }
  return { circuits: [{ curve, count: 7, speed: 40, length: curve.getLength() }], roads };
}
