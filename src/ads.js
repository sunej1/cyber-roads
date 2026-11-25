import * as THREE from 'three';
import atlasUrl from './assets/billboards.jpg';
import { batch, texture } from './scene-parts.js';

const atlas = new Image();
atlas.src = atlasUrl;
const clock = { value: 0 };
const plane = new THREE.PlaneGeometry();
const materials = new Map();

const campaigns = {
  optics: { brand: 'VANTA OPTICS', icon: 'lens', headline: ['SEE IN', 'THE DARK.'], product: 'NIGHT GLASS / V-04', offer: 'FROM ₡199', cta: 'FITTING OPEN UNTIL 04:00', ink: '#ffdc72', field: '#24191a', image: 0 },
  kairos: { brand: 'KAIROS DOMESTIC', icon: 'eye', headline: ['YOUR SECOND', 'SHIFT.'], product: 'K–8 ASSISTANCE UNIT', offer: 'LEASE ₡29 / WEEK', cta: 'SAME-NIGHT DELIVERY · SECTOR 04', ink: '#a2faf2', field: '#123234', image: 1 },
  verdant: { brand: 'VERDANT UTILITIES', icon: 'leaf', headline: ['CLEAN AIR', 'ON CREDIT.'], product: 'GROWPOD HOME FILTER', offer: '₡12 / MONTH', cta: 'APPLY AT ANY SERVICE KIOSK', ink: '#e0fa84', field: '#21311a', image: 2 },
  nova: { brand: 'NOVA MOBILITY', icon: 'wing', headline: ['OWN THE', 'ALTITUDE.'], product: 'NOVA NX–2 / VTOL', offer: 'PREORDER NOW', cta: 'TEST FLIGHTS · BAY 14', ink: '#ffc274', field: '#272012', image: 3 },
  metro: { brand: 'MERIDIAN AIR METRO', icon: 'rail', headline: ['SKIP THE', 'GRIDLOCK.'], product: '24-HOUR EXPRESS', offer: '₡3 / RIDE', cta: 'BOARD AT LIFT 24', ink: '#ffd450', field: '#232b24' },
  freight: { brand: 'SABLE FREIGHT', icon: 'rail', headline: ['NIGHT SHIFT', 'NOW HIRING.'], product: 'FREIGHT HANDLING / GATE 04', offer: 'PAID PER LOAD', cta: 'WALK-IN INDUCTION AT 23:00', ink: '#ffcb82', field: '#2a2119' },
  grid: { brand: 'NINE GRID CO.', icon: 'wing', headline: ['POWER WHEN', 'THE GRID QUITS.'], product: 'BACKUP CELLS / N–09', offer: '₡40 DEPOSIT', cta: 'TRADE EMPTY CELLS AT KILN 09', ink: '#f5ae73', field: '#30201b' },
  market: { brand: 'LOCKSIDE PUBLIC MARKET', icon: 'lens', headline: ['FRESH UNTIL', 'FIRST LIGHT.'], product: 'NIGHT MARKET / EAST QUAY', offer: 'OPEN 22:00–05:00', cta: 'FOOD · REPAIRS · SURPLUS', ink: '#ffdca6', field: '#33251f' },
};

const sponsors = { NOCTURNE: 'optics', KAIROS: 'kairos', NOVA: 'nova', LANTERN: 'market', SABLE: 'freight',
  OYAMA: 'grid', MERIDIAN: 'metro', ORBIT: 'optics', VERDANT: 'verdant', CROWN: 'metro', TIDELINE: 'freight', 'PORT / 01': 'freight' };
export const campaignFor = building => building.ad ?? sponsors[building.sign] ?? (campaigns[building.sign] ? building.sign : null);
export function setScreenTime(time) { clock.value = time; }

function paintLogo(ctx, icon, x, y, size, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size, size);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = .09;
  ctx.beginPath();
  if (icon === 'lens' || icon === 'eye') {
    ctx.ellipse(.5,.5, .45, icon === 'eye' ? .27 : .40, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(.5,.5,.13,0,Math.PI*2);
    ctx.fill();
  } else if (icon === 'rail') {
    ctx.moveTo(.05,.65); ctx.lineTo(.35,.17); ctx.lineTo(.57,.17); ctx.lineTo(.29,.65);
    ctx.moveTo(.44,.77); ctx.lineTo(.74,.17); ctx.lineTo(.94,.17); ctx.lineTo(.64,.77);
    ctx.stroke();
  } else {
    ctx.moveTo(.05,.73); ctx.lineTo(.82,.13); ctx.lineTo(.63,.69); ctx.lineTo(.44,.87); ctx.lineTo(.05,.73);
    ctx.moveTo(.38,.66); ctx.lineTo(.72,.32);
    ctx.stroke();
  }
  ctx.restore();
}

const headlineFont = size => `900 ${size}px Impact, "Arial Black", sans-serif`;
const labelFont = size => `700 ${size}px monospace`;

