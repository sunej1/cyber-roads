import * as THREE from 'three';

export function streetFixtures(items, offsetX = 0, offsetZ = 0) {
  const fixtures=[];
  const colors=['#ffbe7d','#ffd9a6','#ade1ff','#ffba82'];
  for (const [x,y,z,w,h,d] of items) {
    if (y<3.28 || y>8.5 || h>1.2 || w>3.4 || d>3.4) continue;
    const id=Math.abs(Math.round(x*.73+z*.39));
    fixtures.push({x:x+offsetX,y:y-.19,z:z+offsetZ,color:colors[id%colors.length],power:185,range:33});
  }
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
        const x=camera.position.x+origin.x+heading.x*39;
        const z=camera.position.z+origin.z+heading.z*39;
        const choices=[];
        for (const group of groups) for (const source of group) {
          const dx=source.x-x,dz=source.z-z;
          const d=dx*dx+dz*dz;
          if (d>137**2) continue;
          const align=dx*heading.x+dz*heading.z;
          choices.push({source,score:d*(source.range<24?.83:1)+Math.max(0,-align)*19});
        }
        const selected=new Map(choices.sort((a,b)=>a.score-b.score).slice(0,slots.length)
          .map(({source})=>[identity(source),source]));
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
