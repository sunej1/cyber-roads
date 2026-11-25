import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { box, texture } from './scene-parts.js';
import { randomFor } from './flight.js';
import { weatheredConcrete } from './surface-materials.js';
import { selectDetailClusters } from './detail-selection.js';

const up = new THREE.Vector3(0,1,0);
const plane = new THREE.PlaneGeometry();
const bevel = new RoundedBoxGeometry(1,1,1,1,.08);
const lantern = new THREE.SphereGeometry(.5,9,6);

const stores = [
  { name:'KASA', caption:'NOODLE COUNTER', sub:'HOT BROTH / ₡8', tone:'#ff635f', trim:'#89584a' },
  { name:'VANTA', caption:'OPTICS & FITTINGS', sub:'WALK-INS UNTIL 04:00', tone:'#fabe62', trim:'#726248' },
  { name:'VERDANT', caption:'FILTER REPLACEMENT', sub:'TRADE EMPTY CARTRIDGES', tone:'#bbec78', trim:'#5d6b4a' },
  { name:'KAIROS', caption:'UNIT SERVICE', sub:'REPAIRS WHILE YOU WAIT', tone:'#70d4e9', trim:'#455f71' },
  { name:'LOCKSIDE', caption:'NIGHT PROVISIONS', sub:'COLD GOODS / 24 H', tone:'#ffc38e', trim:'#7c5d48' },
  { name:'BAY 14', caption:'FLIGHT PARTS', sub:'REBUILT MOTORS / CASH ONLY', tone:'#ef8c69', trim:'#755247' },
  { name:'MUNI-04', caption:'WALK-IN CLINIC', sub:'IMPLANT CHECKS / ALL HOURS', tone:'#9be1cf', trim:'#456565' },
];

function signMaterial(store) {
  const map=texture(512,174,ctx=>{
    ctx.fillStyle='#141c20';
    ctx.fillRect(0,0,512,174);
    ctx.fillStyle=store.tone;
    ctx.fillRect(13,13,4,89);
    ctx.fillRect(23,102,466,2);
    ctx.font='900 72px Impact, "Arial Black", sans-serif';
    ctx.fillText(store.name,32,82,455);
    ctx.fillStyle='#dddac8';
    ctx.font='bold 25px monospace';
    ctx.fillText(store.caption,25,130,467);
    ctx.fillStyle=store.tone;
    ctx.font='600 18px monospace';
    ctx.fillText(store.sub,25,156,465);
    for (let i=0;i<4;i++) ctx.fillRect(452+i*8,19,4,20);
  });
  return new THREE.MeshBasicMaterial({ map, color: new THREE.Color().setScalar(1.24) });
}

const shutterMap=texture(128,128,ctx=>{
  for (let y=0;y<128;y+=16) {
    ctx.fillStyle='#4e5152';
    ctx.fillRect(0,y,128,16);
    ctx.fillStyle='#9b9a89';
    ctx.fillRect(0,y+1,128,2);
    ctx.fillStyle='#262624';
    ctx.fillRect(0,y+12,128,3);
  }
});
const glass = new THREE.MeshPhysicalMaterial({
  color:'#22383f', roughness:.22, metalness:.31, transparent:true, opacity:.24, depthWrite:false,
  clearcoat:.6, clearcoatRoughness:.13,
});

const pools = [
  { name:'frame', geometry:box, material:new THREE.MeshStandardMaterial({ color:'#9b9a91', metalness:.43, roughness:.64 }), capacity:6200 },
  { name:'wall', geometry:box, material:weatheredConcrete, capacity:2400 },
  { name:'hardware', geometry:bevel, material:new THREE.MeshStandardMaterial({ color:'#9c9c91', metalness:.28, roughness:.69 }), capacity:900 },
  { name:'dark', geometry:box, material:new THREE.MeshStandardMaterial({ color:'#383c40', roughness:.82 }), capacity:1600 },
  { name:'interior', geometry:box, material:new THREE.MeshBasicMaterial({ color:new THREE.Color().setScalar(.85) }), capacity:850 },
  { name:'lantern', geometry:lantern, material:new THREE.MeshBasicMaterial({ color:new THREE.Color().setScalar(1.52) }), capacity:185 },
  { name:'tube', geometry:box, material:new THREE.MeshBasicMaterial({ color:new THREE.Color().setScalar(1.95) }), capacity:1700 },
  { name:'glass', geometry:plane, material:glass, capacity:350 },
  { name:'shutter', geometry:plane, material:new THREE.MeshStandardMaterial({ map:shutterMap, roughness:.71, metalness:.53 }), capacity:290 },
  ...stores.map((shop,i)=>({ name:`shop${i}`, geometry:plane, material:signMaterial(shop), capacity:185 })),
];