function paintCampaign(ctx, ad, portrait) {
  const { width: w, height: h } = ctx.canvas;
  const inset = 24;
  ctx.fillStyle = ad.field;
  ctx.fillRect(0, 0, w, h);
  const artX = portrait ? 14 : Math.round(w * .57);
  const artY = portrait ? Math.round(h * .54) : 0;
  const artW = w - artX;
  const artH = portrait ? Math.round(h * .325) : h;
  if (ad.image !== undefined && atlas.complete && atlas.naturalWidth) {
    const tileW = atlas.naturalWidth / 2, tileH = atlas.naturalHeight / 2;
    const cropW = tileW * (portrait ? .78 : .66);
    const cropH = tileH * (portrait ? .54 : .89);
    ctx.drawImage(atlas, (ad.image % 2 + 1)*tileW-cropW-3, Math.floor(ad.image/2)*tileH + (portrait ? 38 : 12),
      cropW, cropH, artX, artY, artW, artH);
    const fade = ctx.createLinearGradient(artX, artY, artX + artW * .23, artY);
    fade.addColorStop(0, ad.field);
    fade.addColorStop(1, ad.field + '00');
    ctx.fillStyle = fade;
    ctx.fillRect(artX, artY, artW, artH);
  } else {
    ctx.save();
    ctx.globalAlpha = .22;
    paintLogo(ctx, ad.icon, artX + artW * .1, artY + artH * .13, Math.min(artW * .85,artH * .78), ad.ink);
    ctx.restore();
  }

  ctx.fillStyle = ad.ink;
  paintLogo(ctx, ad.icon, inset, inset, 37, ad.ink);
  ctx.font = labelFont(portrait ? 18 : 21);
  ctx.fillText(ad.brand, 69, 49, w - 95);
  ctx.fillRect(inset, 68, portrait ? w - inset * 2 : w * .48, 2);
  ctx.fillStyle = '#f9f3dd';
  ctx.font = headlineFont(portrait ? 70 : 76);
  const headlineWidth = portrait ? w - 45 : Math.round(w * .58) - 18;
  ctx.fillText(ad.headline[0], inset, 144, headlineWidth);
  ctx.fillText(ad.headline[1], inset, 215, headlineWidth);
  ctx.fillStyle = ad.ink;
  ctx.font = labelFont(portrait ? 15 : 18);
  ctx.fillText(ad.product, inset, 247, headlineWidth);
  ctx.font = labelFont(portrait ? 19 : 25);
  const offerWidth = Math.min(headlineWidth, ctx.measureText(ad.offer).width + 20);
  ctx.fillRect(inset, 265, offerWidth, portrait ? 27 : 34);
  ctx.fillStyle = ad.field;
  ctx.fillText(ad.offer, inset + 8, portrait ? 285 : 289, offerWidth - 13);

  ctx.fillStyle = '#111718';
  ctx.fillRect(0, h - 48, w, 48);
  ctx.fillStyle = ad.ink;
  ctx.font = labelFont(portrait ? 13 : 16);
  ctx.fillText(ad.cta, inset, h - 16, w - 88);
  for (let i = 0; i < 4; i++) ctx.fillRect(w - 49 + 7*i, h - 36, i % 2 ? 2 : 4, 18);
  ctx.fillRect(0, 0, w, 4);
  ctx.fillStyle = '#0e141467';
  for (let y = 3; y < h - 48; y += 5) ctx.fillRect(0,y,w,1);
}

function screenMaterial(key, portrait) {
  const id = key + (portrait ? '/vertical' : '/wide');
  if (materials.has(id)) return materials.get(id);
  const ad = campaigns[key];
  const paint = ctx => paintCampaign(ctx,ad,portrait);
  const map = texture(portrait ? 364 : 686, portrait ? 558 : 376, paint);
  if (ad.image !== undefined && !atlas.complete) atlas.addEventListener('load', () => {
    paint(map.image.getContext('2d'));
    map.needsUpdate = true;
  }, { once: true });
  const material = new THREE.MeshBasicMaterial({ map, color: new THREE.Color(1.07, 1.07, 1.07) });
  material.onBeforeCompile = shader => {
    shader.uniforms.screenTime = clock;
    shader.fragmentShader = 'uniform float screenTime;\n' + shader.fragmentShader.replace('#include <map_fragment>',
      '#include <map_fragment>\ndiffuseColor.rgb *= 1.0 + .095 * smoothstep(.94,.999,sin(vMapUv.y*9.0-screenTime*.65));');
  };
  materials.set(id,material);
  return material;
}

export function addScreens(scene, screens, plaques) {
  for (const [id, items] of screens) {
    const [key, format] = id.split('/');
    batch(scene, plane, screenMaterial(key, format === 'vertical'), items);
  }
  for (const [name, items] of plaques) {
    if (!materials.has(name)) {
      const map = texture(512, 104, ctx => {
        ctx.fillStyle = '#111c20';
        ctx.fillRect(0,0,512,104);
        ctx.fillStyle = '#f5cf84';
        ctx.fillRect(13,15,6,72);
        ctx.font = headlineFont(75);
        ctx.fillText(name,33,80,460);
      });
      materials.set(name,new THREE.MeshBasicMaterial({ map, color: new THREE.Color(1.12,1.12,1.12) }));
    }
    batch(scene, plane, materials.get(name), items);
  }
}
