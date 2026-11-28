import { CatmullRomCurve3, MathUtils, Vector3 } from 'three';
import { blockSize, closestSpine, coreTile, districtForPosition, groundAt, landmarksNear, riverAt, spinePoint,
  streetVertex, tileAt, tileSize, tileSeed } from './extent.js';
import { departure, footprintsOverlap, intersectsBuilding, randomFor } from './flight.js';

const edge = tileSize / 2;
const lanesAcross = tileSize / blockSize;
const outline = new Vector3();
const approach = departure.getSpacedPoints(105);

const mod = MathUtils.euclideanModulo;
const roadWidths = { avenue: 25, collector: 16, street: 11, rail: 12 };
const roadRank = { avenue: 3, collector: 2, street: 1 };
const roadKey = (column,row,alongZ) => `${column}/${row}/${Number(alongZ)}`;

function streetKind(column, row, alongZ, district) {
  const x = mod(column,4), z = mod(row,4);
  const across = alongZ ? x : z;
  if (across === 0) return 'avenue';
  if (district === 'downtown') return across === 2 ? 'collector' : 'street';
  if (district === 'industry') {
    if (alongZ && mod(column,12) === 10) return 'rail';
    if (!alongZ && z === 2) return 'collector';
    if (alongZ && (x === 1 || x === 3) && z >= 2) return 'street';
  }
  if (district === 'canal') {
    if (across === 2) return 'collector';
    if (alongZ ? x === 1 && z < 2 : z === 1 && x < 2) return 'street';
  }
  if (district === 'outskirts') {
    const flipped = mod(Math.floor(column/4)+Math.floor(row/4),2) === 1;
    const fromAvenue = flipped ? (alongZ ? 3-z : 4-z) : z;
    if (alongZ ? (x === 1 || x === 3) && fromAvenue < 3 : fromAvenue === 3 && x >= 1 && x < 3) {
      return 'street';
    }
  }
}

function pavedRoads(col, row) {
  const firstX = col*lanesAcross-2, firstZ = row*lanesAcross-2;
  const candidates = new Map(), links = new Map(), arterial = new Set();
  const startNodes = new Map();
  const vertex = (x,z) => {
    const key = `${x}/${z}`;
    if (!startNodes.has(key)) startNodes.set(key,streetVertex(x*blockSize,z*blockSize));
    return startNodes.get(key);
  };
  const link = (from,to) => {
    if (!links.has(from)) links.set(from,[]);
    links.get(from).push(to);
  };
  // A superblock fits in the halo, so access checks see its connections across tile boundaries.
  for (let z=firstZ-4;z<firstZ+lanesAcross+4;z++) for (let x=firstX-4;x<firstX+lanesAcross+4;x++) {
    for (const alongZ of [true,false]) {
      const dx = Number(!alongZ), dz = Number(alongZ);
      const a = vertex(x,z), b = vertex(x+dx,z+dz);
      const district = districtForPosition((a.x+b.x)*.5,(a.z+b.z)*.5).id;
      const kind = streetKind(x,z,alongZ,district);
      if (!kind) continue;
      const underwater = t => groundAt(MathUtils.lerp(a.x,b.x,t),MathUtils.lerp(a.z,b.z,t)) < -2.35;
      const water = [0,.25,.5,.75,1].map(underwater);
      const bridge = water.some(Boolean);
      if (bridge && kind !== 'avenue' && kind !== 'rail') continue;
      if (water.every(Boolean)) {
        const nearBank = vertex(x-dx,z-dz), farBank = vertex(x+2*dx,z+2*dz);
        if (groundAt(nearBank.x,nearBank.z)<-2.35 || groundAt(farBank.x,farBank.z)<-2.35) continue;
      }
      const road = { a,b,kind,bridge,width:roadWidths[kind] };
      candidates.set(roadKey(x,z,alongZ),road);
      if (kind === 'rail') continue;
      link(a,b);
      link(b,a);
      if (kind === 'avenue') { arterial.add(a); arterial.add(b); }
    }
  }
  const reachable = new Set(arterial);
  const queue = [...arterial];
  for (let i=0;i<queue.length;i++) {
    for (const neighbor of links.get(queue[i])) {
      if (reachable.has(neighbor)) continue;
      reachable.add(neighbor);
      queue.push(neighbor);
    }
  }
  const streetAt = (x,z,alongZ) => {
    const road = candidates.get(roadKey(x,z,alongZ));
    return road && (road.kind === 'rail' || reachable.has(road.a)) ? road : null;
  };
  const roads = [];
  for (let z=firstZ;z<firstZ+lanesAcross;z++) for (let x=firstX;x<firstX+lanesAcross;x++) {
    for (const alongZ of [true,false]) {
      const road = streetAt(x,z,alongZ);
      if (!road) continue;
      const {a,b,kind,bridge,width} = road;
      roads.push({x:a.x-col*tileSize,z:a.z-row*tileSize,toX:b.x-col*tileSize,toZ:b.z-row*tileSize,kind,bridge,width});
    }
  }
  return { roads, streetAt };
}

