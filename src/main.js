import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RayLightingPass } from './ray-lighting.js';
import { installSkyProbe } from './surface-materials.js';
import { createCity } from './city.js';
import { createCraft } from './craft.js';
import { createRain } from './weather.js';
import { advanceFlight, departure, districtAt, districts, nearestGuideFlight, nearestRoute, newFlight, park, plaza, route, routeSamples, shore } from './flight.js';
import { closestSpine, coreEdge, coreTile, districtForPosition, groundAt, spinePoint, tileAt, tileSize } from './extent.js';
import { streets as cityStreets } from './meridian-plan.js';
import './style.css';

const element = id => document.getElementById(id);
const game = element('game');
const canvas = element('view');
const menu = element('menu');
const hud = document.querySelector('.hud');
const touch = element('touch');
const tourButton = element('tour');
const manualButton = element('manual');
const districtButton = element('district-tour');
const landmarkText = element('landmark-name');
const cameraButton = element('camera');
const pauseButton = element('pause');
const lightingButton = element('lighting');
const restartButton = element('restart');
const recoverButton = element('recover');
const modeButton = element('mode');
const map = element('map');
const mapContext = map.getContext('2d');
const mapBase = document.createElement('canvas');
mapBase.width = map.width;
mapBase.height = map.height;
const mapScale = .073;
const mapX = x => 230 + x * mapScale;
const mapY = z => 99 + z * mapScale;

const circuit = [];
for (const district of districts) {
  const item = document.createElement('li');
  item.style.setProperty('--district-color', district.color);
  const name = document.createElement('strong');
  name.textContent = district.name;
  const description = document.createElement('span');
  description.textContent = district.description;
  item.append(name, description);
  element('districts').append(item);
  circuit.push(item);
}
element('route-length').textContent = 'Outbound tour';

function drawMapBase(buildings) {
  const ctx = mapBase.getContext('2d');
  ctx.fillStyle = '#171c2b';
  ctx.fillRect(0, 0, map.width, map.height);
  ctx.strokeStyle = '#262d41';
  ctx.lineWidth = 1;
  for (let x = 12.5; x < map.width; x += 18) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, map.height); ctx.stroke();
  }
  for (let y = 6.5; y < map.height; y += 18) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(map.width, y); ctx.stroke();
  }
  ctx.beginPath();
  shore.forEach(([x, z], i) => i === 0 ? ctx.moveTo(mapX(x), mapY(z)) : ctx.lineTo(mapX(x), mapY(z)));
  ctx.closePath();
  ctx.fillStyle = '#2a3344';
  ctx.fill();
  ctx.strokeStyle = '#4b6979';
  ctx.stroke();
  ctx.save();
  ctx.clip();
  for (const { x,z,w,d,yaw,h } of buildings) {
    ctx.save();
    ctx.translate(mapX(x),mapY(z));
    ctx.rotate(-yaw);
    ctx.fillStyle=h>100?'#455263':'#353f50';
    ctx.fillRect(-w*mapScale/2,-d*mapScale/2,w*mapScale,d*mapScale);
    ctx.restore();
  }
  for (const { x, z, toX, toZ, kind } of cityStreets) {
    ctx.strokeStyle = kind === 'avenue' ? '#a5a79a' : kind === 'quay' ? '#76978e' : '#546771ae';
    ctx.lineWidth = kind === 'avenue' ? 1.65 : kind === 'quay' ? 1.12 : .66;
    ctx.beginPath();
    ctx.moveTo(mapX(x), mapY(z));
    ctx.lineTo(mapX(toX), mapY(toZ));
    ctx.stroke();
  }
  ctx.fillStyle = '#46736f';
  for (const { x, z, w, d } of [park, plaza]) ctx.fillRect(mapX(x - w / 2), mapY(z - d / 2), w * mapScale, d * mapScale);
  ctx.restore();
  ctx.beginPath();
  const openingRoute = routeSamples.concat(departure.getSpacedPoints(35));
  openingRoute.forEach(({ x, z }, i) => i === 0 ? ctx.moveTo(mapX(x), mapY(z)) : ctx.lineTo(mapX(x), mapY(z)));
  ctx.lineWidth = 4.8;
  ctx.strokeStyle = '#122429';
  ctx.stroke();
  ctx.strokeStyle = '#67d9d2';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  for (const district of districts) {
    const point = route.getPointAt(district.station);
    ctx.beginPath();
    ctx.arc(mapX(point.x), mapY(point.z), 4.2, 0, Math.PI * 2);
    ctx.fillStyle = district.color;
    ctx.fill();
    ctx.strokeStyle = '#15242b';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.fillStyle = '#9aacbd';
  ctx.font = '16px monospace';
  ctx.fillText('N', 417, 38);
  ctx.beginPath();
  ctx.moveTo(422, 44); ctx.lineTo(417, 54); ctx.lineTo(427, 54); ctx.closePath(); ctx.fill();
}

