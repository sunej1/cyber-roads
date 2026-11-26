import * as THREE from 'three';
import { randomFor } from './flight.js';
import { addScreens, campaignFor } from './ads.js';
import { batch, beam, box, line, neon } from './scene-parts.js';
import { facadeMaterial, finishes } from './facade-finishes.js';
import { facadeClusters } from './streetscape.js';
import { towerMasses } from './megabuildings.js';
import { drawSurface, surfaceMap } from './surface-materials.js';
import { addPlants } from './vegetation.js';

const { Mesh, MeshStandardMaterial } = THREE;
export const facadeColors = finishes.map(({ base }) => base);

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
const panelMap = surfaceMap(512,ctx => {
  ctx.fillStyle='#e0dbd1';
  ctx.fillRect(0,0,512,512);
  ctx.save();
  ctx.globalAlpha=.36;
  drawSurface(ctx,0);
  ctx.restore();
  const random=randomFor(7785);
  for (let y=0; y<512; y+=128) {
    for (let col=-1; col<4; col++) {
      const x=col*161+(y%256 ? 77 : 0);
      const shade=Math.floor(165+random()*76);
      ctx.fillStyle=`rgb(${shade} ${shade} ${shade} / .24)`;
      ctx.fillRect(x,y,160,126);
      ctx.fillStyle='#383b36a1';
      ctx.fillRect(x,y,1.8,128);
      ctx.fillRect(x,y,161,2.4);
      const runoff=ctx.createLinearGradient(0,y,0,y+112);
      runoff.addColorStop(0,'#322c2459');
      runoff.addColorStop(1,'#322c2400');
      ctx.fillStyle=runoff;
      ctx.fillRect(x+random()*18,y,2+random()*8,112);
      ctx.fillStyle='#423f3a88';
      ctx.fillRect(x+8,y+9,3,3);
      ctx.fillRect(x+152,y+9,3,3);
    }
  }
});
const hull = new MeshStandardMaterial({ map:panelMap, vertexColors:true, roughness:.72, metalness:.19 });
const enamel = new MeshStandardMaterial({ vertexColors:true, roughness:.35, metalness:.29 });

function addMesh(scene, material, positions, uv, colors) {
  if (!positions.length) return;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions,3));
  if (uv) geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  if (colors) geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.computeVertexNormals();
  scene.add(new Mesh(geometry,material));
}

function massForm(building,from,to,w,d,options={},windowOffset=0) {
  const { topW=w,topD=d,lean=0,shift=0,slide=0,bevel=0,sides=0,phase=0,twist=0,skin,cover=false } = options;
  const x=building.x+shift*building.w,z=building.z+slide*building.d;
  return {x,z,w:w*building.w,d:d*building.d,base:from*building.h,h:(to-from)*building.h,
    topW:topW*building.w,topD:topD*building.d,topX:x+lean*building.w,topZ:z,
    bevel,sides,phase,twist,skin,cover,building,windowOffset};
}

