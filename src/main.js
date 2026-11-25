import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createCity } from './city.js';
import { createCraft } from './craft.js';
import { advanceFlight, departure, districtAt, districts, harborExit, nearestGuideFlight, nearestRoute, newFlight, park, plaza, route, routeSamples, shore } from './flight.js';
import { closestSpine, coreTile, districtFor, spinePoint, tileAt, tileSize } from './extent.js';
import { blockSize } from './world.js';
import './style.css';

const element = id => document.getElementById(id);
const game = element('game');
const canvas = element('view');
const menu = element('menu');
const hud = document.querySelector('.hud');
const touch = element('touch');
const tourButton = element('tour');
const manualButton = element('manual');
const cameraButton = element('camera');
const pauseButton = element('pause');
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

function drawMapBase() {
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
  ctx.strokeStyle = '#415367';
  for (let x = -884; x <= 750; x += 136) {
    ctx.beginPath(); ctx.moveTo(mapX(x), 12); ctx.lineTo(mapX(x), 215); ctx.stroke();
  }
  for (let z = -812; z <= 880; z += 125) {
    ctx.beginPath(); ctx.moveTo(130, mapY(z)); ctx.lineTo(320, mapY(z)); ctx.stroke();
  }
  ctx.fillStyle = '#46736f';
  for (const { x, z, w, d } of [park, plaza]) ctx.fillRect(mapX(x - w / 2), mapY(z - d / 2), w * mapScale, d * mapScale);
  ctx.restore();
  ctx.beginPath();
  const openingRoute = routeSamples.slice(0,Math.floor(harborExit*routeSamples.length)+1).concat(departure.getSpacedPoints(35));
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
drawMapBase();

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
let renderer, scene, camera, composer, city, craft;
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
  touch.hidden = !flying || guided;
  tourButton.firstElementChild.textContent = paused && guided ? 'Resume guided flight' : 'Start guided flight';
  manualButton.firstElementChild.textContent = paused && !guided ? 'Resume manual flight' : 'Fly manually';
  element('launch-title').innerHTML = paused ? 'FLIGHT<span> PAUSED</span>' : 'AFTER<span>HOUR</span>';
  element('menu-copy').textContent = paused ? 'Resume from your current position or restart at the harbor.' : 'Fly through Meridian City, then follow the air lanes into new districts.';
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

function changeCamera() {
  if (status !== 'flying') return;
  noseCamera = !noseCamera;
  cameraButton.setAttribute('aria-label', noseCamera ? 'Switch to chase view' : 'Switch to nose view');
  lookYaw = lookPitch = 0;
  snapCamera = true;
}

tourButton.addEventListener('click', () => startFlight(true));
manualButton.addEventListener('click', () => startFlight(false));
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

function drawLocalRadar(ctx, position, district) {
  const scale = .27;
  const xAt = x => map.width / 2 + (x-position.x)*scale;
  const zAt = z => map.height / 2 + (z-position.z)*scale;
  ctx.fillStyle = '#192729';
  ctx.fillRect(0,0,map.width,map.height);
  const col = tileAt(position.x), row = tileAt(position.z);
  for (let r = row-2; r <= row+2; r++) for (let c = col-2; c <= col+2; c++) {
    if (coreTile(c,r)) continue;
    const x = c*tileSize-tileSize/2, z = r*tileSize-tileSize/2;
    const style = districtFor(c,r).style;
    ctx.fillStyle = style === 5 ? '#293f43' : style === 3 ? '#37362a' : '#30413e';
    ctx.fillRect(xAt(x)+1,zAt(z)+1,tileSize*scale-2,tileSize*scale-2);
    ctx.strokeStyle = '#8c9f8a55';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const at = i*blockSize;
      ctx.moveTo(xAt(x+at),zAt(z)); ctx.lineTo(xAt(x+at),zAt(z+tileSize));
      ctx.moveTo(xAt(x),zAt(z+at)); ctx.lineTo(xAt(x+tileSize),zAt(z+at));
    }
    ctx.stroke();
  }
  const track = guided && flight.spine ? flight.spine.track : closestSpine(position.x, position.z);
  ctx.strokeStyle = district.color;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  for (let i=-520; i<=520; i+=26) {
    spinePoint(track,position.z+i,radarPoint);
    if (i===-520) ctx.moveTo(xAt(radarPoint.x),zAt(radarPoint.z));
    else ctx.lineTo(xAt(radarPoint.x),zAt(radarPoint.z));
  }
  ctx.stroke();
  ctx.fillStyle = '#c3cdbf';
  ctx.font = '15px monospace';
  ctx.fillText('N',map.width-25,23);
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
  const localDistrict = coreTile(col,row) ? null : districtFor(col,row);
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
  const centerHeading = Math.atan2(-flight.position.x, flight.position.z);
  const centerAngle = THREE.MathUtils.euclideanModulo(centerHeading - heading, Math.PI * 2);
  const offshore = guided && !noseCamera && flight.transfer === null && !flight.spine
    ? THREE.MathUtils.smoothstep(flight.station, .326, .445) * (1 - THREE.MathUtils.smoothstep(flight.station, .875, harborExit))
    : 0;
  const panorama = opening ? .62 : offshore * centerAngle;
  const orbit = heading + lookYaw + panorama;
  const orbitHeight = Math.max(1, eyeHeight + lookPitch * 28);
  desiredCamera.set(
    flight.position.x - origin.x - Math.sin(orbit) * distance,
    Math.max(7, flight.position.y + orbitHeight),
    flight.position.z - origin.z + Math.cos(orbit) * distance,
  );
  const ahead = noseCamera ? 53 : (opening ? 24 : 25) + flight.speed * .22;
  const lookDirection = noseCamera ? heading + lookYaw : heading + lookYaw * .22 + panorama;
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
  city.update(time,flight.position,origin);

  if (now >= nextHud) {
    nextHud = now + 90;
    updateHud();
  }
  craft.group.visible = !noseCamera;
  craft.update(flight, time, !guided && inputs.has('boost') && inputs.has('throttle'));
  craft.group.position.sub(origin);
  updateCamera(dt);
  composer.render();
}

function boot() {
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.17;
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2('#525b55', .00059);
    camera = new THREE.PerspectiveCamera(61, 1, .25, 7400);
    const fill = new THREE.HemisphereLight('#b3ced1', '#544637', 1.48);
    const rim = new THREE.DirectionalLight('#efc89f', 1.69);
    rim.position.set(-3, 5, -6);
    const front = new THREE.DirectionalLight('#8bbebd', .74);
    front.position.set(4, 2.4, 7);
    scene.add(fill, rim, front);
    city = createCity(scene);
    craft = createCraft(scene);

    composer = new EffectComposer(renderer);
    const render = new RenderPass(scene, camera);
    const bloom = new UnrealBloomPass(new THREE.Vector2(), .56, .52, .84);
    composer.addPass(render);
    composer.addPass(bloom);
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
    tourButton.disabled = manualButton.disabled = true;
    element('state').textContent = '3D view unavailable';
  }
}

boot();
