import { CatmullRomCurve3, Vector3 } from 'three';
import { blockSize, closestSpine, coreTile, districtForPosition, groundAt, landmarksNear, spinePoint,
  streetVertex, tileAt, tileSize, tileSeed } from './extent.js';
import { departure, intersectsBuilding, randomFor } from './flight.js';

const edge = tileSize / 2;
const lanesAcross = tileSize / blockSize;
const outline = new Vector3();
const approach = departure.getSpacedPoints(105);

function pavedRoads(col, row) {
  const originX = col * tileSize, originZ = row * tileSize;
  const roads = [];
  for (let j = 0; j < lanesAcross; j++) for (let i = 0; i < lanesAcross; i++) {
    const gridX = col * lanesAcross + i - 2;
    const gridZ = row * lanesAcross + j - 2;
    for (const alongZ of [true, false]) {
      const start = streetVertex(gridX * blockSize, gridZ * blockSize);
      const end = streetVertex((gridX + +!alongZ) * blockSize, (gridZ + +alongZ) * blockSize);
      const x = (start.x + end.x) / 2, z = (start.z + end.z) / 2;
      const district = districtForPosition(x, z);
      const major = (alongZ ? gridX : gridZ) % 4 === 0;
      const rail = alongZ && (gridX % 12 === -2 || gridX % 12 === 10) && district.id === 'industry';
      const minor = (alongZ ? gridX : gridZ) % 2 === 0;
      const localX=((gridX%4)+4)%4, localZ=((gridZ%4)+4)%4;
      const blockPlan=tileSeed(Math.floor(gridX/4),Math.floor(gridZ/4));
      const access=blockPlan%2===0 ? 1 : 3;
      const chance={ downtown:98, canal:68, industry:43, outskirts:0 }[district.id];
      const random=tileSeed(gridX*2+Number(alongZ),gridZ)%100;
      const localRoad=district.id==='outskirts'
        ? alongZ ? localX===access && localZ<3 : localZ===2 && localX<access+1
        : random<chance+(minor?22:0);
      if (!major && !rail && !localRoad) continue;
      const water = [start, { x, z }, end].map(point => groundAt(point.x, point.z) < -2.3);
      const bridge = water.some(Boolean);
      if (bridge && !major && !rail) continue;
      if (water.every(Boolean) && !rail && (!alongZ || gridX % 12 !== 0)) continue;
      const kind = rail ? 'rail' : major ? 'avenue' : minor ? 'collector' : 'street';
      const width = rail ? 12 : major ? 23 : minor ? 13 : 9.5;
      roads.push({ x: start.x - originX, z: start.z - originZ, toX: end.x - originX, toZ: end.z - originZ, kind, width, bridge });
    }
  }
  return roads;
}

function parcelPoint(lot, x, z) {
  const cos = Math.cos(lot.yaw), sin = Math.sin(lot.yaw);
  return [lot.x + x * cos + z * sin, lot.z + z * cos - x * sin];
}