function addFacades(scene, slices, cladding, coated = []) {
  const roofs = [], detailFaces = [];
  function surfaces(forms, material, style, solid=false) {
    const vertices=[], uv=[], colors=[];
    const {grid:[cols,rows],repeat:[width,rise]}=finishes[style];
    const color=new THREE.Color();
    for (const {x,z,w,d,base,h,topW,topD,topX,topZ,bevel,sides,phase,twist,skin,cover,windowOffset,building} of forms) {
      const lower = profile(x,z,w,d,bevel,sides,phase).map(([x,z])=>turn(x,z,building));
      const upper = profile(topX,topZ,topW,topD,bevel,sides,phase+twist).map(([x,z])=>turn(x,z,building));
      const [roofX,roofZ] = turn(topX,topZ,building);
      const [footX,footZ] = turn(x,z,building);
      const [roofA,roofB]=upper[0], [footA,footB]=lower[0];
      const low=base, top=base+h;
      const v=h/(solid ? 21 : rise), v0=windowOffset*3.3 + base/rise;
      if (solid) color.set(skin);
      for (let i=0; i<lower.length; i++) {
        const j=(i+1)%lower.length;
        const [ax,az]=lower[i],[bx,bz]=lower[j],[cx,cz]=upper[j],[dx,dz]=upper[i];
        const cap=i>0 && j!==0;
        const span=Math.hypot(bx-ax,bz-az);
        const u=span/(solid ? 22 : width),u0=windowOffset+i*.29;
        vertices.push(ax,low,az, bx,low,bz, dx,top,dz, bx,low,bz, cx,top,cz, dx,top,dz);
        uv.push(u0,v0, u0+u,v0, u0,v0+v, u0+u,v0, u0+u,v0+v, u0,v0+v);
        if (solid) {
          let count=6;
          if (cap) {
            vertices.push(roofA,top,roofB, dx,top,dz, cx,top,cz);
            uv.push((roofA-roofX)/16+.5,(roofB-roofZ)/16+.5,(dx-roofX)/16+.5,(dz-roofZ)/16+.5,(cx-roofX)/16+.5,(cz-roofZ)/16+.5);
            count+=3;
            if (base > 0) {
              vertices.push(footA,low,footB, bx,low,bz, ax,low,az);
              uv.push((footA-footX)/16+.5,(footB-footZ)/16+.5,(bx-footX)/16+.5,(bz-footZ)/16+.5,(ax-footX)/16+.5,(az-footZ)/16+.5);
              count+=3;
            }
          }
          for (let n=0; n<count; n++) colors.push(color.r,color.g,color.b);
          continue;
        }
        if (cap) {
          roofs.push(roofA,top,roofB, dx,top,dz, cx,top,cz);
          if (cover && base > 0) roofs.push(footA,low,footB, bx,low,bz, ax,low,az);
        }
        if (low<169 && span>=4.5) {
          const facing=(az-bz)*Math.sin(building.yaw??0)+(bx-ax)*Math.cos(building.yaw??0);
          detailFaces.push({
            ax,az,bx,bz,cx,cz,dx,dz,low,top,u0,v0,u,v,cols,rows,style,index:i,
            storefront:building.frontage ? building.retail && facing>span*.67 : undefined,
            b:{h:building.h,type:building.type,seed:(Math.imul(Math.round(building.x*23),0x45d9f3b)
              ^ Math.imul(Math.round(building.z*31),0x119de1f3)) >>> 0},
          });
        }
      }
    }
    addMesh(scene,material,vertices,uv,solid ? colors : null);
  }
  slices?.forEach((forms,style)=>{
    if (forms.length) surfaces(forms,facadeMaterial(style),style);
  });
  if (cladding.length) surfaces(cladding,slices ? hull : enamel,0,true);
  if (coated.length) surfaces(coated,enamel,0,true);
  addMesh(scene,roof,roofs);
  if (slices) return facadeClusters(detailFaces);
}

export function distantMegabuildings(scene, buildings) {
  const cladding=[], conventional=[];
  for (const b of buildings) {
    const masses=towerMasses(b);
    if (!masses) { conventional.push(b); continue; }
    for (const {from,to,w,d,...shape} of masses) {
      if (to-from < .034) continue;
      const bevel=shape.bevel>=.12 ? shape.bevel : 0;
      const sides=shape.sides ? Math.min(shape.sides,8) : 0;
      cladding.push(massForm(b,from,to,w,d,{...shape,bevel,sides,skin:shape.skin??facadeColors[b.style]}));
    }
  }
  addFacades(scene,null,cladding);
  return conventional;
}

export const trim = new MeshStandardMaterial({ color: '#484847', roughness: .81, metalness: .26 });
export const structural = new MeshStandardMaterial({ color: '#313838', roughness: .91 });
const lightColors = ['#ffa35e', '#56dcff', '#ff6090', '#f9a735', '#ffdb84', '#a6e99a'];
const towerNeon = lightColors.map(color => neon(color, 2));
const beacon = neon('#ff5f37', 2.6);

const drum = new THREE.CylinderGeometry(.5,.5,1,10);
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