export function facadeClusters(faces) {
  const clusters = [];
  for (const face of faces) {
    const { ax,az,bx,bz, cx,cz,dx,dz, low,top, style, b } = face;
    const span=Math.hypot(bx-ax,bz-az);
    if (span < 4.5) continue;
    const sx=(bx-ax)/span,sz=(bz-az)/span;
    const nx=-sz,nz=sx,yaw=Math.atan2(nx,nz);
    const add = (kind, left, width, floor, height, extra={}) => {
      const center=(left+width*.5)/span;
      const x=ax+(bx-ax)*center,z=az+(bz-az)*center;
      const y=floor+height*.5;
      const rise=THREE.MathUtils.clamp((y-low)/(top-low),0,1);
      clusters.push({
        kind,left,width,floor,height,span,nx,nz,yaw,style,face,
        x:THREE.MathUtils.lerp(x,dx+(cx-dx)*center,rise),
        z:THREE.MathUtils.lerp(z,dz+(cz-dz)*center,rise), y,
        radius:Math.hypot(width*.5,height*.5,5), ...extra,
      });
    };
    const storefront = face.storefront ?? (face.index%2===0 || b.h>83 && span>15);
    if (low < .2 && span>9.5 && b.h>=9 && ![10,11,12,15].includes(b.type)
      && top>5 && storefront) {
      const count=span>43 ? 3 : span>24 ? 2 : 1;
      const slot=span/count;
      for (let i=0;i<count;i++) {
        const seed=(b.seed ^ Math.imul(face.index+1,0x1943481) ^ Math.imul(i+1,0x5645391)) >>> 0;
        const width=Math.min(14.2,slot*.81);
        add('store',(i+.5)*slot-width*.5,width,.02,5.8,{ seed,error:.92,fineRatio:.48,shop:seed%stores.length });
      }
    }
    if (top-low<6 || low>167 || b.type===11 || b.type===12) continue;
    const first=Math.max(6.5,low+.45);
    for (let floor=first;floor+3.5<top && floor<169;floor+=15) {
      const height=Math.min(15,top-floor);
      const strips=span>43 ? 2 : 1;
      for (let strip=0;strip<strips;strip++) {
        const width=span/strips;
        add('facade',strip*width,width,floor,height,{ seed:b.seed ^ (Math.round(floor)*97+strip*61),
          error:.64,fineRatio:.44 });
      }
    }
  }
  return clusters;
}