const keyMap = new Map(Object.entries({
  KeyW: 'throttle', ArrowUp: 'throttle', KeyS: 'brake', ArrowDown: 'brake',
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  Space: 'rise', KeyE: 'rise', ControlLeft: 'sink', ControlRight: 'sink', KeyQ: 'sink',
  ShiftLeft: 'boost', ShiftRight: 'boost',
}));
const pressed = new Set();
const fingers = new Map();
const inputs = new Set();
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const desiredCamera = new THREE.Vector3();
const desiredTarget = new THREE.Vector3();
const target = new THREE.Vector3();
const origin = new THREE.Vector3();
const pace = 1 / 120;
let renderer, scene, camera, composer, city, craft, rayPass, updateRain;
let status = 'ready';
let flight = newFlight();
let guided = true;
let noseCamera = false;
let lookYaw = 0;
let lookPitch = 0;
let lookTouch;
let snapCamera = true;
let time = 0;
let width = 1, height = 1;
let last = 0, accumulator = 0, nextHud = 0;
let displayedDistrict = null;
let displayedWarning = false;
let viewedLandmark = null;
let landmarkLook = 0;

function clearInput() {
  pressed.clear();
  fingers.clear();
  inputs.clear();
  lookTouch = undefined;
}

function setStatus(value) {
  status = value;
  game.dataset.mode = value;
  const flying = value === 'flying';
  const paused = value === 'paused';
  menu.hidden = flying;
  hud.hidden = !flying;
  pauseButton.hidden = cameraButton.hidden = !flying;
  restartButton.hidden = !paused;
  districtButton.hidden = paused;
  touch.hidden = !flying || guided;
  tourButton.firstElementChild.textContent = paused && guided ? 'Resume guided flight' : 'Start guided flight';
  manualButton.firstElementChild.textContent = paused && !guided ? 'Resume manual flight' : 'Fly manually';
  element('launch-title').innerHTML = paused ? 'FLIGHT<span> PAUSED</span>' : 'CYBER<span> ROADS</span>';
  element('menu-copy').textContent = paused ? 'Resume from your current position or restart at the harbor.' : 'Fly low through Meridian or join the district tour at the canal.';
  element('state').textContent = paused ? 'Flight paused' : flying ? (guided ? 'Guided flight' : 'Manual flight') : 'System ready';
  modeButton.lastChild.textContent = guided ? ' Take control' : ' Join guided flight';
  recoverButton.hidden = guided;
  game.classList.toggle('guided', guided);
  clearInput();
  accumulator = 0;
  nextHud = 0;
  if (paused) (guided ? tourButton : manualButton).focus();
}

function returnToRoute() {
  const distance = flight.distance;
  flight = nearestGuideFlight(flight.position);
  flight.distance = distance;
  snapCamera = true;
  nextHud = 0;
}

function startFlight(useGuide, restart = false) {
  if (!renderer) return;
  if (restart) {
    flight = newFlight();
    snapCamera = true;
    noseCamera = false;
  }
  if (useGuide && !guided && !restart) returnToRoute();
  guided = useGuide;
  lookYaw = lookPitch = 0;
  setStatus('flying');
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  cameraButton.setAttribute('aria-label', noseCamera ? 'Switch to chase view' : 'Switch to nose view');
}

function setRayLighting(enabled) {
  if (!rayPass) return;
  rayPass.raysEnabled=enabled;
  lightingButton.setAttribute('aria-pressed',String(enabled));
}

lightingButton.addEventListener('click',()=>setRayLighting(!rayPass?.raysEnabled));

function changeCamera() {
  if (status !== 'flying') return;
  noseCamera = !noseCamera;
  cameraButton.setAttribute('aria-label', noseCamera ? 'Switch to chase view' : 'Switch to nose view');
  lookYaw = lookPitch = 0;
  snapCamera = true;
}

