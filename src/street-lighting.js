import * as THREE from 'three';
import { batch, box, neon } from './scene-parts.js';

const bulb = neon('#ffffff', 2.4);
const lampColors = ['#ffbe7d', '#ffd9a6', '#ade1ff', '#ffba82'];

export function addStreetLamps(scene, items, offsetX = 0, offsetZ = 0) {
  const fixtures=[];
  const emitters=items.map(([x,y,z,w,h,d,rotation,tint])=>{
    const lightsStreet=y>=3.28 && y<=8.5 && h<=1.2 && w<=3.4 && d<=3.4;
    const worldX=x+offsetX, worldZ=z+offsetZ;
    const id=Math.abs(Math.round(worldX*.73+worldZ*.39));
    const color=tint??(lightsStreet?lampColors[id%lampColors.length]:'#ffcc87');
    if (lightsStreet) fixtures.push({x:worldX,y:y-.19,z:worldZ,color,power:185,range:33});
    return [x,y,z,w,h,d,rotation,color];
  });
  batch(scene,box,bulb,emitters);
  return fixtures;
}

export function streetLighting(scene) {
  const slots=Array.from({length:6},()=>{
    const light=new THREE.PointLight('#ffce99',0,32,2);
    scene.add(light);
    return {light,source:null,desired:null};
  });
  const lights=slots.map(slot=>slot.light);
  const heading=new THREE.Vector3();
  let nextPick=0;
  const identity=source=>`${source.x.toFixed(1)}/${source.y.toFixed(1)}/${source.z.toFixed(1)}`;
  return {
    lights,
    update(now,dt,camera,origin,groups) {
      if (now>=nextPick) {
        nextPick=now+112;
        camera.getWorldDirection(heading);
        const x=camera.position.x+origin.x, y=camera.position.y, z=camera.position.z+origin.z;
        const retained=new Set(slots.flatMap(slot=>slot.desired?[identity(slot.desired)]:[]));
        const choices=[];
        for (const group of groups) for (const source of group) {
          const dx=source.x-x, dy=source.y-y, dz=source.z-z;
          const distanceSquared=dx*dx+dy*dy+dz*dz;
          if (distanceSquared>137**2) continue;
          const ahead=dx*heading.x+dy*heading.y+dz*heading.z;
          const key=identity(source);
          const score=Math.sqrt(distanceSquared)-source.range*.35-THREE.MathUtils.clamp(ahead*.45,-18,24);
          choices.push({key,source,score:score-(retained.has(key)?4:0)});
        }
        const selected=new Map();
        for (const {key,source} of choices.sort((a,b)=>a.score-b.score)) {
          if (!selected.has(key)) selected.set(key,source);
          if (selected.size===slots.length) break;
        }
        for (const slot of slots) {
          const key=slot.source && identity(slot.source);
          slot.desired=selected.get(key) ?? null;
          if (slot.desired) selected.delete(key);
        }
        for (const source of selected.values()) {
          const free=slots.find(slot=>!slot.desired);
          if (free) free.desired=source;
        }
      }
      for (const slot of slots) {
        const {light,desired}=slot;
        const same=slot.source && desired && identity(slot.source)===identity(desired);
        if (!same && light.intensity<5) slot.source=desired;
        const source=slot.source;
        if (source) {
          light.position.set(source.x-origin.x,source.y,source.z-origin.z);
          light.color.set(source.color);
          light.distance=source.range;
        }
        const next=source && desired && identity(source)===identity(desired) ? source.power : 0;
        light.intensity=THREE.MathUtils.damp(light.intensity,next,next>0?8:14,dt);
      }
    },
  };
}