function partsFor(cluster, tier) {
  const { face,nx,nz,width,height,span,left,floor,yaw,style }=cluster;
  const { ax,az,bx,bz,cx,cz,dx,dz,low,top,u0,v0,u,v,cols,rows,concrete }=face;
  const random=randomFor(cluster.seed);
  const parts=[];
  const part=(group, across, y, depth, w, h, d, color, angle=0)=>{
    const f=(left+width*.5+across)/span;
    const rise=THREE.MathUtils.clamp((y-low)/(top-low),0,1);
    const x=THREE.MathUtils.lerp(ax+(bx-ax)*f,dx+(cx-dx)*f,rise)+nx*depth+cluster.offsetX;
    const z=THREE.MathUtils.lerp(az+(bz-az)*f,dz+(cz-dz)*f,rise)+nz*depth+cluster.offsetZ;
    parts.push({ group,x,y,z,w,h,d,yaw:yaw+angle,color });
  };

  if (cluster.kind==='store') {
    const shop=stores[cluster.shop];
    const shutter=cluster.seed%9===2 || (cluster.shop===5 && cluster.seed%3===1);
    const wall='#928a7e',steel='#a0a2a0';
    part('dark',0,2.54,.58,width,4.95,.32,'#44413c');
    part('wall',0,.15,1.34,width+.61,.26,2.51,wall);
    part('hardware',0,4.66,1.54,width+.43,.38,2.12,shop.trim);
    part('frame',0,4.45,.34,width+.16,.26,.85,steel);
    part(`shop${cluster.shop}`,0,5.29,1.158,width*.98,1.16,1);
    part('frame',0,5.29,.96,width+ .10,1.30,.30,shop.trim);
    part('tube',0,4.47,2.10,width*.83,.075,.17,shop.tone);
    part('wall',0,.42,1.56,width*.93,.52,.61,wall);
    for (const side of [-1,1]) {
      part('wall',side*width*.475,2.38,1.50,.48,4.36,2.35,wall);
      part('frame',side*width*.417,2.54,2.37,.12,4.03,.13,steel);
      part('tube',side*width*.437,3.30,2.47,.075,1.14,.09,shop.tone);
    }
    if (shutter) {
      part('shutter',0,2.51,2.29,width*.81,3.73,1);
      part('frame',0,2.26,2.36,.17,3.25,.18,steel);
      part('tube',width*.32,2.79,2.39,.12,.17,.10,'#e48856');
    } else {
      part('interior',0,2.62,.79,width*.80,3.84,.12,cluster.shop===3?'#3d5a63':'#665c4c');
      part('interior',-width*.24,2.67,1.02,width*.14,3.60,.31,shop.trim);
      part('glass',0,2.54,2.31,width*.81,3.76,1);
      part('dark',-width*.19,1.09,1.27,width*.43,.98,.64,shop.trim);
      part('wall',-width*.19,1.64,1.27,width*.47,.13,.72,steel);
      part('tube',-width*.19,3.61,1.06,width*.39,.12,.26,shop.tone);
      part('tube',width*.23,3.58,1.12,width*.12,.21,.16,'#e0d5b3');
      part('frame',0,2.38,2.34,.12,3.85,.12,steel);
      if (cluster.shop===0) {
        for (const across of [-.31,.04,.30]) part('lantern',width*across,3.74,2.03,.49,.62,.50,'#ff6655');
      } else if (cluster.shop===1 || cluster.shop===3 || cluster.shop===6) {
        part('interior',width*.31,2.66,1.34,width*.15,2.98,.09,'#698a86');
        part('frame',width*.31,2.66,1.39,width*.16,.086,.13,steel);
      }
    }
    if (tier===2) {
      part('frame',0,3.75,2.37,width*.83,.09,.12,steel);
      part('hardware',-width*.42,5.15,.40,.43,1.26,.56,'#575c50');
      part('frame',width*.13,1.88,2.42,.31,.072,.15,'#a9967a');
      for (const side of [-1,1]) {
        part('frame',side*width*.39,2.44,2.35,.07,3.91,.10,'#668386');
        part('hardware',side*width*.34,.48,1.00,.39,.72,.48,shop.trim);
      }
      if (!shutter) for (let i=0;i<8;i++) {
        const x=-width*.40+i*width*.047;
        const h=.18+random()*.29;
        part('hardware',x,1.75+h*.5,1.32,.14+random()*.08,h,.15,i%2?shop.trim:'#a8967c');
      }
      if (cluster.seed%3===0) {
        part('hardware',width*.46,.61,2.80,.52,1.2,.61,'#55585c');
        part('tube',width*.46,.98,3.11,.18,.17,.09,shop.tone);
      }
    }
    return parts;
  }

  const vMin=v0+(floor-low)/(top-low)*v,vMax=v0+(floor+height-low)/(top-low)*v;
  const uMin=u0+left/span*u,uMax=u0+(left+width)/span*u;
  const sill=style===0?.24:style===1?.064:.15;
  const cellWidth=span/(u*cols);
  const cellHeight=(top-low)/(v*rows);
  for (let row=Math.floor(vMin*rows);row<=Math.ceil(vMax*rows);row++) {
    const glyph=(row+.41)/rows;
    const y=low+(glyph-v0)/v*(top-low);
    if (y<floor+.24 || y>floor+height-.24) continue;
    if (concrete || row%2===0) part('frame',0,y-cellHeight*.34,.19,width*.97,.15,.32,'#7e817b');
    if (tier<2) continue;
    for (let col=Math.floor(uMin*cols);col<=Math.ceil(uMax*cols);col++) {
      const f=((col+.5)/cols-u0)/u;
      const across=span*f-left-width*.5;
      if (Math.abs(across)>width*.5-cellWidth*.31) continue;
      const open=cellWidth*(1-2*sill);
      part('frame',across,y-cellHeight*.22,.23,open+.14,.13,.38,'#aaa498');
      part('frame',across-open*.5,y,.17,.094,cellHeight*.47,.24,'#747a75');
      if (random()<.13) {
        part('hardware',across+open*.36,y-cellHeight*.10,.50,.62,.40,.56,'#6f7675');
        for (const at of [-.10,0,.10]) part('dark',across+open*.36,y-cellHeight*.10+at,.795,.44,.031,.055);
      }
    }
  }
  return parts;
}