function towerSystems(b, solids, pipes, foliage, lights) {
  const {x,z,w,h,d,style}=b;
  if (h < 42 && style !== 3) return;
  const flip=b.type%2 ? -1 : 1;
  const part=(items,u,v,p,width,height,depth,color)=>{
    items.push([x+w*u,h*v,z+d*p,w*width,h*height,d*depth,0,color]);
  };
  const link=(items,a,c,width,color)=>{
    beam(items,x+w*a[0],h*a[1],z+d*a[2],x+w*c[0],h*c[1],z+d*c[2],width,width,color);
  };
  switch (style) {
    case 0:
      for (const side of [-1,1]) {
        const face=side*.364;
        link(pipes,[-flip*.36,.21,face],[-flip*.36,.92,face],Math.min(3.2,w*.055),'#a78d66');
        link(pipes,[-flip*.36,.26,face],[flip*.29,.26,face],Math.min(2.1,w*.044),'#736754');
        for (let row=0;row<(h>=74 ? 7 : 4);row++) {
          if ((row+b.type+(side+1))%5===1) continue;
          const center=-flip*(row%2 ? .15 : .21),level=.28+row*(h>=74 ? .090 : .14);
          const casing=['#b4a07e','#657e78','#9e634e','#8b8f76'][row%4];
          part(solids,center,level,side*(.36+(row%2)*.02),.24,.060,.23,casing);
          part(solids,center+.03,level+.006,side*(.477+(row%2)*.008),.14,.021,.014,'#292e2e');
        }
      }
      break;
    case 1:
      for (const side of [-1,1]) {
        link(solids,[-flip*.31,.26,side*.39],[flip*.23,.70,side*.37],Math.min(w*.083,5.2),'#4b5962');
        link(solids,[flip*.31,.25,side*.39],[-flip*.17,.50,side*.38],Math.min(w*.048,3.0),'#7d8990');
        part(solids,0,.785,side*.315,.26,.051,.30,'#26353e');
        part(lights,0,.797,side*.47,.13,.004,.012);
      }
      break;
    case 2:
      for (const side of [-1,1]) {
        for (const [i,y] of (h>=74 ? [.26,.52,.78] : [.35,.71]).entries()) {
          const u=(i%2 ? -flip : flip)*.17;
          const surround=['#b64b6b','#3caba5','#d89d57'][i];
          part(solids,u,y,side*.409,.29,.075,.15,surround);
          part(solids,u,y+.007,side*.485,.22,.036,.016,'#32303c');
          part(lights,u,y+.025,side*.496,.19,.006,.007);
        }
      }
      link(solids,[flip*.39,.15,.29],[flip*.19,.55,.286],Math.min(w*.07,3.8),'#9b7661');
      break;
    case 3: {
      const pipe=Math.min(w*.11,d*.13,h*.10);
      for (const side of [-1,1]) {
        const u=side*.355;
        link(pipes,[u,.21,.344],[u,.78,.344],pipe,side===flip ? '#a47555' : '#74938e');
        link(pipes,[u,.78,.344],[u,.78,-.19],pipe,side===flip ? '#a47555' : '#74938e');
        for (const y of (h>=42 ? [.36,.61,.78] : [.78])) {
          part(pipes,u,y,.344,pipe/w*1.28,.044,pipe/d*1.28,'#504e44');
        }
      }
      link(pipes,[-.355,.49,.344],[.355,.49,.344],pipe*.75,'#a19762');
      part(solids,0,.42,.391,.43,.14,.09,'#5d6356');
      for (const u of [-.147,-.073,0,.073,.147]) part(solids,u,.42,.441,.04,.11,.021,'#242c2b');
      break;
    }
    case 4:
      for (const side of [-1,1]) {
        link(solids,[side*.43,.12,0],[side*.29,.54,0],Math.min(w*.047,2.8),'#b29b6c');
        link(solids,[side*.29,.54,0],[side*.40,.78,0],Math.min(w*.045,2.6),'#b29b6c');
      }
      for (const y of (h>=74 ? [.466,.846] : [.676])) {
        for (const [u,p] of [[-.19,.13],[.16,.16],[-.08,-.19]]) {
          part(foliage,u,y,p,.15,.046,.13,'#647f55');
        }
      }
      break;
    case 5:
      link(pipes,[-flip*.32,.13,-.32],[-flip*.32,.91,-.26],Math.min(w*.074,3.2),'#829785');
      for (const [i,y] of (h>=74 ? [.38,.74] : [.59]).entries()) {
        const p=i%2 ? -.088 : .076, u=flip*(i%2 ? .138 : .09);
        for (const side of [-1,1]) {
          link(solids,[-flip*.28,y-.18,p+side*.22],[u+flip*.24,y-.083,p+side*.22],Math.min(w*.073,3.4),'#78816a');
          part(foliage,u-flip*.13,y+.131,p+side*.14,.13,.05,.13,side===1 ? '#7b9360' : '#495f3e');
        }
      }
      break;
  }
}

