import * as THREE from 'three';
import { randomFor } from './flight.js';
import { addScreens, campaignFor } from './ads.js';
import { batch, beam, box, line, neon, texture } from './scene-parts.js';
import { drawSurface, surfaceMap } from './surface-materials.js';
import { facadeClusters } from './streetscape.js';

const { Mesh, MeshStandardMaterial } = THREE;
const glassPalettes = [
  ['#343b3d', '#515650', ['#ffd99b', '#d9b88d', '#92a6a4'], 12, 7, .23],
  ['#182a32', '#35505a', ['#aceaee', '#6fa6b9', '#d0e2d7'], 8, 11, .37],
  ['#292125', '#654143', ['#ff9192', '#f4ba8c', '#e0b6a4'], 6, 9, .32],
  ['#2d2a25', '#4c4a3c', ['#f8b468', '#b89b60', '#ddd0a3'], 6, 6, .32],
  ['#292d32', '#6a6560', ['#ffd37d', '#e4ddd0', '#91afb3'], 14, 10, .26],
  ['#222e31', '#415048', ['#b7cb7a', '#b2dbaa', '#e3e9b1'], 5, 10, .36],
];
const facadeMaterials = [];
export const facadeColors = glassPalettes.map(([color]) => color);

function facadeMaterial(style) {
  if (facadeMaterials[style]) return facadeMaterials[style];
  const [base, frame, lights, cols, rows, activity] = glassPalettes[style];
  const concrete = style === 0 || style === 3 || style === 4;
  const sample = style===3 ? 2 : concrete ? 0 : 1;
  const makeMap = channel => {
    const emission=channel==='emission';
    const relief=channel==='height';
    const rough=channel==='roughness';
    const paint=ctx=>{
      const random=randomFor(900+style);
      const size=ctx.canvas.width;
      ctx.fillStyle=emission?'#000':relief?'#8a8a8a':rough?'#e1e1e1':base;
      ctx.fillRect(0,0,size,size);
      if (!emission && !rough) {
        ctx.save();
        ctx.globalAlpha=relief ? .49 : .89;
        if (relief) ctx.filter='grayscale(1) contrast(1.18) brightness(1.27)';
        drawSurface(ctx,sample);
        ctx.restore();
      }
      const w=size/cols, h=size/rows;
      for (let row=0;row<rows;row++) {
        const y=row*h;
        const slab=concrete?.29:row%4===2?.21:.115;
        if (!emission && !rough) {
          ctx.fillStyle=relief?'#acacac':frame+'42';
          ctx.fillRect(0,y,size,h*slab);
          ctx.fillStyle=relief?'#4a4a4a':'#0b121380';
          ctx.fillRect(0,y+h*slab-2.4,size,2.8);
          ctx.fillStyle=relief?'#bcbcbc':'#d8d7c33c';
          ctx.fillRect(0,y+1,size,1.8);
        }
        for (let col=0;col<cols;col++) {
          const x=col*w,active=random()<activity,glow=lights[Math.floor(random()*lights.length)];
          const blinds=random(),shade=random();
          const inset=style===0?.24:style===1?.064:.15;
          const open=w*(1-inset*2),left=x+w*inset;
          const top=y+h*slab+h*.056,tall=h*(.83-slab);
          if (!emission && !rough) {
            ctx.fillStyle=relief?'#bababa':'#a6ab9b6b';
            ctx.fillRect(left-3,top-2,open+6,tall+5);
            ctx.fillStyle=relief?'#646464':'#101415';
            ctx.fillRect(left-1,top-1,open+2,tall+2);
            if (!relief && concrete && shade<.6) {
              const runoff=ctx.createLinearGradient(0,top+tall,0,top+tall+h*.37);
              runoff.addColorStop(0,'#080c126d');
              runoff.addColorStop(1,'#080c1200');
              ctx.fillStyle=runoff;
              ctx.fillRect(left+shade*open,top+tall,1+shade*w*.17,h*.37);
            }
          }
          if (emission && !active) continue;
          if (relief || rough) ctx.fillStyle=relief?'#303030':shade>.7?'#5a5a5a':'#353535';
          else {
            const pane=ctx.createLinearGradient(0,top,0,top+tall);
            pane.addColorStop(0,emission?glow:active?'#7e877b':'#394751');
            pane.addColorStop(.52,emission?glow:active?'#58625b':'#19282d');
            pane.addColorStop(1,emission?'#292420':'#0b1319');
            ctx.fillStyle=pane;
          }
          ctx.fillRect(left,top,open,tall);
          ctx.fillStyle=relief?'#9a9a9a':rough?'#929292':emission?'#17100a9e':frame;
          ctx.fillRect(x+w*.51,top,Math.max(1.3,w*.045),tall);
          if (blinds<.44 && !rough) {
            for (let i=0;i<4;i++) ctx.fillRect(left,top+1+i*tall/7,open,1.08);
          }
          if (!emission && !relief && !rough && shade>.62) {
            ctx.fillStyle='#121c21a0';
            ctx.fillRect(left+open*.73,top,open*.24,tall);
          }
        }
      }
    };
    if (emission || rough) {
      const map=texture(512,512,paint);
      map.wrapS=map.wrapT=THREE.RepeatWrapping;
      if (rough) map.colorSpace=THREE.NoColorSpace;
      return map;
    }
    return surfaceMap(1024,paint,relief);
  };
  const material = new MeshStandardMaterial({
    map:makeMap('color'), emissiveMap:makeMap('emission'), bumpMap:makeMap('height'), roughnessMap:makeMap('roughness'),
    emissive:'#ffffff', emissiveIntensity:.87, bumpScale:concrete?.075:.044, roughness:1,
    metalness:concrete?.07:.32,
  });
  facadeMaterials[style] = material;
  return material;
}