tourButton.addEventListener('click', () => startFlight(true));
manualButton.addEventListener('click', () => startFlight(false));
districtButton.addEventListener('click', () => {
  if (!renderer) return;
  flight = nearestGuideFlight(spinePoint(0,coreEdge+145));
  guided = true;
  noseCamera = false;
  snapCamera = true;
  startFlight(true);
});
restartButton.addEventListener('click', () => startFlight(guided, true));
cameraButton.addEventListener('click', changeCamera);
pauseButton.addEventListener('click', () => setStatus('paused'));
recoverButton.addEventListener('click', returnToRoute);
modeButton.addEventListener('click', () => startFlight(!guided));

addEventListener('keydown', event => {
  if (event.altKey || event.metaKey || event.target instanceof HTMLButtonElement && event.code === 'Space') return;
  if (!event.repeat && event.code === 'Escape') {
    if (status === 'flying') setStatus('paused');
    else if (status === 'paused') startFlight(guided);
  }
  if (status !== 'flying') return;
  if (!event.repeat) {
    if (event.code === 'KeyC') changeCamera();
    if (event.code === 'KeyV') startFlight(!guided);
    if (event.code === 'KeyR' && !guided) returnToRoute();
  }
  if (keyMap.has(event.code)) {
    event.preventDefault();
    pressed.add(event.code);
  }
});
addEventListener('keyup', event => pressed.delete(event.code));
addEventListener('blur', clearInput);
document.addEventListener('visibilitychange', () => {
  last = 0;
  if (document.hidden && status === 'flying') setStatus('paused');
});

for (const button of touch.querySelectorAll('button')) {
  button.addEventListener('pointerdown', event => {
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    fingers.set(event.pointerId, button.dataset.input);
  });
  for (const action of ['lostpointercapture', 'pointerup', 'pointercancel']) {
    button.addEventListener(action, event => fingers.delete(event.pointerId));
  }
}

canvas.addEventListener('pointerdown', event => {
  if (status !== 'flying') return;
  lookTouch = { id: event.pointerId, x: event.clientX, y: event.clientY };
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove', event => {
  if (lookTouch?.id !== event.pointerId) return;
  lookYaw = THREE.MathUtils.clamp(lookYaw - (event.clientX - lookTouch.x) * .007, -2.4, 2.4);
  lookPitch = THREE.MathUtils.clamp(lookPitch + (event.clientY - lookTouch.y) * .004, -.39, .56);
  lookTouch.x = event.clientX;
  lookTouch.y = event.clientY;
});
canvas.addEventListener('lostpointercapture', () => { lookTouch = undefined; });

const radarPoint = new THREE.Vector3();
const causeway = { name: 'South Causeway', description: 'Outbound air lanes' };

const cartography = {
  downtown:'#3d4546', canal:'#354747', industry:'#484439', outskirts:'#354836',
};

function nearbyLandmark(position) {
  let next = null;
  let closest = Infinity;
  const direction=flight.spine?.direction ?? (Math.cos(flight.yaw)>0?-1:1);
  for (const { data } of city.nearbyLayouts()) for (const landmark of data.landmarks) {
    const x=landmark.x+data.x,z=landmark.z+data.z;
    const delta=(z-position.z)*direction;
    const side=Math.abs(x-position.x);
    const score=Math.hypot(delta,side);
    if (delta>=-28 && delta<420 && side<227 && score<closest) {
      closest=score;
      next={ x,z,name:landmark.landmark,code:landmark.sign };
    }
  }
  return next;
}

