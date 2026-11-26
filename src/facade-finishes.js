import * as THREE from 'three';
import { randomFor } from './flight.js';
import { drawSurface, surfaceMap } from './surface-materials.js';
import { addWindowInteriors } from './window-interiors.js';

// The style indices are shared by the core city and the streamed districts.
export const finishes = [
  { base:'#68665d', frame:'#a19b85', pane:'#313e40', lamps:['#ffc074','#ffe3aa','#d3ccaa'],
    grid:[5,6], repeat:[33,33], opening:[.32,.14,.72], activity:.32, surface:0, metalness:.07, deep:true },
  { base:'#143445', frame:'#5297a5', pane:'#286476', lamps:['#66e7ff','#9af2ef','#c1defe'],
    grid:[10,5], repeat:[32,26], opening:[.043,.065,.84], activity:.27, surface:1, metalness:.53 },
  { base:'#724438', frame:'#bb7862', pane:'#42363e', lamps:['#ff7e8d','#ffb972','#ffe6b6'],
    grid:[6,8], repeat:[34,29], opening:[.19,.25,.58], activity:.53, surface:2, metalness:.12, deep:true },
  { base:'#404c44', frame:'#86724c', pane:'#384b42', lamps:['#ffb951','#e5d08d','#f2ae80'],
    grid:[4,4], repeat:[33,25], opening:[.083,.28,.29], activity:.46, surface:2, metalness:.31 },
  { base:'#948573', frame:'#cdbb91', pane:'#44353d', lamps:['#ffcc7b','#f8ebc3','#e8a88d'],
    grid:[8,6], repeat:[43,34], opening:[.23,.10,.77], activity:.30, surface:0, metalness:.18, deep:true },
  { base:'#204c42', frame:'#668563', pane:'#3e6957', lamps:['#b6ef91','#88e4ba','#e1ebb0'],
    grid:[6,6], repeat:[34,31], opening:[.075,.16,.68], activity:.42, surface:1, metalness:.31 },
];

const materials = [];
const { euclideanModulo: wrap } = THREE.MathUtils;

export function hasWindow(style, col, row) {
  if (style === 0) return wrap(col,5) !== 0 && wrap(row,6) !== 5;
  if (style === 3) return wrap(row,4) === 1;
  if (style === 4) return wrap(col,4) !== 0;
  return true;
}

function cladding(ctx, style, channel) {
  const { base, frame, grid:[cols,rows], surface } = finishes[style];
  const size = ctx.canvas.width;
  const w = size / cols, h = size / rows;
  const relief = channel === 'height', rough = channel === 'roughness';
  const rect = (x,y,w,h,color,height='#999',roughness='#ccc') => {
    ctx.fillStyle = rough ? roughness : relief ? height : color;
    ctx.fillRect(x,y,w,h);
  };
  rect(0,0,size,size,base,'#888');
  if (!rough) {
    ctx.save();
    ctx.globalAlpha = relief ? .4 : .34;
    if (relief) ctx.filter = 'grayscale(1) contrast(1.35)';
    drawSurface(ctx,surface);
    ctx.restore();
  }

  switch (style) {
    case 0:
      for (let row=0; row<rows; row++) {
        rect(0,row*h,size,2,'#292a27','#535353');
        rect(0,row*h+2,size,3,'#d7cbb440','#aaa');
      }
      rect(w*.17,0,w*.61,size,'#393d36','#626262');
      rect(w*.18,0,w*.11,size,'#bb9a63','#bcbcbc');
      rect(0,5*h,size,h*.59,'#474840','#777');
      for (let bolt=0; bolt<14; bolt++) rect((bolt+.33)*size/14,5.18*h,3,3,'#b0a58c','#585858');
      break;
    case 1: {
      if (channel === 'color') {
        const reflection = ctx.createLinearGradient(0,0,size,size);
        reflection.addColorStop(0,'#071822');
        reflection.addColorStop(.48,'#41698a');
        reflection.addColorStop(.68,'#16495d');
        reflection.addColorStop(1,'#121d39');
        ctx.fillStyle = reflection;
        ctx.fillRect(0,0,size,size);
      }
      for (let col=0; col<cols; col++) {
        rect(col*w,0,w*.049,size,frame+'8c','#a8a8a8');
        if (col%5 === 0) rect(col*w,0,w*.17,size,'#8ab7bd','#b0b0b0');
      }
      rect(0,0,size,h*.095,'#88d6db','#999','#999');
      break;
    }
    case 2:
      for (let row=0; row<rows; row++) {
        rect(0,(row+.02)*h,size,.18*h,row%2 ? '#462f2d' : '#995848','#b8b8b8');
        rect(0,(row+.93)*h,size,.07*h,'#321f25','#626262');
      }
      for (let col=0; col<cols; col++) {
        rect((col+.074)*w,0,w*.035,size,'#bd9876','#c5c5c5');
        rect((col+.12)*w,0,w*.022,size,'#402b26','#666');
      }
      break;
    case 3:
      for (let row=0; row<rows; row++) for (let col=0; col<cols; col++) {
        rect(col*w,row*h,w*.985,h*.045,'#cf9746','#b9b9b9');
        rect(col*w,(row+.05)*h,w*.015,h*.94,'#2e2e29','#535353');
        if (row === 1) continue;
        rect((col+.08)*w,(row+.23)*h,w*.84,h*.60,'#222e2e','#555');
        for (let slat=0; slat<5; slat++) {
          rect((col+.10)*w,(row+.25+slat*.112)*h,w*.80,h*.037,'#6a7060','#b8b8b8');
        }
      }
      break;
    case 4:
      for (const pier of [0,4]) {
        rect(pier*w,0,w,size,'#554641','#696969');
        for (let flute=0; flute<5; flute++) {
          rect((pier+.05+flute*.2)*w,0,w*.115,size,flute%2 ? '#b0956b' : '#c8ad81','#c5c5c5');
        }
      }
      for (let row=0; row<rows; row++) rect(0,(row+.89)*h,size,h*.063,'#caaa80','#b6b6b6');
      break;
    case 5:
      for (let row=0; row<rows; row++) {
        rect(0,(row+.86)*h,size,h*.125,row%3 === 2 ? '#a8bb6b' : '#4d7454','#b8b8b8');
        rect(0,(row+.96)*h,size,h*.032,'#233e31','#535353');
      }
      for (let col=0; col<cols; col++) {
        rect(col*w,0,w*(col%3 === 0 ? .19 : .047),size,frame,'#bebebe');
      }
      break;
  }
}