function profile(x, z, w, d, bevel, sides = 0, phase = 0) {
  if (sides) return Array.from({length:sides}, (_,i) => {
    const angle = i / sides * Math.PI * 2 + phase;
    return [x + Math.sin(angle)*w/2, z + Math.cos(angle)*d/2];
  });
  const x0 = x-w/2, x1=x+w/2, z0=z-d/2, z1=z+d/2;
  if (!bevel) return [[x0,z1],[x1,z1],[x1,z0],[x0,z0]];
  const dx=w*bevel, dz=d*bevel;
  return [[x0+dx,z1],[x1-dx,z1],[x1,z1-dz],[x1,z0+dz],[x1-dx,z0],[x0+dx,z0],[x0,z0+dz],[x0,z1-dz]];
}

function turn(x,z,b) {
  if (!b.yaw) return [x,z];
  const dx=x-b.x, dz=z-b.z, sin=Math.sin(b.yaw), cos=Math.cos(b.yaw);
  return [b.x+dx*cos+dz*sin,b.z+dz*cos-dx*sin];
}
const up = new THREE.Vector3(0,1,0);
function turnParts(items, from, b) {
  if (!b.yaw) return;
  const orientation = new THREE.Quaternion().setFromAxisAngle(up,b.yaw);
  for (let i=from;i<items.length;i++) {
    const item=items[i];
    [item[0],item[2]]=turn(item[0],item[2],b);
    item[6]=typeof item[6]==='object' ? item[6].premultiply(orientation) : (item[6] ?? 0)+b.yaw;
  }
}
function signItem(x,y,z,w,h,yaw,b) {
  const [tx,tz]=turn(x,z,b);
  return [tx,y,tz,w,h,1,yaw+(b.yaw ?? 0)];
}

const roof = new MeshStandardMaterial({ color: '#3c4140', roughness: .77, metalness: .23, side: THREE.DoubleSide });
function addFacades(scene, slices) {
  const roofs = [];
  const detailFaces = [];
  glassPalettes.forEach((_, style) => {
    const vertices = [], uv = [];
    const [, , ,cols,rows]=glassPalettes[style];
    const concrete=style===0 || style===3 || style===4;
    for (const { x, z, w, d, base, h, topW, topD, topX, topZ, bevel, sides, phase, twist, windowOffset, building } of slices[style]) {
      const lower = profile(x,z,w,d,bevel,sides,phase).map(([x,z])=>turn(x,z,building));
      const upper = profile(topX,topZ,topW,topD,bevel,sides,phase+twist).map(([x,z])=>turn(x,z,building));
      const [roofX,roofZ] = turn(topX,topZ,building);
      const low = base, top = base + h;
      const v = h / (style === 4 ? 37 : 29), v0 = windowOffset * 3.3;
      for (let i = 0; i < lower.length; i++) {
        const j = (i + 1) % lower.length;
        const [ax, az] = lower[i], [bx, bz] = lower[j], [cx, cz] = upper[j], [dx, dz] = upper[i];
        const u = Math.hypot(bx - ax, bz - az) / (style === 1 ? 29 : 38);
        const u0 = windowOffset + i * .29;
        vertices.push(ax,low,az, bx,low,bz, dx,top,dz, bx,low,bz, cx,top,cz, dx,top,dz);
        uv.push(u0,v0, u0+u,v0, u0,v0+v, u0+u,v0, u0+u,v0+v, u0,v0+v);
        roofs.push(roofX,top,roofZ, dx,top,dz, cx,top,cz);
        if (low<169) detailFaces.push({
          ax,az,bx,bz,cx,cz,dx,dz,low,top,u0,v0,u,v,cols,rows,concrete,style,index:i,
          b:{ h:building.h,type:building.type,seed:(Math.imul(Math.round(building.x*23),0x45d9f3b)
            ^ Math.imul(Math.round(building.z*31),0x119de1f3)) >>> 0 },
        });
      }
    }
    if (!vertices.length) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.computeVertexNormals();
    scene.add(new Mesh(geometry, facadeMaterial(style)));
  });
  if (roofs.length) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(roofs, 3));
    geometry.computeVertexNormals();
    scene.add(new Mesh(geometry, roof));
  }
  return facadeClusters(detailFaces);
}