function drawLocalRadar(ctx, position, district) {
  const scale=.265;
  const xAt=x=>map.width/2+(x-position.x)*scale;
  const zAt=z=>map.height/2+(z-position.z)*scale;
  ctx.fillStyle='#142327';
  ctx.fillRect(0,0,map.width,map.height);
  const tiles=[];
  for (const {data} of city.nearbyLayouts()) {
    if (Math.abs(data.x-position.x)>map.width/2/scale+340 || Math.abs(data.z-position.z)>map.height/2/scale+340) continue;
    tiles.push(data);
  }

  const increment=tileSize/20;
  for (const tile of tiles) {
    const startX=tile.x-tileSize/2,startZ=tile.z-tileSize/2;
    ctx.fillStyle=cartography[tile.district.id];
    for (let row=0;row<20;row++) {
      const z=startZ+row*increment;
      let span=null;
      for (let column=0;column<=20;column++) {
        const x=startX+column*increment;
        const land=column<20 && groundAt(x+increment*.5,z+increment*.5)>-3;
        if (land && span===null) span=x;
        if (!land && span!==null) {
          ctx.fillRect(xAt(span),zAt(z),(x-span)*scale+.32,increment*scale+.29);
          span=null;
        }
      }
    }
    for (const block of tile.blocks) {
      if (!['grove','plaza','yard','tanks'].includes(block.use)) continue;
      ctx.fillStyle=block.use==='grove'?'#577256':block.use==='plaza'?'#728171':'#514b3b';
      ctx.beginPath();
      block.corners.forEach(([x,z],index)=>{
        const px=xAt(tile.x+x*.83+block.x*.17),pz=zAt(tile.z+z*.83+block.z*.17);
        if (index===0) ctx.moveTo(px,pz);
        else ctx.lineTo(px,pz);
      });
      ctx.closePath();
      ctx.fill();
    }
    for (const building of tile.buildings) {
      const w=building.w*scale,d=building.d*scale;
      ctx.save();
      ctx.translate(xAt(building.x+tile.x),zAt(building.z+tile.z));
      ctx.rotate(-(building.yaw ?? 0));
      ctx.fillStyle=building.landmark?'#b6a276':building.h>83?'#1e282b':'#283234';
      ctx.fillRect(-w/2,-d/2,w,d);
      ctx.restore();
    }
  }

  ctx.lineCap='round';
  for (const tile of tiles) for (const road of tile.roads) {
    ctx.strokeStyle=road.kind==='rail'?'#db9b67':road.bridge?'#bac5ba':road.kind==='avenue'?'#a2a594':'#777e74';
    ctx.lineWidth=road.kind==='avenue'?2.32:road.kind==='street'?.85:1.43;
    ctx.setLineDash(road.kind==='rail'?[4,3]:[]);
    ctx.beginPath();
    ctx.moveTo(xAt(tile.x+road.x),zAt(tile.z+road.z));
    ctx.lineTo(xAt(tile.x+road.toX),zAt(tile.z+road.toZ));
    ctx.stroke();
  }
  ctx.lineCap='butt';
  ctx.setLineDash([]);
  const track=guided && flight.spine?flight.spine.track:closestSpine(position.x,position.z);
  ctx.beginPath();
  for (let i=-540;i<=540;i+=18) {
    spinePoint(track,position.z+i,radarPoint);
    if (i===-540) ctx.moveTo(xAt(radarPoint.x),zAt(radarPoint.z));
    else ctx.lineTo(xAt(radarPoint.x),zAt(radarPoint.z));
  }
  ctx.strokeStyle='#122022';
  ctx.lineWidth=5;
  ctx.stroke();
  ctx.strokeStyle=district.color;
  ctx.lineWidth=2.3;
  ctx.stroke();

  for (const tile of tiles) for (const landmark of tile.landmarks) {
    const x=xAt(tile.x+landmark.x),z=zAt(tile.z+landmark.z);
    ctx.fillStyle='#f6cd80';
    ctx.save();
    ctx.translate(x,z);
    ctx.rotate(Math.PI/4);
    ctx.fillRect(-4,-4,8,8);
    ctx.restore();
    if (viewedLandmark?.code===landmark.sign) {
      ctx.font='bold 13px monospace';
      ctx.lineWidth=3;
      ctx.strokeStyle='#142327';
      ctx.strokeText(landmark.sign,x+10,z+4);
      ctx.fillText(landmark.sign,x+10,z+4);
    }
  }
  ctx.fillStyle='#c3cdbf';
  ctx.font='15px monospace';
  ctx.fillText('N',map.width-25,23);
  ctx.font='11px monospace';
  ctx.fillText('200 m',16,map.height-20);
  ctx.fillRect(16,map.height-15,200*scale,1);
}

function updateMap(localDistrict) {
  const ctx = mapContext;
  if (localDistrict) drawLocalRadar(ctx,flight.position,localDistrict);
  else ctx.drawImage(mapBase,0,0);
  ctx.save();
  ctx.translate(localDistrict ? map.width/2 : mapX(flight.position.x),localDistrict ? map.height/2 : mapY(flight.position.z));
  ctx.rotate(flight.yaw);
  ctx.beginPath();
  ctx.moveTo(0, -9); ctx.lineTo(5.7, 6); ctx.lineTo(0, 3.2); ctx.lineTo(-5.7, 6); ctx.closePath();
  ctx.fillStyle = '#fff7e9';
  ctx.fill();
  ctx.strokeStyle = '#171a2a';
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.restore();
}