export function generateTile(col, row) {
  if (coreTile(col, row)) return null;
  const x = col * tileSize, z = row * tileSize;
  const seed = tileSeed(col, row);
  const random = randomFor(seed);
  const district = districtForPosition(x, z);
  const buildings = [], blocks = [];
  const points = landmarksNear(x, z, edge + 155);
  const landmarks = [];
  const track = closestSpine(x, z);
  const passingGuide = [];
  for (let across = -edge - 42; across <= edge + 42; across += 6) {
    for (const nearby of [track - 1, track, track + 1]) {
      spinePoint(nearby, z + across, outline);
      if (Math.abs(outline.x - x) < edge + 156) passingGuide.push({ x: outline.x - x, y: outline.y, z: across });
    }
  }
  if (Math.abs(col) <= 1 && row === 3) {
    for (const point of approach) passingGuide.push({ x: point.x - x, y: point.y, z: point.z - z });
  }
  const clearsGuide = building => !passingGuide.some(point => intersectsBuilding(point, building, 20));
  const land = (a, b) => groundAt(a + x, b + z) > -1.6;
  for (const item of points) {
    if (tileAt(item.x) !== col || tileAt(item.z) !== row) continue;
    const { code, ad, landmark, x: worldX, z: worldZ, ...shape } = item;
    const building = { ...shape, x: worldX - x, z: worldZ - z, landmark, sign: code, ad };
    if (!clearsGuide(building)) continue;
    buildings.push(building);
    landmarks.push(building);
  }
  const roads = pavedRoads(col, row);
  const add = (lot, dx, dz, w, d, h, type, style, sign) => {
    const [localX, localZ] = parcelPoint(lot, dx, dz);
    const orientation = random() < .5 ? lot.yaw : lot.yaw + Math.PI;
    const footprint = { x: localX, z: localZ, yaw: sign || lot.kind==='downtown' ? lot.yaw : orientation, w, d, h, type, style, sign };
    if (points.some(point => Math.abs(point.x - x - localX) < (point.w + w) / 2 + 16
      && Math.abs(point.z - z - localZ) < (point.d + d) / 2 + 16)) return;
    const corners = [[-w/2,-d/2],[w/2,-d/2],[-w/2,d/2],[w/2,d/2]];
    if (corners.some(([a,b]) => !land(...parcelPoint(lot,dx+a,dz+b)))) return;
    if (clearsGuide(footprint)) {
      buildings.push(footprint);
      return;
    }
    // Keep the street wall occupied where a tower would have cut into the low flight corridor.
    const podium = { ...footprint, h: 11 + random() * 7, type: 13 };
    if (h > 29 && clearsGuide(podium)) buildings.push(podium);
  };

  for (let j = 0; j < lanesAcross; j++) for (let i = 0; i < lanesAcross; i++) {
    const gridX = x - edge + i * blockSize, gridZ = z - edge + j * blockSize;
    const corners = [[0,0],[blockSize,0],[blockSize,blockSize],[0,blockSize]]
      .map(([dx,dz]) => streetVertex(gridX + dx, gridZ + dz));
    const px = corners.reduce((sum, point) => sum + (point.x - x), 0) / 4;
    const pz = corners.reduce((sum, point) => sum + (point.z - z), 0) / 4;
    const kind = districtForPosition(px + x, pz + z).id;
    const lot = { x: px, z: pz, yaw: Math.atan2(corners[3].x - corners[0].x, corners[3].z - corners[0].z),
      kind, corners: corners.map(point => [point.x - x, point.z - z]) };
    if (!land(px,pz)) continue;
    blocks.push(lot);
    const roll = random();
    if (kind === 'downtown') {
      if (roll < .088) { lot.use = 'plaza'; continue; }
      lot.use = 'urban';
      const column = ((Math.round(gridX/blockSize) % 12) + 12) % 12;
      for (const [dx,dz] of [[-34,-33],[32,-34],[-33,32],[33,32]]) {
        const type = [2,4,5,7,8,9,14][Math.floor(random()*7)];
        const frontage = (column===0 && dx<0) || (column===11 && dx>0);
        const h = frontage ? 90 + random()*152 : 49 + random()**1.36*192;
        const sign = h > 102 && random() < .23 ? ['kairos','optics','metro','nova'][Math.floor(random()*4)] : undefined;
        const w = 42 + random()*16, d = 40 + random()*15;
        add(lot, dx, dz, w, d, h, type, [0,1,2,4][Math.floor(random()*4)], sign);
      }
      for (const side of [-1, 1]) {
        add(lot, -side*2, side*51, 15+random()*9, 18+random()*6, 12+random()*22,
          13, random() < .65 ? 4 : 2, random() < .34 ? 'optics' : undefined);
      }
    } else if (kind === 'industry') {
      if (roll < .27) { lot.use = roll < .13 ? 'tanks' : 'yard'; continue; }
      lot.use = 'works';
      add(lot, -9, 3, 102 + random()*11, 60 + random()*17, 17 + random()*26, roll < .66 ? 15 : 10, 3);
      add(lot, 31, -47, 35, 18, 8 + random()*7, 13, 4, 'freight');
    } else if (kind === 'outskirts') {
      if (roll < .49) { lot.use = 'grove'; continue; }
      lot.use = 'estate';
      const side = roll < .75 ? -1 : 1;
      for (let k = -2; k <= 2; k++) {
        add(lot, k*21, side*(23 + 7*Math.abs(k)), 13+random()*5, 15+random()*12,
          10+random()*15, 16, [0,3,4,5][Math.floor(random()*4)]);
      }
      if (roll > .8) add(lot, 8, -side*26, 63, 25, 12, 16, 5, 'verdant');
    } else {
      if (roll < .23) { lot.use = roll < .12 ? 'yard' : 'plaza'; continue; }
      lot.use = 'market';
      for (const [dx,dz] of [[-40,-33],[-6,-36],[38,-35],[-34,28],[15,24],[49,28]]) {
        const h = 13 + random()**1.7*85;
        add(lot, dx, dz, 21+random()*10, 29+random()*9, h, h < 24 ? 16 : 14,
          random() < .67 ? 5 : 4, random() < .19 ? 'market' : undefined);
      }
    }
  }
  const skywalks = [];
  if (district.id === 'downtown') {
    for (const shift of [-139,112]) {
      spinePoint(track,z+shift,outline);
      const guideX=outline.x-x;
      const towerAt=side=>buildings.filter(b=>b.h>108 && (b.x-guideX)*side>30
        && Math.abs(b.x-guideX)<136 && Math.abs(b.z-shift)<73)
        .sort((a,b)=>Math.hypot(a.x-guideX,a.z-shift)-Math.hypot(b.x-guideX,b.z-shift))[0];
      const left=towerAt(-1),right=towerAt(1);
      if (!left || !right) continue;
      const dx=right.x-left.x,dz=right.z-left.z;
      const h=shift>0?101:94;
      const bridge={x:(left.x+right.x)/2,z:(left.z+right.z)/2,w:10,d:Math.hypot(dx,dz),
        yaw:Math.atan2(dx,dz),base:h-8,h,from:left,to:right};
      if (!clearsGuide(bridge)) continue;
      skywalks.push(bridge);
    }
  }
  return { x, z, seed, district, buildings, blocks, roads, landmarks, skywalks };
}