export function streetDetails(scene) {
  const meshes=new Map();
  const transform=new THREE.Object3D();
  const frustum=new THREE.Frustum();
  const projection=new THREE.Matrix4();
  const sphere=new THREE.Sphere();
  const color=new THREE.Color();
  for (const {name,geometry,material,capacity} of pools) {
    const mesh=new THREE.InstancedMesh(geometry,material,capacity);
    mesh.count=0;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled=false;
    mesh.visible=false;
    if (name==='glass') mesh.renderOrder=3;
    scene.add(mesh);
    meshes.set(name,{mesh,capacity});
  }
  let previous=new Map();
  let packed=new Map();
  let cache=new Map();
  let nextUpdate=0;
  const lastOrigin=new THREE.Vector3(Infinity,0,Infinity);
  let sources=[];
  const limit={total:126,fine:44};
  return {
    fixtures:()=>sources,
    update(now,camera,origin,height,hierarchies) {
      const shifted=!origin.equals(lastOrigin);
      if (!shifted && now<nextUpdate) return;
      nextUpdate=now+85;
      frustum.setFromProjectionMatrix(projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
      const selected=selectDetailClusters(hierarchies,{
        x:camera.position.x+origin.x,y:camera.position.y,z:camera.position.z+origin.z,
        focalPixels:height*camera.projectionMatrix.elements[5]*.5,
        contains:node=>{
          sphere.center.set(node.x-origin.x,node.y,node.z-origin.z);
          sphere.radius=node.radius+5;
          return frustum.intersectsSphere(sphere);
        },
      },previous,limit);
      let build=shifted?30:16;
      previous=selected;
      const resident=new Map();
      for (const [cluster,tier] of selected) {
        let entry=cache.get(cluster);
        if ((!entry || entry.tier<tier) && build>0) {
          entry={tier,parts:[partsFor(cluster,1),tier===2?partsFor(cluster,2):null]};
          cache.set(cluster,entry);
          build--;
        }
        if (entry) resident.set(cluster,Math.min(tier,entry.tier));
      }
      if (!shifted && resident.size===packed.size && [...resident].every(([c,tier])=>packed.get(c)===tier)) return;
      packed=resident;
      lastOrigin.copy(origin);
      cache=new Map([...resident.keys()].map(cluster=>[cluster,cache.get(cluster)]));
      const counts=new Map();
      sources=[];
      for (const [cluster,tier] of resident) {
        if (cluster.kind==='store') sources.push({
          x:cluster.x+cluster.nx*2.75,y:4.14,z:cluster.z+cluster.nz*2.75,
          color:stores[cluster.shop].tone,power:111,range:21,
        });
        for (const item of cache.get(cluster).parts[tier-1]) {
          const {mesh,capacity}=meshes.get(item.group);
          const index=counts.get(item.group)??0;
          if (index>=capacity) continue;
          transform.position.set(item.x-origin.x,item.y,item.z-origin.z);
          transform.scale.set(item.w,item.h,item.d);
          transform.quaternion.setFromAxisAngle(up,item.yaw);
          transform.updateMatrix();
          mesh.setMatrixAt(index,transform.matrix);
          if (!item.group.startsWith('shop') && item.group!=='glass' && item.group!=='shutter') {
            mesh.setColorAt(index,color.set(item.color??'#ffffff'));
          }
          counts.set(item.group,index+1);
        }
      }
      for (const [name,{mesh}] of meshes) {
        mesh.count=counts.get(name)??0;
        mesh.visible=mesh.count>0;
        mesh.instanceMatrix.needsUpdate=true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate=true;
      }
    },
  };
}