function signMount(levels, y, face, lateral=false) {
  let mount;
  for (const form of levels) {
    const spanScale=form.sides ? .64 : 1-2*form.bevel;
    const across=lateral ? form.d : form.w;
    const lot=lateral ? form.building.d : form.building.w;
    if (y < form.base || y > form.base+form.h || across*spanScale < lot*.24) continue;
    const rise=(y-form.base)/form.h;
    const w=THREE.MathUtils.lerp(form.w,form.topW,rise), d=THREE.MathUtils.lerp(form.d,form.topD,rise);
    const x=THREE.MathUtils.lerp(form.x,form.topX,rise)+(lateral ? face*w*.5 : 0);
    const z=form.z+(lateral ? 0 : face*d*.5);
    const edge=face*(lateral ? x : z);
    if (mount && edge<=mount.edge) continue;
    mount={x,z,edge,span:(lateral ? d : w)*spanScale};
  }
  return mount;
}

export function towers(scene, buildings, local = false) {
  const slices = finishes.map(() => []), cladding = [], coated = [];
  const caps = [], ribs = [], ledges = [], beacons = [], vents = [], glazing = [], rounds = [], domes = [], slopeRoofs = [];
  const screens = new Map(), plaques = new Map(), shrubs = [];
  const lights = lightColors.map(() => []);
  const parts = [caps,ribs,ledges,beacons,vents,glazing,rounds,domes,slopeRoofs,shrubs,...lights];
  const random = randomFor(13082);
  buildings.forEach((b, index) => {
    const lit = lights[b.style];
    const limits=parts.map(items=>items.length);
    const levels = [];
    const windowOffset = random()*13;
    const segment = (from,to,w,d,options) => {
      const form=massForm(b,from,to,w,d,options,windowOffset);
      const solids=b.style===2 || b.style===4 ? coated : cladding;
      (form.skin ? solids : slices[b.style]).push(form);
      levels.push(form);
      return form;
    };
    const masses=towerMasses(b);
    if (masses) {
      for (const {from,to,w,d,...shape} of masses) {
        segment(from,to,w,d,{...shape,cover:true});
      }
      towerSystems(b,vents,rounds,shrubs,lit);
    } else switch (b.type) {
      case 11: {
        segment(0,.30,.91,.86,{bevel:.11});
        segment(.30,.58,.53,.57,{bevel:.13,shift:-.15});
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
        segment(0,.17,.63,.60,{bevel:.22});
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
        segment(0,.93,.98,.98,{bevel:.10});
        slopeRoofs.push([b.x,b.h*.955,b.z,b.w*.98,b.h*.10,b.d*.95,0,'#6f6c63']);
        for (const side of [-1,1]) line(ledges,b.x-b.w*.47,5.85,b.z+side*b.d*.51,b.x+b.w*.47,b.z+side*b.d*.51,2.9,.81);
        break;
      case 14:
        segment(0,.16,1,1,{bevel:.06});
        segment(.16,1,.89,.81,{bevel:.06});
        for (let y=Math.max(9,b.h*.18);y<b.h-4.0;y+=5.25) {
          for (const side of [-1,1]) {
            const z=b.z+side*b.d*.416;
            for (const k of [-1,0,1]) {
              if ((Math.floor(y/5)+k+index)%5===0) continue;
              const x=b.x+k*b.w*.247;
              vents.push([x,y,z,b.w*.241,.49,3.15,0,'#92635b']);
              vents.push([x,y+.83,z+side*1.56,b.w*.227,.85,.20,0,'#68837d']);
              if (random()<.30) vents.push([x+b.w*.06,y+1.04,z-side*.38,1.55,.88,.8,0,'#686967']);
            }
          }
        }
        ribs.push([b.x+b.w*.415,b.h*.55,b.z-b.d*.32,1.3,b.h*.9,2.0]);
        break;
      case 15:
        segment(0,.79,1,1,{bevel:.05});
        for (let i=-1;i<=1;i++) {
          const x=b.x+i*b.w/3;
          slopeRoofs.push([x,b.h*.895,b.z,b.w*.337,b.h*.21,b.d,0,i===0?'#596064':'#696654']);
          glazing.push([x+b.w*.166,b.h*.884,b.z,.35,b.h*.15,b.d*.81]);
        }
        break;
      case 16:
        segment(0,.74,1,1,{bevel:.025});
        for (const side of [-1,1]) slopeRoofs.push([b.x+side*b.w*.25,b.h*.865,b.z,b.w*.53,b.h*.25,b.d*1.08,side>0?Math.PI:0,'#635d53']);
        vents.push([b.x+b.w*.12,b.h*.86,b.z+b.d*.20,1.15,3.4,1.60,0,'#656354']);
        break;
      default:
        segment(0,1,1,1,{bevel:.07});
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
      const preferredWidth=portrait?Math.min(25,b.w*.45):Math.min(55,b.w*.67);
      const form=levels.find(form=>form.base<=level && form.base+form.h>=level)??bottom;
      const signFaces=local?[-1,1]:[1];
      for (const face of signFaces) {
        const mount=masses && signMount(levels,level,face);
        const faceX=mount ? mount.x : form.x+(b.type===9?form.w*.08:0);
        const bracket=mount && b.style===2 ? Math.max(0,b.d*.50-face*(mount.z-b.z)) : 0;
        const z=mount ? mount.z+face*(.85+bracket) : b.z+face*(Math.max(form.d,form.topD)*.5+1.55);
        const w=mount ? Math.min(preferredWidth,mount.span*.86) : preferredWidth;
        const height=portrait?Math.min(w*1.54,b.h*.45):Math.min(w*.55,b.h*.35);
        screens.get(id).push(signItem(faceX,level,z,w,height,face===1?0:Math.PI,b));
        caps.push([faceX,level,z-face*.47,w+.75,height+.75,.58]);
        if (bracket>.1) caps.push([faceX,level,z-face*(.55+bracket*.5),w*.44,height*.16,bracket+.8]);
        ribs.push([faceX,level-height*.51,z-face*.25,w+.31,.48,1.35]);
      }
      if (local && tall && b.landmark) {
        const floor=Math.max(16,level-1), face=b.towardGuide;
        const mount=masses && signMount(levels,floor,face,true);
        const x=mount ? mount.x+face*.85 : b.x+face*(b.w*.5+1.3);
        const z=mount ? mount.z : b.z;
        const width=mount ? Math.min(preferredWidth*.83,mount.span*.86) : preferredWidth*.83;
        const height=portrait?Math.min(width*1.54,b.h*.45):Math.min(width*.55,b.h*.35);
        screens.get(id).push(signItem(x,floor,z,width,height,face*Math.PI/2,b));
        caps.push([x-face*.36,floor,z,.7,height+.68,width+.39]);
      }
    }
    if (b.landmark) {
      if (!plaques.has(b.sign)) plaques.set(b.sign,[]);
      const h=b.type===12?b.h*.795: Math.min(b.h*.39,43), w=Math.min(50,b.w*.70);
      for (const face of [-1,1]) {
        const mount=masses && signMount(levels,h,face);
        const z=mount ? mount.z+face*.89 : b.z+face*(b.type===12?b.d*.395:b.d*.44);
        const width=mount ? Math.min(w,mount.span*.9) : w;
        plaques.get(b.sign).push(signItem(mount ? mount.x : b.x,h,z,width,width*.22,face<0?Math.PI:0,b));
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
  addPlants(scene,'shrub',shrubs);
  addScreens(scene,screens,plaques);
  return addFacades(scene,slices,cladding,coated);
}

function ventStrike(vents,x,y,z,w) {
  for (let i=-3;i<=3;i++) vents.push([x+i*w/8,y,z,w*.062,2.4,.34,0,'#514837']);
}
