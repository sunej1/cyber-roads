import { BufferGeometry, Float32BufferAttribute, Mesh, MeshBasicMaterial, MeshStandardMaterial } from 'three';
import { lanternMile } from './meridian-plan.js';
import { batch, beam, box, line, neon, texture } from './scene-parts.js';

const signs = [
  ['RAMEN','#ff457c'], ['ARCADE','#39efff'], ['KTV','#b968ff'], ['RADIO','#ffac52'],
  ['CLINIC','#64ffc3'], ['TEA','#f4e679'], ['NOODLE','#fe5247'], ['LANTERN MILE','#ff81ce'],
];
const entrance=signs.length-1;

const signAtlas=texture(1024,512,ctx=>{
  for (const [index,[label,tint]] of signs.entries()) {
    ctx.save();
    ctx.translate(index%4*256,Math.floor(index/4)*256);
    ctx.fillStyle='#15101c';
    ctx.fillRect(0,0,256,256);
    ctx.strokeStyle=tint;
    ctx.lineWidth=4;
    ctx.strokeRect(12,10,232,236);
    ctx.globalAlpha=.45;
    ctx.strokeRect(22,18,212,220);
    ctx.globalAlpha=1;
    ctx.fillStyle=tint;
    ctx.textAlign='center';
    ctx.shadowColor=tint;
    ctx.shadowBlur=8;
    if (index===entrance) {
      ctx.font='900 39px "Arial Black", sans-serif';
      ctx.fillText(label,128,132,213);
      ctx.font='700 19px monospace';
      ctx.fillText('NIGHT MARKET',128,183,186);
    } else {
      ctx.font='900 43px Impact, "Arial Black", sans-serif';
      const pitch=Math.min(60,197/label.length);
      ctx.fillRect(93,27,70,4);
      ctx.fillRect(93,223,70,4);
      ctx.scale(1.8,1);
      for (let i=0;i<label.length;i++) ctx.fillText(label[i],128/1.8,129+(i-(label.length-1)/2)*pitch+13);
    }
    ctx.restore();
  }
});
const signMaterial=new MeshBasicMaterial({map:signAtlas, color:0xffffff});
signMaterial.color.multiplyScalar(1.95);
const tubeMaterial=neon('#ffffff',2.2);
const paintedMetal=new MeshStandardMaterial({roughness:.63,metalness:.35});

export function addLanternMile(scene,buildings,lamps,spill) {
  const frames=[], tubes=[], vertices=[], uvs=[];
  const placeSign = (x,y,z,w,h,index) => {
    frames.push([x,y,z,w+.25,h+.28,.27,0,'#261e32']);
    const u=index%4/4,v=1-Math.floor(index/4)/2,du=1/4,dv=1/2;
    for (const facing of [-1,1]) {
      const left=x-facing*w/2,right=x+facing*w/2,face=z+facing*.15;
      vertices.push(left,y-h/2,face,right,y-h/2,face,right,y+h/2,face,
        left,y-h/2,face,right,y+h/2,face,left,y+h/2,face);
      uvs.push(u,v-dv,u+du,v-dv,u+du,v,u,v-dv,u+du,v,u,v);
    }
  };

  buildings.filter(b=>b.nightMarket).forEach((b,index)=>{
    const faceDirection=Math.sign(Math.sin(b.yaw));
    const facade=b.x+faceDirection*b.d/2;
    const outside=depth=>facade+faceDirection*depth;
    const shop=(index*3+1)%entrance;
    const tint=signs[shop][1], accent=signs[(shop+1)%entrance][1];
    const bladeZ=b.z+(index%2?1:-1)*b.w*.24;
    const bladeY=11+index%4*1.8;
    const bladeHeight=7.6+index%3*2.15;
    const bladeWidth=2.7+index%3*.5;
    placeSign(outside(2.3),bladeY,bladeZ,bladeWidth,bladeHeight,shop);
    for (const y of [bladeY-bladeHeight*.37,bladeY+bladeHeight*.38]) {
      line(frames,outside(-b.d*.17),y,bladeZ,outside(3.6),bladeZ,.27,.27,'#373343');
    }
    const upperY=Math.min(50,b.h*.75+3.5);
    placeSign(outside(1.8),upperY,b.z-b.w*.25,2.7,5.8+index%4*2,(shop+3)%entrance);
    line(frames,outside(-b.d*.25),upperY,b.z-b.w*.25,outside(2.6),b.z-b.w*.25,.31,.36,'#302a39');
    const rail=upperY-6;
    tubes.push([outside(.86),6+rail*.33,b.z-b.w*.39,.23,rail*.66,.31,0,tint]);
    tubes.push([outside(.86),upperY-rail*.26,b.z+b.w*.39,.21,rail*.52,.29,0,index%3?tint:accent]);
    const awning=b.w*.72;
    frames.push([outside(1.75),4.6,b.z,3.7,.27,awning,0,index%2?'#5b2648':'#254958']);
    tubes.push([outside(3.61),4.44,b.z,.24,.23,awning,0,tint]);
    for (let z=b.z-awning*.42;z<b.z+awning*.49;z+=2.2) {
      frames.push([outside(1.75),4.77,z,3.7,.075,.32,0,'#232835']);
    }
    frames.push([outside(2.17),.88,b.z+b.w*.23,1.9,1.7,2.8,0,'#383c45']);
    tubes.push([outside(3.14),1.48,b.z+b.w*.23,.12,.22,2.48,0,accent]);
    lamps.push([outside(2.8),4.67,b.z,.33,.28,.42,0,tint]);
    spill.push([outside(6.8),.284,b.z,18,1,b.w*.87,0,tint]);
  });

  const {x,blocks}=lanternMile;
  for (const [block,[start,end]] of blocks.entries()) {
    for (const fraction of [.19,.52,.83]) {
      const z=start+(end-start)*fraction;
      const tint=signs[(block*2+Math.round(fraction*9))%entrance][1];
      for (const side of [-1,1]) {
        frames.push([x+side*15.3,7.7,z,.26,15.4,.27,0,'#3b2e42']);
        tubes.push([x+side*15.3,10.8,z,.29,4.2,.29,0,tint]);
      }
      const point=t=>[x-15.3+t*30.6,12.6+2.5*(2*t-1)**2,z+(t-.5)*4.6];
      for (let i=0;i<8;i++) {
        const a=point(i/8), b=point((i+1)/8);
        beam(frames,...a,...b,.12,.12,'#241d2a');
        if (i>0) tubes.push([a[0],a[1]-.31,a[2],.37,.68,.37,0,i%3===0?'#ffe39d':tint]);
      }
      if (fraction===.83) {
        line(frames,x-15.3,13.29,z,x+15.3,z,.22,.25,'#3b2e42');
        placeSign(x,11.25,z,17.4,3.7,entrance);
      }
    }
  }
  batch(scene,box,paintedMetal,frames);
  batch(scene,box,tubeMaterial,tubes);
  const geometry=new BufferGeometry();
  geometry.setAttribute('position',new Float32BufferAttribute(vertices,3));
  geometry.setAttribute('uv',new Float32BufferAttribute(uvs,2));
  scene.add(new Mesh(geometry,signMaterial));
}