export function facadeMaterial(style) {
  if (materials[style]) return materials[style];
  const finish = finishes[style];
  const { frame, pane, lamps, activity, grid:[cols,rows], repeat:[width, height],
    opening:[inset,top,tall], metalness, deep } = finish;
  const makeMap = channel => surfaceMap(channel === 'color' || channel === 'height' ? 1024 : 512, ctx => {
    const relief = channel === 'height', rough = channel === 'roughness', glow = channel === 'emission';
    const size = ctx.canvas.width, w = size/cols, h = size/rows;
    if (glow) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0,0,size,size);
    } else cladding(ctx,style,channel);
    const random = randomFor(900 + style);
    for (let row=0; row<rows; row++) {
      const use = random();
      for (let col=0; col<cols; col++) {
        const lit = random() < activity * (use < .24 ? .32 : use > .72 ? 1.51 : 1);
        const light = lamps[Math.floor(random()*lamps.length)];
        const shade = random();
        if (!hasWindow(style,col,row) || glow && !lit) continue;
        const x = (col+inset)*w, y = (row+top)*h;
        const ww = w*(1-2*inset), hh = h*tall;
        if (!glow && !rough && style !== 1) {
          ctx.fillStyle = relief ? '#b9b9b9' : frame;
          ctx.fillRect(x-2,y-2,ww+4,hh+4);
        }
        if (relief || rough) ctx.fillStyle = relief ? '#414141' : shade > .63 ? '#525252' : '#303030';
        else {
          const gradient = ctx.createLinearGradient(0,y,0,y+hh);
          gradient.addColorStop(0,glow ? light : pane);
          gradient.addColorStop(glow ? .58 : .28,glow ? light : pane);
          gradient.addColorStop(1,glow ? '#241911' : '#0c1922');
          ctx.fillStyle = gradient;
        }
        if (glow) ctx.globalAlpha = .55 + shade*.45;
        if (channel === 'color' && style === 1) ctx.globalAlpha = .51 + shade*.3;
        ctx.fillRect(x,y,ww,hh);
        ctx.globalAlpha = 1;
        ctx.fillStyle = glow ? '#130d1488' : relief ? '#9c9c9c' : rough ? '#a0a0a0' : frame+'b5';
        const mullion = style === 0 ? .30 : style === 3 ? .67 : .51;
        ctx.fillRect(x+ww*mullion,y,Math.max(1.4,w*.033),hh);
        if (style === 2 && shade < .37 && !relief && !rough) {
          ctx.fillStyle = glow ? '#3b1a2c96' : '#362a367f';
          for (let slat=0; slat<4; slat++) ctx.fillRect(x,y+hh*slat*.12,ww,hh*.075);
        }
      }
    }
  }, channel === 'height' || channel === 'roughness');
  const material = new THREE.MeshStandardMaterial({
    map:makeMap('color'), emissiveMap:makeMap('emission'), bumpMap:makeMap('height'), roughnessMap:makeMap('roughness'),
    emissive:'#ffffff', emissiveIntensity:.82, bumpScale:deep ? .10 : .045, roughness:1, metalness,
  });
  addWindowInteriors(material,new THREE.Vector4(cols,rows,width/cols,height/rows),
    new THREE.Vector4(inset,top,tall,(style+1)*31.7));
  materials[style] = material;
  return material;
}