function updateHud() {
  const { position } = flight;
  const col = tileAt(position.x), row = tileAt(position.z);
  const localDistrict = coreTile(col,row) ? null : districtForPosition(position.x,position.z);
  viewedLandmark = localDistrict ? nearbyLandmark(position) : null;
  landmarkText.hidden = !viewedLandmark;
  if (viewedLandmark && landmarkText.textContent!==viewedLandmark.name) landmarkText.textContent=viewedLandmark.name;
  let district = localDistrict;
  if (!district) {
    if (guided) district = flight.transfer === null ? districtAt(flight.station) : causeway;
    else {
      const station = nearestRoute(position);
      const point = route.getPointAt(station);
      district = Math.hypot(position.x-point.x,position.z-point.z) < 165 ? districtAt(station) : null;
    }
  }
  if (district !== displayedDistrict || !element('route-progress').dataset.drawn) {
    displayedDistrict = district;
    const name = district?.name ?? 'Off route';
    element('route-progress').dataset.drawn = 'true';
    element('route-progress').textContent = name;
    element('sector').textContent = name;
    element('sector-description').textContent = district?.description ?? 'Free flight';
    circuit.forEach((item, index) => {
      if (districts[index] === district) item.setAttribute('aria-current', 'location');
      else item.removeAttribute('aria-current');
    });
  }
  element('route-length').textContent = localDistrict ? 'Local radar' : 'Outbound tour';
  map.setAttribute('aria-label',localDistrict ? 'Local district flight radar' : 'Map of the Meridian City outbound route');
  element('speed').textContent = String(Math.round(flight.speed * 3.6)).padStart(3, '0');
  element('altitude').textContent = String(Math.round(flight.position.y)).padStart(3, '0');
  const warning = flight.warning > 0;
  if (warning !== displayedWarning) {
    element('warning').hidden = !warning;
    displayedWarning = warning;
  }
  updateMap(localDistrict);
}