export const trim = new MeshStandardMaterial({ color: '#484847', roughness: .81, metalness: .26 });
export const structural = new MeshStandardMaterial({ color: '#313838', roughness: .91 });
const lightColors = ['#ffc479', '#62d8ed', '#ff785c', '#e4b154', '#fff1a4', '#add27e'];
const towerNeon = lightColors.map(color => neon(color, 2));
const beacon = neon('#ff5f37', 2.6);

const drum = new THREE.CylinderGeometry(.5,.5,1,18);
const dome = new THREE.SphereGeometry(.5,16,8);
const wedge = new THREE.BoxGeometry();
for (let i=0;i<wedge.attributes.position.count;i++) {
  const position=wedge.attributes.position;
  if (position.getY(i)>0) position.setY(i,position.getX(i));
}
wedge.computeVertexNormals();
const panels = new MeshStandardMaterial({ roughness: .68, metalness: .32 });
const glass = new MeshStandardMaterial({ color: '#2b4148', roughness: .29, metalness: .6, emissive: '#789ba0', emissiveIntensity: .16 });
const pipeMetal = new MeshStandardMaterial({ roughness: .64, metalness: .44 });

export function towers(scene, buildings, local = false) {
  const slices = glassPalettes.map(() => []);
  const caps = [], ribs = [], ledges = [], beacons = [], vents = [], glazing = [], rounds = [], domes = [], slopeRoofs = [];
  const screens = new Map(), plaques = new Map();
  const lights = lightColors.map(() => []);
  const parts = [caps,ribs,ledges,beacons,vents,glazing,rounds,domes,slopeRoofs,...lights];
  const random = randomFor(13082);
  buildings.forEach((b, index) => {
    const lit = lights[b.style];
    const limits=parts.map(items=>items.length);
    const levels = [];
    const segment = (from, to, w, d, options = {}) => {
      const { topW=w, topD=d, lean=0, shift=0, bevel=0, sides=0, phase=0, twist=0 }=options;
      const x = b.x + shift * b.w, z = b.z;
      const form = { x, z, w: w * b.w, d: d * b.d, base: from * b.h, h: (to - from) * b.h,
        topW: topW * b.w, topD: topD * b.d, topX: x + lean * b.w, topZ: z,
        bevel, sides, phase, twist, building: b, windowOffset: random() };
      slices[b.style].push(form);
      levels.push(form);
      return form;
    };
    const band = (y, w, d, x = b.x, on = true) => {
      ledges.push([x, y, b.z, w + 1.1, 1.7, d + 1.1]);
      if (!on) return;
      for (const side of [-1, 1]) {
        lit.push([x, y + .72, b.z + side * (d / 2 + .67), w, .32, .41]);
        lit.push([x + side * (w / 2 + .68), y + .72, b.z, .43, .32, d]);
      }
    };
    let top;
    switch (b.type) {
      case 1:
        segment(0,.28,1,1);
        top = segment(.28,1,.83,.85);
        band(b.h * .29, b.w * .94, b.d * .92);
        break;
      case 2:
        segment(0,.31,1,1);
        segment(.31,.70,.84,.91);
        top = segment(.70,1,.63,.74);
        caps.push([b.x, b.h * .695, b.z, b.w * .87, .9, b.d * .94]);
        break;
      case 3:
        segment(0,.24,1,1);
        top = segment(.24,1,.78,.82,{ shift: .07 });
        ribs.push([b.x - b.w * .39, b.h * .41, b.z, 2.1, b.h * .34, b.d * .61]);
        break;
      case 4:
        segment(0,.16,1,1,{ bevel: .25 });
        top = segment(.16,.92,.84,.91,{ bevel: .34, topW: .77, topD: .84 });
        segment(.92,1,.78,.85,{ bevel: .34, topW: .58, topD: .63 });
        for (const y of [.21,.38,.59,.78,.90]) {
          const ring = profile(b.x,b.z,b.w * (.86 - y * .075),b.d * (.94 - y * .082),.34);
          for (let side = 0; side < ring.length; side++) {
            const a = ring[side], c = ring[(side + 1) % ring.length];
            lit.push([(a[0] + c[0]) / 2, b.h * y, (a[1] + c[1]) / 2, .55,.48,
              Math.hypot(a[0] - c[0],a[1] - c[1]),Math.atan2(c[0] - a[0],c[1] - a[1])]);
          }
        }
        break;
      case 5: {
        const lean = index % 2 ? -.14 : .14;
        segment(0,.24,1,1,{ bevel: .08 });
        top = segment(.24,1,.96,.89,{ topW: .53, topD: .63, lean, bevel: .11 });
        for (const side of [-1,1]) for (const face of [-1,1]) {
          const x = b.x + side * b.w * .31, z = b.z + face * b.d * .406;
          ribs.push([x,b.h*.49,z,2,b.h*.49,1.25]);
          lit.push([x,b.h*.56,z + face * .7,.43,b.h*.36,.38]);
        }
        break;
      }
      case 6:
        segment(0,.17,1,1);
        segment(.17,.24,.70,.70);
        top = segment(.24,.92,.96,.91,{ bevel: .06 });
        segment(.92,1,.64,.53);
        for (const y of [.25,.54,.74,.915]) band(b.h * y,b.w * .96,b.d * .91,b.x,y !== .54);
        for (const side of [-1,1]) ribs.push([b.x+side*b.w*.405,b.h*.6,b.z,3.4,b.h*.63,b.d*.94]);
        break;
      case 7:
        segment(0,.25,1,1,{ bevel: .06 });
        segment(.25,.46,.91,.83,{ shift: -.025 });
        segment(.46,.68,.78,.70,{ shift: .05 });
        top = segment(.68,1,.62,.57,{ shift: .09, topW: .58, topD: .52 });
        for (const [y,width,depth,shift] of [[.25,.99,.99,0],[.46,.92,.84,-.025],[.68,.78,.71,.05]]) {
          band(b.h * y,b.w * width,b.d * depth,b.x+b.w*shift);
          for (const side of [-1,1]) caps.push([b.x+b.w*shift+side*b.w*width*.26,b.h*y+1.25,b.z+b.d*depth*.44,
            b.w*.22,2.25,b.d*.10]);
        }
        break;
      case 8: {
        segment(0,.12,1,1,{ bevel: .13 });
        segment(.12,.52,.78,.92,{ sides: 12, topW:.90, topD:.82, twist:.20 });
        segment(.52,.91,.90,.82,{ sides: 12, topW:.59, topD:.68, phase:.20, twist:.20 });
        top=segment(.91,1,.59,.68,{ sides:12, topW:.52, topD:.55, phase:.40 });
        for (const face of [-1,1]) {
          const z = b.z + face*b.d*.43;
          for (const side of [-1,1]) {
            beam(ribs,b.x+side*b.w*.43,b.h*.11,z,b.x+side*b.w*.21,b.h*.90,z,2.4,2.7);
            beam(vents,b.x+side*b.w*.36,b.h*.24,z,b.x-side*b.w*.31,b.h*.58,z,1.7,1.8,'#888c80');
            beam(vents,b.x+side*b.w*.37,b.h*.54,z,b.x-side*b.w*.29,b.h*.76,z,1.5,1.4,'#a08e6b');
          }
        }
        rounds.push([b.x,b.h*.93,b.z,b.w*.65,1.65,b.d*.70,0,'#56666a']);
        break;
      }
      case 9: {
        segment(0,.13,1,1,{ bevel:.13 });
        for (const side of [-1,1]) {
          segment(.13,.65,.43,.86,{ shift: side*.273,bevel:.12,topW:.37,topD:.74 });
          top=segment(.65,side === 1 ? 1 : .94,.37,.74,{ shift:side*.273,topW:.32,topD:.61,lean:-side*.035,bevel:.17 });
          for (const z of [b.z-b.d*.34,b.z+b.d*.34]) beam(ribs,b.x+side*b.w*.44,b.h*.23,z,
            b.x+side*b.w*.40,b.h*.92,z,2.2,2.1);
        }
        for (const level of [.38,.69]) {
          const y=b.h*level;
          caps.push([b.x,y-2.2,b.z,b.w*.65,1.7,b.d*.37]);
          glazing.push([b.x,y+.5,b.z,b.w*.65,4.5,b.d*.36]);
          for (const side of [-1,1]) lit.push([b.x,y+2.45,b.z+side*b.d*.197,b.w*.61,.47,.44]);
          for (const side of [-1,1]) beam(vents,b.x-b.w*.34,y-2.0,b.z+side*b.d*.19,
            b.x+b.w*.34,y+2.5,b.z+side*b.d*.19,1.10,1.10,'#827c64');
        }
        break;
      }
      case 10: {
        top=segment(0,.34,.97,.89,{ bevel:.13 });
        slopeRoofs.push([b.x,b.h*.385,b.z,b.w*.86,b.h*.12,b.d*.86,0,'#777464']);
        for (const i of [-1,0,1]) {
          const x=b.x+i*b.w*.23,z=b.z-b.d*.23,y=b.h*(1-.13*Math.abs(i));
          rounds.push([x,y*.58,z,b.w*.082,y*.83,b.w*.082,0,'#695c4c']);
          for (const band of [.55,.77,.945]) rounds.push([x,y*band,z,b.w*.092,y*.023,b.w*.092,0,band===.945?'#a87559':'#4f5351']);
          beacons.push([x,y,z,.97,.92,.97]);
          beam(ribs,x,b.h*.49,z,x,b.h*.38,b.z+b.d*.40,1.40,1.55);
          rounds.push([x,b.h*.23,b.z+b.d*.29,b.w*.137,b.h*.21,b.w*.137,0,'#7d7062']);
        }
        break;
      }
      case 11: {
        segment(0,.30,.91,.86,{bevel:.11});
        top=segment(.30,.58,.53,.57,{bevel:.13,shift:-.15});
        for (const side of [-1,1]) {
          const x=b.x+side*b.w*.43;
          ribs.push([x,b.h*.51,b.z,3.35,b.h*.91,5.7]);
          beam(vents,x,b.h*.28,b.z+b.d*.30,x,b.h*.90,b.z-b.d*.028,2,2,'#b4813e');
          lit.push([x,b.h*.67,b.z+b.d*.052,1.05,b.h*.28,.34]);
        }
        vents.push([b.x,b.h*.91,b.z,b.w*.97,3.9,5.9,0,'#a88442']);
        ventStrike(vents,b.x,b.h*.92,b.z+3.02,b.w*.94);
        beam(ribs,b.x+b.w*.27,b.h*.90,b.z,b.x+b.w*.27,b.h*.57,b.z,.56,.56);
        vents.push([b.x+b.w*.27,b.h*.55,b.z,8.5,3.4,10,0,'#66634d']);
        beacons.push([b.x-b.w*.43,b.h*.99,b.z,1.4,1.4,1.4]);
        break;
      }
      case 12: {
        top=segment(0,.17,.63,.60,{bevel:.22});
        const w=b.w*.76,d=b.d*.76;
        for (const i of [-1,1]) for (const j of [-1,1]) {
          const x=b.x+i*w*.37,z=b.z+j*d*.35;
          beam(vents,x,1,z,b.x+i*w*.22,b.h*.74,b.z+j*d*.21,2.6,2.6,'#575c50');
          beam(ribs,x,b.h*.28,z,b.x-i*w*.22,b.h*.70,b.z+j*d*.21,1.15,1.25);
          beam(ribs,x,b.h*.28,z,b.x+i*w*.22,b.h*.70,b.z-j*d*.21,1.15,1.25);
        }
        rounds.push([b.x,b.h*.79,b.z,w,b.h*.19,d,0,'#d4d1b5']);
        domes.push([b.x,b.h*.89,b.z,w,b.h*.19,d,0,'#aeb6ad']);
        domes.push([b.x,b.h*.71,b.z,w,b.h*.14,d,0,'#969f98']);
        rounds.push([b.x,b.h*.71,b.z,w*1.03,1.34,d*1.03,0,'#786c54']);
        beacons.push([b.x,b.h*.985,b.z,1.15,.67,1.15]);
        break;
      }
      case 13:
        top=segment(0,.93,.98,.98,{bevel:.10});
        slopeRoofs.push([b.x,b.h*.955,b.z,b.w*.98,b.h*.10,b.d*.95,0,'#6f6c63']);
        for (const side of [-1,1]) line(ledges,b.x-b.w*.47,5.85,b.z+side*b.d*.51,b.x+b.w*.47,b.z+side*b.d*.51,2.9,.81);
        break;
      case 14:
        segment(0,.16,1,1,{bevel:.06});
        top=segment(.16,1,.89,.81,{bevel:.06});
        for (let y=Math.max(9,b.h*.18);y<b.h-4.0;y+=5.25) {
          for (const side of [-1,1]) {
            const z=b.z+side*b.d*.416;
            for (const k of [-1,0,1]) {
              if ((Math.floor(y/5)+k+index)%5===0) continue;
              const x=b.x+k*b.w*.247;
              caps.push([x,y,z,b.w*.241,.49,3.15]);
              ledges.push([x,y+.83,z+side*1.56,b.w*.227,.85,.20]);
              if (random()<.30) vents.push([x+b.w*.06,y+1.04,z-side*.38,1.55,.88,.8,0,'#686967']);
            }
          }
        }
        ribs.push([b.x+b.w*.415,b.h*.55,b.z-b.d*.32,1.3,b.h*.9,2.0]);
        break;
      case 15:
        top=segment(0,.79,1,1,{bevel:.05});
        for (let i=-1;i<=1;i++) {
          const x=b.x+i*b.w/3;
          slopeRoofs.push([x,b.h*.895,b.z,b.w*.337,b.h*.21,b.d,0,i===0?'#596064':'#696654']);
          glazing.push([x+b.w*.166,b.h*.884,b.z,.35,b.h*.15,b.d*.81]);
        }
        break;
      case 16:
        top=segment(0,.74,1,1,{bevel:.025});
        for (const side of [-1,1]) slopeRoofs.push([b.x+side*b.w*.25,b.h*.865,b.z,b.w*.53,b.h*.25,b.d*1.08,side>0?Math.PI:0,'#635d53']);
        vents.push([b.x+b.w*.12,b.h*.86,b.z+b.d*.20,1.15,3.4,1.60,0,'#656354']);
        break;
      default:
        top = segment(0,1,1,1,{ bevel: b.h > 72 && index % 4 === 0 ? .07 : 0 });
    }
    const zFront = top.z + top.d / 2 + .55;
    const litVertical = b.sign || (b.h > 62 && index % 4 === 1);
    if (litVertical && b.type < 4) {
      for (const side of [-1, 1]) {
        const x = top.x + side * top.w * .48;
        lit.push([x, top.base + top.h * .58, zFront, .56, top.h * .77, .46]);
        ribs.push([x, top.base + top.h / 2, zFront - 1.2, 2.1, top.h, 2.6]);
      }
    }
    if (b.h > 70 && (b.type === 0 || b.type === 3)) {
      for (let y = .17; y < .85; y += .16) {
        if (b.h*y > top.base + 4) band(b.h*y,top.w,top.d,top.x,index % 4 === 0);
      }
    }
    const machineryRoof = b.type < 10 || b.type===14;
    if (machineryRoof) {
      if (b.h>116 || index%7===1) {
        const mast=b.landmark?13+random()*10:3+random()*10;
        const x=top.topX+top.topW*.13;
        caps.push([x,b.h+mast/2,b.z,.64,mast,.64]);
        beacons.push([x,b.h+mast,b.z,1.0,.69,1.0]);
      }
      const tx=top.topX,tz=top.topZ;
      vents.push([tx-top.topW*.11,b.h+1.20,tz,top.topW*.27,2.4,top.topD*.29,0,'#747d76']);
      rounds.push([tx+top.topW*.18,b.h+1.10,tz-top.topD*.13,2.45,2.2,2.45,0,'#6e7975']);
      for (let k=-1;k<=1;k++) {
        vents.push([tx-top.topW*.11,b.h+2.46,tz+k*top.topD*.063,top.topW*.248,.23,.54,0,'#343935']);
      }
      if (b.h>70 && (b.type===2 || b.type===3 || b.type===5 || b.type===8)) {
        for (const face of [-1,1]) for (const ratio of [.25,.46,.67]) {
          const y=top.base+top.h*ratio,z=top.z+face*top.d*.48;
          caps.push([top.x,y,z,top.w*.76,.66,2.15]);
          for (let i=-1;i<=1;i++) ledges.push([top.x+i*top.w*.19,y+.22,z+face*1.05,.8,.46,.31]);
        }
      }
    }
    const bottom=levels[0];
    if (b.type!==12 && b.type!==11) {
      const z=b.z+bottom.d*.5+.49;
      const bay=Math.min(7,Math.max(3.3,b.h*.29));
      const count=b.h>45?5:b.w>21?3:2;
      for (let i=0;i<count;i++) {
        const x=b.x+((i+.5)/count-.5)*bottom.w*.84;
        glazing.push([x,bay*.5,z,bottom.w*.71/count,bay*.79,.79]);
        ribs.push([x+bottom.w*.37/count,bay*.54,z+.28,.48,bay*1.10,.88]);
      }
      if (b.type!==16) {
        caps.push([b.x,bay+.10,z+.72,bottom.w*.80,.74,2.6]);
        lit.push([b.x,bay-.196,z+1.98,bottom.w*.67,.21,.25]);
      }
    }

    const campaign=campaignFor(b);
    if (campaign) {
      const portrait=b.type===9 || b.type===14 || b.sign==='LANTERN' || b.sign==='NOCTURNE';
      const id=campaign+(portrait?'/vertical':'/wide');
      if (!screens.has(id)) screens.set(id,[]);
      const tall=b.h>62 && ![10,11,12].includes(b.type);
      const level=tall ? b.h * (local ? .32 : .55):Math.min(31,b.h*.34);
      const w=portrait?Math.min(25,b.w*.45):Math.min(55,b.w*.67);
      const height=portrait?Math.min(w*1.54,b.h*.45):Math.min(w*.55,b.h*.35);
      const form=levels.find(form=>form.base<=level && form.base+form.h>=level)??bottom;
      const faceX=form.x+(b.type===9?form.w*.08:0);
      const depth=Math.max(form.d,form.topD)*.5+1.55;
      const signFaces=local?[-1,1]:[1];
      for (const face of signFaces) {
        const z=b.z+face*depth;
        screens.get(id).push(signItem(faceX,level,z,w,height,face===1?0:Math.PI,b));
        caps.push([faceX,level,z-face*.47,w+.75,height+.75,.58]);
        ribs.push([faceX,level-height*.51,z-face*.25,w+.31,.48,1.35]);
      }
      if (local && tall && b.landmark) {
        const floor=Math.max(16,level-1), face=b.towardGuide;
        const x=b.x+face*(b.w*.5+1.3);
        screens.get(id).push(signItem(x,floor,b.z,w*.83,height,face*Math.PI/2,b));
        caps.push([x-face*.36,floor,b.z,.7,height+.68,w*.84]);
      }
    }
    if (b.landmark) {
      if (!plaques.has(b.sign)) plaques.set(b.sign,[]);
      const h=b.type===12?b.h*.795: Math.min(b.h*.39,43), w=Math.min(50,b.w*.70);
      for (const face of [-1,1]) {
        const z=b.z+face*(b.type===12?b.d*.395:b.d*.44);
        plaques.get(b.sign).push(signItem(b.x,h,z,w,w*.22,face<0?Math.PI:0,b));
      }
    }
    parts.forEach((items,i)=>turnParts(items,limits[i],b));
  });
  batch(scene,box,trim,caps);
  batch(scene,box,structural,ribs.concat(ledges));
  batch(scene,box,panels,vents);
  batch(scene,box,glass,glazing);
  batch(scene,drum,pipeMetal,rounds);
  batch(scene,dome,pipeMetal,domes);
  batch(scene,wedge,panels,slopeRoofs);
  lights.forEach((items,style)=>batch(scene,box,towerNeon[style],items));
  batch(scene,box,beacon,beacons);
  addScreens(scene,screens,plaques);
  return addFacades(scene,slices);
}

function ventStrike(vents,x,y,z,w) {
  for (let i=-3;i<=3;i++) vents.push([x+i*w/8,y,z,w*.062,2.4,.34,0,'#514837']);
}