function joinMarketFrontage(lot, skywalks, clearsGuide) {
  const {front}=lot;
  const span=Math.hypot(front.bx-front.ax,front.bz-front.az);
  const dx=(front.bx-front.ax)/span, dz=(front.bz-front.az)/span;
  const at=(along,inset)=>({x:front.ax+dx*along+front.inX*inset,z:front.az+dz*along+front.inZ*inset});
  const shops=lot.buildings.map(b=>({along:(b.x-front.ax)*dx+(b.z-front.az)*dz,w:b.w}))
    .sort((a,b)=>a.along-b.along);
  const curb=front.road.width/2;
  for (let i=1;i<shops.length;i++) {
    const left=shops[i-1], right=shops[i];
    const start=left.along+left.w/2, end=right.along-right.w/2;
    const gap=end-start, middle=(start+end)/2;
    const from=at(start-1.4,curb+13.5), to=at(end+1.4,curb+13.5);
    const passage={...at(middle,curb+13.5),w:12,d:gap+2.8,yaw:Math.atan2(dx,dz),
      base:5.2,h:13.2,from,to,marketPassage:true};
    if (!clearsGuide(passage)) continue;
    skywalks.push(passage);
    if (gap>=12) lot.receivingGate=at(middle,curb);
  }
}

export function generateTile(col, row) {
  if (coreTile(col, row)) return null;
  const x = col * tileSize, z = row * tileSize;
  const seed = tileSeed(col, row);
  const random = randomFor(seed);
  const district = districtForPosition(x, z);
  const buildings = [], blocks = [], skywalks = [];
  const points = landmarksNear(x, z, edge + 155);
  const landmarks = [];
  const reservations = points.map(point=>({ ...point,x:point.x-x,z:point.z-z }));
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
  const { roads, streetAt } = pavedRoads(col,row);
  const add = (lot, side, along, w, d, h, type, style, sign) => {
    const setback = side.road.width/2 + (lot.use==='works' ? 17 : lot.use==='estate' ? 10 :
      lot.use==='urban' && side.spine ? 19 : 6);
    const depth = setback + d/2;
    const localX = MathUtils.lerp(side.ax,side.bx,along)+side.inX*depth;
    const localZ = MathUtils.lerp(side.az,side.bz,along)+side.inZ*depth;
    const footprint = { x:localX,z:localZ,yaw:side.yaw,w,d,h,type,style,sign,frontage:true,
      streetGap:setback-side.road.width/2,
      retail:lot.use==='market' || lot.use==='urban' };
    if (reservations.some(building=>footprintsOverlap(building,footprint,11))
      || lot.buildings.some(building=>footprintsOverlap(building,footprint,4))) return;
    const corners = [[-w/2,-d/2],[w/2,-d/2],[-w/2,d/2],[w/2,d/2]];
    const sine = Math.sin(side.yaw), cosine = Math.cos(side.yaw);
    for (const [across, back] of corners) {
      const px = localX+across*cosine+back*sine, pz = localZ+back*cosine-across*sine;
      if (!land(px,pz) || lot.sides.some(s=>(px-s.ax)*s.inX+(pz-s.az)*s.inZ<(s.road?.width??0)/2+4)) return;
      if (lot.shorefront && riverAt(px+x,pz+z).distance<22) return;
    }
    if (clearsGuide(footprint)) {
      buildings.push(footprint);
      lot.buildings.push(footprint);
      return;
    }
    // Keep the street wall occupied where a tower would have cut into the low flight corridor.
    const industrial=lot.use==='works';
    const podium = { ...footprint,h:industrial?8+random()*4:10+random()*6,type:industrial?15:13 };
    if ((h>29 || industrial) && clearsGuide(podium)) { buildings.push(podium); lot.buildings.push(podium); }
  };

  for (let j = 0; j < lanesAcross; j++) for (let i = 0; i < lanesAcross; i++) {
    const gridX = x - edge + i * blockSize, gridZ = z - edge + j * blockSize;
    const gx = gridX/blockSize, gz = gridZ/blockSize;
    const corners = [[0,0],[blockSize,0],[blockSize,blockSize],[0,blockSize]].map(([dx,dz]) => {
      const point=streetVertex(gridX+dx,gridZ+dz);
      return [point.x-x,point.z-z];
    });
    const px = corners.reduce((sum,point)=>sum+point[0],0)/4;
    const pz = corners.reduce((sum,point)=>sum+point[1],0)/4;
    const kind = districtForPosition(px + x, pz + z).id;
    if (!land(px,pz)) continue;
    const edges = [streetAt(gx,gz,false),streetAt(gx+1,gz,true),streetAt(gx,gz+1,false),streetAt(gx,gz,true)];
    const sides = corners.map(([ax,az],index)=>{
      const [bx,bz] = corners[(index+1)%4];
      const dx = bx-ax, dz = bz-az, span = Math.hypot(dx,dz);
      const spine=(index===1 && mod(gx+1,12)===0) || (index===3 && mod(gx,12)===0);
      return { ax,az,bx,bz,index,inX:-dz/span,inZ:dx/span,yaw:Math.atan2(dz,-dx),road:edges[index],spine };
    });
    const isAccess = ({road})=>road && !road.bridge && road.kind!=='rail';
    const rank = (a,b)=>roadRank[b.road.kind]-roadRank[a.road.kind] || Number(b.spine)-Number(a.spine);
    const access = sides.filter(isAccess).sort(rank);
    const front = access[0];
    const rail = sides.find(side=>side.road?.kind==='rail');
    const localX = mod(gx,4), localZ = mod(gz,4);
    const shoreDistance=riverAt(px+x,pz+z).distance;
    const shorefront = kind==='canal' && shoreDistance<112;
    const lot = { x:px,z:pz,yaw:(front??sides[0]).yaw,kind,corners,sides,shorefront,front,rail,buildings:[] };
    blocks.push(lot);
    if (!front) { lot.use='grove'; continue; }
    if (kind === 'downtown') {
      if (localX===2 && localZ===0 && access.some(side=>side.road.kind==='collector')
        && front.road.kind==='avenue') { lot.use='plaza'; continue; }
      lot.use = 'urban';
      const column = mod(gx,12);
      for (let corner=0;corner<4;corner++) {
        const adjacent = [sides[corner],sides[(corner+3)%4]].filter(isAccess).sort(rank);
        const side = adjacent[0];
        if (!side) continue;
        const type = [2,4,5,7,8,9,14][Math.floor(random()*7)];
        const canyon = column===0 || column===11;
        const h = (canyon?105:side.road.kind==='street'?62:84)+random()**1.23*(canyon?139:108);
        const sign = h>102 && side.road.kind!=='street' && random()<.29
          ? ['kairos','optics','metro','nova'][Math.floor(random()*4)] : undefined;
        const width=44+random()*10, depth=(side.spine?22:35)+random()*11;
        add(lot,side,corner===side.index?.255:.745,width,depth,h,
          type,[0,1,2,4][Math.floor(random()*4)],sign);
      }
    } else if (kind === 'industry') {
      if (rail) { lot.use=localZ<2?'yard':'tanks'; continue; }
      lot.use = 'works';
      add(lot,front,.50,74+random()*25,53+random()*10,18+random()*18,random()<.67?15:10,3,'freight');
    } else if (kind === 'outskirts') {
      if (shoreDistance<86 || (front.road.kind==='avenue' && access.length===1) || (localX===1 && localZ===1)) {
        lot.use='grove';
        continue;
      }
      lot.use = 'estate';
      const residential = access.find(side=>side.road.kind==='street')??front;
      for (let k=0;k<5;k++) {
        add(lot,residential,.16+k*.17,13+random()*4,15+random()*8,
          9+random()*9,16,[0,3,4,5][Math.floor(random()*4)]);
      }
    } else {
      if (shorefront && access.length>=2 && (localX+localZ)%2===0) { lot.use='plaza'; continue; }
      lot.use = 'market';
      for (const at of [.21,.50,.79]) {
        const h=14+random()**1.6*(shorefront?28:58);
        add(lot,front,at,24+random()*9,29+random()*9,h,h<26?16:14,random()<.67?5:4,at===.5?'market':undefined);
      }
      const back=access.find(side=>side.index===(front.index+2)%4);
      if (back) for (const at of [.27,.73]) {
        add(lot,back,at,32+random()*7,30+random()*8,16+random()*26,14,5);
      }
      // shortcut: fit the two inland Sable frontages by hand, generalize after surveying other canal lots.
      if (col===0 && row===3 && gx===-1 && (gz===11 || gz===12)) {
        if (gz===11) add(lot,front,.27,36,22,16,16,5);
        else {
          add(lot,front,.298,26,16,15,16,4);
          add(lot,front,.80,38,22,16,16,4);
        }
        joinMarketFrontage(lot,skywalks,clearsGuide);
      }
    }
  }
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