function resize() {
  width = canvas.clientWidth || 1;
  height = canvas.clientHeight || 1;
  const pixelRatio = Math.min(devicePixelRatio, 1.42, Math.sqrt(1_900_000 / (width * height)));
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height, false);
  composer.setPixelRatio(pixelRatio);
  composer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function updateCamera(dt) {
  if (lookTouch === undefined && status === 'flying') {
    lookYaw = THREE.MathUtils.damp(lookYaw, 0, .9, dt);
    lookPitch = THREE.MathUtils.damp(lookPitch, 0, .9, dt);
  }
  const opening = status === 'ready';
  const heading = flight.yaw;
  const eyeHeight = noseCamera ? 2 : 8.1 + flight.speed * .036;
  const distance = noseCamera ? -6.6 : (opening ? 26 : 24) + flight.speed * .11;
  const panorama = opening ? .54 : 0;
  const landmarkBearing=viewedLandmark && guided && !noseCamera ? Math.atan2(
    viewedLandmark.x-flight.position.x, flight.position.z-viewedLandmark.z) : heading;
  const turn=Math.atan2(Math.sin(landmarkBearing-heading),Math.cos(landmarkBearing-heading));
  landmarkLook=THREE.MathUtils.damp(landmarkLook,THREE.MathUtils.clamp(turn,-1.05,1.05)*.18,3.7,dt);
  const orbit = heading + lookYaw + panorama;
  const orbitHeight = Math.max(1, eyeHeight + lookPitch * 28);
  desiredCamera.set(
    flight.position.x - origin.x - Math.sin(orbit) * distance,
    Math.max(7, flight.position.y + orbitHeight),
    flight.position.z - origin.z + Math.cos(orbit) * distance,
  );
  const ahead = noseCamera ? 53 : (opening ? 24 : 25) + flight.speed * .22;
  const lookDirection = noseCamera ? heading + lookYaw : heading + lookYaw * .22 + panorama + landmarkLook;
  desiredTarget.set(
    flight.position.x - origin.x + Math.sin(lookDirection) * ahead,
    flight.position.y + (noseCamera ? 2 + lookPitch * 28 : -2 + lookPitch * 6),
    flight.position.z - origin.z - Math.cos(lookDirection) * ahead,
  );

  if (snapCamera) {
    camera.position.copy(desiredCamera);
    target.copy(desiredTarget);
    snapCamera = false;
  } else {
    const smoothing = 1 - Math.exp(-dt * (noseCamera ? 15 : 7));
    camera.position.lerp(desiredCamera, smoothing);
    target.lerp(desiredTarget, smoothing);
  }
  const offsetX = opening && width > 960 ? -width * .025 : 0;
  const offsetY = opening && width <= 760 ? height * .13 : 0;
  if (camera.view?.offsetX !== offsetX || camera.view?.offsetY !== offsetY || camera.view?.width !== width || camera.view?.height !== height) {
    camera.setViewOffset(width, height, offsetX, offsetY, width, height);
  }
  camera.lookAt(target);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = last === 0 ? 0 : Math.min(.05, (now - last) / 1000);
  last = now;
  if (!(reduceMotion.matches && status !== 'flying')) time += dt;
  if (status === 'flying') {
    inputs.clear();
    for (const code of pressed) inputs.add(keyMap.get(code));
    for (const input of fingers.values()) inputs.add(input);
    accumulator += dt;
    while (accumulator >= pace) {
      advanceFlight(flight, inputs, guided, pace, city.buildings);
      accumulator -= pace;
    }
  }
  const cellX = tileAt(flight.position.x)*tileSize, cellZ = tileAt(flight.position.z)*tileSize;
  camera.position.x += origin.x-cellX;
  camera.position.z += origin.z-cellZ;
  target.x += origin.x-cellX;
  target.z += origin.z-cellZ;
  origin.set(cellX,0,cellZ);
  city.update(time,flight.position,origin,reduceMotion.matches);

  if (now >= nextHud) {
    nextHud = now + 90;
    updateHud();
  }
  craft.group.visible = !noseCamera;
  craft.update(flight, time, !guided && inputs.has('boost') && inputs.has('throttle'));
  craft.group.position.sub(origin);
  updateCamera(dt);
  city.afterCamera(now,dt,flight.position,camera,origin,height*renderer.getPixelRatio());
  updateRain(time, reduceMotion.matches);
  rayPass.clock.value = time;
  composer.render();
}

function boot() {
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.17;
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2('#44515b', .00054);
    camera = new THREE.PerspectiveCamera(61, 1, .25, 7400);
    const fill = new THREE.HemisphereLight('#a8c2d6', '#574941', 1.17);
    const rim = new THREE.DirectionalLight('#e8b99c', 1.14);
    rim.position.set(-3, 5, -6);
    const front = new THREE.DirectionalLight('#80b6c6', .67);
    front.position.set(4, 2.4, 7);
    scene.add(fill, rim, front);
    const hdr=renderer.extensions.has('EXT_color_buffer_float');
    if (hdr) installSkyProbe(renderer,scene);
    city = createCity(scene);
    drawMapBase(city.buildings);
    craft = createCraft(scene);
    const coarse = matchMedia('(pointer: coarse)').matches;
    updateRain = createRain(scene,camera,coarse,city.lights);

    const target=new THREE.WebGLRenderTarget(1,1,{type:hdr?THREE.HalfFloatType:THREE.UnsignedByteType});
    target.depthTexture=new THREE.DepthTexture(1,1,THREE.UnsignedIntType);
    composer = new EffectComposer(renderer,target);
    const render = new RenderPass(scene, camera);
    const bloom = new UnrealBloomPass(new THREE.Vector2(), .51, .52, .98);
    composer.addPass(render);
    rayPass=new RayLightingPass(scene,camera,()=>city.lights,hdr,origin);
    composer.addPass(rayPass);
    if (hdr) {
      lightingButton.hidden=false;
      setRayLighting(!coarse);
      composer.addPass(bloom);
    }
    composer.addPass(new OutputPass());
    addEventListener('resize', resize);
    resize();
    setStatus('ready');
    requestAnimationFrame(frame);
  } catch (error) {
    console.error(error);
    renderer = null;
    game.dataset.mode = 'unsupported';
    const notice = element('unsupported');
    notice.textContent = 'The 3D view requires WebGL 2. Try a browser with hardware acceleration enabled.';
    notice.hidden = false;
    tourButton.disabled = manualButton.disabled = districtButton.disabled = true;
    element('state').textContent = '3D view unavailable';
  }
}

boot();