export function localTraffic(tile) {
  const points = [
    [-258,65,-252], [-5,81,-237], [242,72,-245], [270,64,-16],
    [236,62,238], [-10,79,254], [-228,65,221], [-253,58,4],
  ].map(([x, y, z]) => new Vector3(x, y, z));
  const nominal = new CatmullRomCurve3(points, true);
  const samples = nominal.getSpacedPoints(230).slice(0, -1);
  const track = closestSpine(tile.x, tile.z);
  const obstacles = tile.buildings.concat(tile.skywalks);
  for (const point of samples) {
    for (const building of obstacles) {
      if (intersectsBuilding(point, building, 21)) point.y = building.h + 33;
    }
    spinePoint(track, point.z + tile.z, outline);
    if (Math.abs(outline.x - tile.x - point.x) < 27) point.y = Math.max(point.y, outline.y + 36);
  }
  for (const step of [1, -1]) {
    for (let i = 0; i < samples.length * 2; i++) {
      const current = samples[(samples.length + (i * step) % samples.length) % samples.length];
      const next = samples[(samples.length + ((i + 1) * step) % samples.length) % samples.length];
      next.y = Math.max(next.y, current.y - Math.hypot(next.x - current.x, next.z - current.z) * .31);
    }
  }
  const curve = new CatmullRomCurve3(samples, true);
  curve.arcLengthDivisions = 450;
  const roads = tile.roads.filter(road => road.kind !== 'rail' && (road.kind !== 'street' || tile.district.id === 'downtown'))
    .flatMap(road => {
      const end=Math.hypot(road.toX-road.x,road.toZ-road.z);
      return (road.kind==='avenue'?[-1,1]:[Math.sign(road.x+road.toZ)||1])
        .map(direction=>({ start:0,end,path:road,direction }));
    });
  const quiet = tile.district.id === 'outskirts';
  return { circuits: [{ curve, count: quiet ? 2 : tile.district.id === 'downtown' ? 10 : 6,
    speed: quiet ? 31 : 42, length: curve.getLength() }], roads };
}
