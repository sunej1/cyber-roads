import * as THREE from 'three';
import billboardAtlasUrl from './assets/billboards.jpg';
import { generateBuildings, park, plaza, randomFor, shore } from './flight.js';
import { airCircuits, streetRuns, streets as streetGrid } from './traffic.js';
import { addMovingTraffic } from './street-life.js';
import { coreTile, tileAt, tileSize } from './extent.js';
import { blockSize, generateTile, localTraffic } from './world.js';

const { BoxGeometry, Color, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial } = THREE;
const box = new BoxGeometry();
const neon = (color, intensity = 2) => new MeshBasicMaterial({ color: new Color(color).multiplyScalar(intensity) });

function texture(width, height, paint) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  paint(canvas.getContext('2d'));
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  return map;
}

const glassPalettes = [
  ['#343b3d', '#515650', ['#ffd99b', '#d9b88d', '#92a6a4'], 12, 7, .23],
  ['#182a32', '#35505a', ['#aceaee', '#6fa6b9', '#d0e2d7'], 8, 11, .37],
  ['#292125', '#654143', ['#ff9192', '#f4ba8c', '#e0b6a4'], 6, 9, .32],
  ['#2d2a25', '#4c4a3c', ['#f8b468', '#b89b60', '#ddd0a3'], 6, 6, .32],
  ['#292d32', '#6a6560', ['#ffd37d', '#e4ddd0', '#91afb3'], 14, 10, .26],
  ['#222e31', '#415048', ['#b7cb7a', '#b2dbaa', '#e3e9b1'], 5, 10, .36],
];
const facadeMaterials = [];
const towerTime = { value: 0 };

function facadeMaterial(style) {
  if (facadeMaterials[style]) return facadeMaterials[style];
  const random = randomFor(900 + style);
  const [base, frame, lights, cols, rows, activity] = glassPalettes[style];
  const map = texture(512, 512, ctx => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 512, 512);
    const w = 512 / cols, h = 512 / rows;
    for (let row = 0; row < rows; row++) {
      const y = row * h;
      const band = style === 4 || style === 0 ? .26 : row % 4 === 2 ? .17 : .09;
      ctx.fillStyle = frame;
      ctx.fillRect(0, y, 512, h * band);
      ctx.fillStyle = '#060a10a0';
      ctx.fillRect(0, y + h * .94, 512, h * .06);
      for (let col = 0; col < cols; col++) {
        const x = col * w;
        const active = random() < activity;
        const light = lights[Math.floor(random() * lights.length)];
        ctx.fillStyle = frame;
        ctx.fillRect(x + 1, y + h * band, style === 3 ? w * .17 : Math.max(1.7, w * .045), h * (1 - band));
        const inset = style === 0 ? .24 : style === 1 || style === 5 ? .06 : .14;
        const top = y + h * (band + .075), panel = h * (style === 1 ? .78 : .66) - h * band;
        const pane = ctx.createLinearGradient(x, top, x + w * .15, top + panel);
        pane.addColorStop(0, active ? light : frame);
        pane.addColorStop(active ? .64 : .36, active ? light : base);
        pane.addColorStop(1, active ? base : '#0e151b');
        ctx.fillStyle = pane;
        ctx.fillRect(x + w * inset, top, w * (1 - 2 * inset), panel);
        if (!active || random() < .48) {
          ctx.fillStyle = active ? '#171c26a8' : '#141719a0';
          ctx.fillRect(x + w * .54, top + 1, Math.max(1, w * .04), panel);
        }
        if (active && random() < .48) {
          ctx.fillStyle = '#3e3b27af';
          for (let line = 0; line < 4; line++) ctx.fillRect(x + w * inset, top + line * panel / 5, w * (1 - 2 * inset), .8);
        }
      }
    }
    ctx.fillStyle = '#ced4ce12';
    for (let i = 0; i < 1800; i++) ctx.fillRect(random() * 512, random() * 512, random() * 9, 1);
  });
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  const material = new MeshBasicMaterial({ map });
  facadeMaterials[style] = material;
  return material;
}

function batch(parent, geometry, material, items) {
  if (!items.length) return;
  const mesh = new THREE.InstancedMesh(geometry, material, items.length);
  const dummy = new THREE.Object3D();
  items.forEach(([x, y, z, w, h, d, rotation = 0, color], index) => {
    dummy.position.set(x, y, z);
    dummy.rotation.y = rotation;
    dummy.scale.set(w, h, d);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
    if (color) mesh.setColorAt(index, new Color(color));
  });
  mesh.computeBoundingSphere();
  parent.add(mesh);
  return mesh;
}

function shapeMesh(points, y, material) {
  const shape = new THREE.Shape();
  points.forEach(([x, z], index) => {
    if (index === 0) shape.moveTo(x, -z);
    else shape.lineTo(x, -z);
  });
  const mesh = new Mesh(new THREE.ShapeGeometry(shape), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y;
  return mesh;
}

function sky(parent) {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: `
      varying vec3 direction;
      void main() {
        direction = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      varying vec3 direction;
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),
                   mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
      }
      void main() {
        vec3 d = normalize(direction);
        vec3 sun = normalize(vec3(-0.52, -0.11, -1.0));
        vec3 moon = normalize(vec3(0.14, 0.25, -1.0));
        float h = max(0.0, d.y);
        float sunset = pow(max(0.0,dot(d,sun)), 12.0) * exp(-h*7.0);
        vec3 horizon = mix(vec3(.075,.085,.092), vec3(.235,.123,.062), sunset);
        vec3 col = mix(horizon, vec3(.009,.020,.028), 1.0-exp(-h*5.0));
        vec2 uv = vec2(d.x*5.6 + d.z*3.9, h*21.0 + d.z*3.7);
        float cloud = noise(uv) * .49 + noise(uv*2.46) * .30 + noise(uv*6.8) * .15 + noise(uv*16.1) * .06;
        float veil = smoothstep(.29,.75,cloud) * smoothstep(.007,.16,h);
        col = mix(col, vec3(.012,.022,.027) + sunset*vec3(.09,.046,.020), veil*.88);
        col += vec3(.032,.022,.015) * exp(-h*14.0) * noise(uv * vec2(.88,4.9));
        float m = length(d-moon);
        col += vec3(.22,.27,.30) * exp(-m*18.0) * .31;
        col += vec3(.68,.73,.69) * (1.0-smoothstep(.009,.0106,m)) * (1.0-veil*.76);
        gl_FragColor=vec4(col,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const dome = new Mesh(new THREE.SphereGeometry(4400, 32, 20), material);
  dome.renderOrder = -1;
  parent.add(dome);
  return dome;
}

function water(parent) {
  const material = new THREE.ShaderMaterial({
    uniforms: { time: towerTime, worldOffset: { value: new THREE.Vector2() } },
    vertexShader: `
      varying vec3 worldPos;
      void main() {
        vec4 p = modelMatrix * vec4(position, 1.0);
        worldPos = p.xyz;
        gl_Position = projectionMatrix * viewMatrix * p;
      }`,
    fragmentShader: `
      uniform float time;
      uniform vec2 worldOffset;
      varying vec3 worldPos;
      void main() {
        vec2 p = worldPos.xz + worldOffset;
        vec3 ray = normalize(worldPos - cameraPosition);
        float horizon = pow(1.0-abs(ray.y),7.0);
        float waves = sin(p.y*.123+p.x*.028+time*.85) * sin(p.y*.081-p.x*.019-time*.67);
        float chop = sin(p.y*.31+p.x*.14+sin(p.x*.055+time*.3)*1.7+time)
          * sin(p.y*.23-p.x*.085+sin(p.y*.16)*1.4-time*.77);
        float ripples = max(0.0, waves*.66+chop*.34);
        float glow = pow(max(0.0,dot(normalize(vec2(-.5,-1.0)),normalize(ray.xz))), 22.0);
        vec3 color = vec3(.009,.016,.019) + vec3(.038,.045,.043)*horizon;
        color += (vec3(.013,.024,.026) + vec3(.16,.102,.047)*glow*horizon) * ripples;
        float distanceToLand = min(abs(p.y-925.0),abs(p.x-730.0));
        float harbor = exp(-distanceToLand*.006) * exp(-dot(p/1550.0,p/1550.0));
        float ribbons = pow(max(0.0,sin(p.x*.08+p.y*.007+chop*.8)*sin(p.x*.15-waves*.8)), 3.0);
        color += mix(vec3(.22,.095,.034),vec3(.043,.11,.12),.5+.5*sin(p.x*.018)) * harbor * ribbons * (.35+ripples);
        gl_FragColor = vec4(color,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new Mesh(new THREE.PlaneGeometry(9200, 9200), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -3;
  parent.add(mesh);
  return mesh;
}

function profile(x, z, w, d, bevel) {
  const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2;
  if (!bevel) return [[x0,z1],[x1,z1],[x1,z0],[x0,z0]];
  const dx = w * bevel, dz = d * bevel;
  return [[x0+dx,z1],[x1-dx,z1],[x1,z1-dz],[x1,z0+dz],[x1-dx,z0],[x0+dx,z0],[x0,z0+dz],[x0,z1-dz]];
}

const roof = new MeshStandardMaterial({ color: '#3c4140', roughness: .77, metalness: .23, side: THREE.DoubleSide });
function addFacades(scene, slices) {
  const roofs = [];
  glassPalettes.forEach((_, style) => {
    const vertices = [], uv = [];
    for (const { x, z, w, d, base, h, topW, topD, topX, topZ, bevel, windowOffset } of slices[style]) {
      const lower = profile(x, z, w, d, bevel);
      const upper = profile(topX, topZ, topW, topD, bevel);
      const low = base, top = base + h;
      const v = h / (style === 4 ? 37 : 29), v0 = windowOffset * 3.3;
      for (let i = 0; i < lower.length; i++) {
        const j = (i + 1) % lower.length;
        const [ax, az] = lower[i], [bx, bz] = lower[j], [cx, cz] = upper[j], [dx, dz] = upper[i];
        const u = Math.hypot(bx - ax, bz - az) / (style === 1 ? 29 : 38);
        const u0 = windowOffset + i * .29;
        vertices.push(ax,low,az, bx,low,bz, dx,top,dz, bx,low,bz, cx,top,cz, dx,top,dz);
        uv.push(u0,v0, u0+u,v0, u0,v0+v, u0+u,v0, u0+u,v0+v, u0,v0+v);
        roofs.push(topX,top,topZ, dx,top,dz, cx,top,cz);
      }
    }
    if (!vertices.length) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    scene.add(new Mesh(geometry, facadeMaterial(style)));
  });
  if (!roofs.length) return;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(roofs, 3));
  geometry.computeVertexNormals();
  scene.add(new Mesh(geometry, roof));
}

const billboardAtlas = new Image();
billboardAtlas.src = billboardAtlasUrl;

function billboard(building, index, width, height) {
  const subjects = [
    { title: 'NOCTURNE', copy: 'AFTER DARK', color: '#ff7c6d' },
    { title: 'KAIROS', copy: 'DOMESTIC SYSTEMS', color: '#a3e5e1' },
    { title: 'VERDANT', copy: 'GROW ANYWHERE', color: '#dcf474' },
    { title: 'NOVA', copy: 'OPEN THE SKY', color: '#ffc07d' },
  ];
  const match = subjects.findIndex(({ title }) => title === building.sign);
  const art = match < 0 ? (index * 3) % subjects.length : match;
  const subject = subjects[art];
  const paint = ctx => {
    ctx.fillStyle = '#141c20';
    ctx.fillRect(0, 0, 512, 512);
    if (billboardAtlas.complete && billboardAtlas.naturalWidth) {
      const w = billboardAtlas.naturalWidth / 2, h = billboardAtlas.naturalHeight / 2;
      ctx.drawImage(billboardAtlas, art % 2 * w + 2, Math.floor(art / 2) * h + 2, w - 4, h - 4, 0, 0, 512, 512);
    }
    const fade = ctx.createLinearGradient(0, 0, 410, 0);
    fade.addColorStop(0, '#101416ef');
    fade.addColorStop(1, '#14171900');
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, 512, 512);
    ctx.fillStyle = subject.color;
    ctx.fillRect(23, 38, 91, 5);
    ctx.font = 'bold 19px monospace';
    ctx.fillText('MERIDIAN / DISTRICT MEDIA', 23, 73);
    ctx.fillStyle = '#fff7e1';
    ctx.font = '900 71px sans-serif';
    ctx.fillText(building.sign, 21, 322, 385);
    ctx.fillStyle = subject.color;
    ctx.font = 'bold 29px monospace';
    ctx.fillText(subject.copy, 24, 363, 363);
    ctx.fillRect(0, 507, 512, 5);
    ctx.fillStyle = '#10131921';
    for (let y = 0; y < 512; y += 4) ctx.fillRect(0, y, 512, 1);
  };
  const map = texture(512, 512, paint);
  if (!billboardAtlas.complete) billboardAtlas.addEventListener('load', () => {
    paint(map.image.getContext('2d'));
    map.needsUpdate = true;
  }, { once: true });
  const material = new MeshBasicMaterial({ map, color: new Color(1.5, 1.5, 1.5) });
  material.onBeforeCompile = shader => {
    shader.uniforms.towerTime = towerTime;
    shader.fragmentShader = 'uniform float towerTime;\n' + shader.fragmentShader.replace('#include <map_fragment>',
      '#include <map_fragment>\nfloat scan = 1.0 + .16 * smoothstep(.91, .99, sin(vMapUv.y * 13.0 - towerTime * .65));\ndiffuseColor.rgb *= scan;');
  };
  return new Mesh(new THREE.PlaneGeometry(width, height), material);
}

let lightDisc;
function glowSprite(color, x, y, z, size, opacity) {
  lightDisc ??= texture(64, 64, ctx => {
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255,255,255,.78)');
    gradient.addColorStop(.32, 'rgba(255,255,255,.31)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
  });
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: lightDisc, color, opacity, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  sprite.position.set(x, y, z);
  sprite.scale.set(size, size, 1);
  return sprite;
}

const trim = new MeshStandardMaterial({ color: '#484847', roughness: .81, metalness: .26 });
const structural = new MeshStandardMaterial({ color: '#313838', roughness: .91 });
const lightColors = ['#ffc479', '#62d8ed', '#ff785c', '#e4b154', '#fff1a4', '#add27e'];
const towerNeon = lightColors.map(color => neon(color, 2));
const beacon = neon('#ff5f37', 2.6);

function towers(scene, buildings, signs = true) {
  const slices = glassPalettes.map(() => []);
  const caps = [], ribs = [], ledges = [], beacons = [];
  const lights = lightColors.map(() => []);
  const random = randomFor(13082);
  buildings.forEach((b, index) => {
    const lit = lights[b.style];
    const levels = [];
    const segment = (from, to, w, d, options = {}) => {
      const { topW = w, topD = d, lean = 0, shift = 0, bevel = 0 } = options;
      const x = b.x + shift * b.w, z = b.z;
      const form = { x, z, w: w * b.w, d: d * b.d, base: from * b.h, h: (to - from) * b.h,
        topW: topW * b.w, topD: topD * b.d, topX: x + lean * b.w, topZ: z,
        bevel, windowOffset: random() };
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
    if (b.h > 95 || index % 5 === 1) {
      const mast = b.sign ? 13 + random() * 15 : 4 + random() * 12;
      const x = top.topX + top.topW * .13;
      caps.push([x, b.h + mast / 2, b.z, .71, mast, .71]);
      beacons.push([x, b.h + mast, b.z, 1.2, .78, 1.2]);
    }
    caps.push([top.topX, b.h + 1.1, top.topZ, top.topW * .32, 2.2, top.topD * .25]);
    if (b.h < 52) {
      const z = b.z + b.d / 2 + .7;
      ledges.push([b.x,4.3,z,b.w*.86,.72,3.1]);
      lit.push([b.x,4.31,z+1.54,b.w*.75,.28,.23]);
      caps.push([b.x-b.w*.24,b.h+1.26,b.z+b.d*.11,b.w*.20,2.5,b.d*.23]);
    }
    if (b.sign && signs) {
      const lower = levels.find(form => form.base <= b.h * .62 && form.base + form.h >= b.h * .62);
      const signD = lower ? Math.max(lower.d,lower.topD) : top.d;
      const height = Math.min(56,b.w*.85), width = Math.min(60,b.w*.78);
      const sign = billboard(b,index,width,height);
      sign.position.set(b.x,b.h*.62,b.z+signD/2+1.7);
      scene.add(sign);
      if (index % 2 === 0) scene.add(glowSprite(lightColors[b.style], b.x+width*.27, b.h*.54, sign.position.z+2.8, 24, .16));
    }
  });
  batch(scene, box, trim, caps);
  batch(scene, box, structural, ribs.concat(ledges));
  lights.forEach((items, style) => batch(scene, box, towerNeon[style], items));
  batch(scene, box, beacon, beacons);
  addFacades(scene, slices);
}

const stone = new MeshStandardMaterial({ color: '#323a3b', roughness: .75 });
const asphalt = new MeshStandardMaterial({ color: '#20282a', roughness: .43, metalness: .22 });
const publicGreen = new MeshStandardMaterial({ color: '#415044', roughness: .9 });
const paintedLines = new MeshBasicMaterial({ color: '#afa17c' });
const warmLamp = neon('#ffcc87', 2.4);
const coldLamp = neon('#9ddbe2', 1.65);
const hazardLamp = neon('#ff6b41', 2.4);
const pavementGlow = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: `
    varying vec2 vUv;
    varying vec3 glowColor;
    void main() {
      vUv = uv;
      glowColor = instanceColor;
      gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: `
    varying vec2 vUv;
    varying vec3 glowColor;
    void main() {
      vec2 p = vUv * 2.0 - 1.0;
      float light = pow(max(0.0, 1.0-dot(p,p)), 2.65);
      float ripple = .79 + .21*sin(vUv.y*165.0 + sin(vUv.x*37.0)*1.7);
      gl_FragColor = vec4(glowColor, light*ripple*.145);
    }`,
});
const pavingPlane = new THREE.PlaneGeometry().rotateX(-Math.PI / 2);
const line = (array, x, y, z, toX, toZ, width, height = .18) => {
  const dx = toX - x, dz = toZ - z;
  array.push([(x + toX) / 2, y, (z + toZ) / 2, width, height, Math.hypot(dx, dz), Math.atan2(dx, dz)]);
};

function ground(scene, buildings) {
  scene.add(shapeMesh(shore, 0, stone));
  const cliff = new MeshBasicMaterial({ color: '#1d2433' });
  const platforms = [
    [[-493, 936], [-325, 937], [-329, 1065], [-469, 1065]],
    [[-93, 902], [36, 905], [48, 1106], [-87, 1106]],
    [[187, 868], [300, 872], [326, 1047], [211, 1060]],
    [[440, 719], [530, 694], [615, 854], [537, 889]],
  ];
  platforms.forEach(points => scene.add(shapeMesh(points, .4, cliff)));
  const curbs = [], streets = [], paint = [], poles = [], lamps = [], grass = [], stems = [], leaves = [], pools = [];
  const signs = [], fountains = [], buoys = [], awnings = [], spill = [], signals = [], posts = [];
  const random = randomFor(13652);
  const lightsAlong = (x, z, toX, toZ, spacing, height, target = lamps) => {
    const count = Math.floor(Math.hypot(toX - x, toZ - z) / spacing);
    for (let i = 0; i < count; i++) {
      const u = (i + .5) / count, px = THREE.MathUtils.lerp(x, toX, u), pz = THREE.MathUtils.lerp(z, toZ, u);
      if (height > 5 && [park, plaza].some(space =>
        Math.abs(px - space.x) < space.w / 2 && Math.abs(pz - space.z) < space.d / 2)) continue;
      poles.push([px, height / 2, pz, .35, height, .35]);
      target.push([px, height, pz, 1.25, .38, 1.25]);
    }
  };

  for (const { horizontal, center, width, start, end } of streetGrid) {
    const coordinates = (across, offset = 0) => horizontal ? [across, center + offset] : [center + offset, across];
    const roadBetween = (target, height, from, to, w, offset, thickness) => {
      const [x,z] = coordinates(from,offset);
      line(target,x,height,z,...coordinates(to,offset),w,thickness);
    };
    roadBetween(streets,.11,start,end,width,0);
    for (const side of [-1, 1]) {
      roadBetween(curbs,.21,start,end,2.9,side*(width/2+1.6));
      roadBetween(paint,.23,start,end,.18,side*(width/2-.53),.08);
    }
    lightsAlong(...coordinates(start,width/2+2.4),...coordinates(end,width/2+2.4),35,5.8);
    for (let across = start + 17; across < end - 10; across += 22) roadBetween(paint,.23,across,across+8,.28,0,.065);
    for (let across = start + 19; across < end - 20; across += 35) {
      const [x,z] = coordinates(across, width*.13);
      if ([park,plaza].some(space => Math.abs(x-space.x) < space.w/2 && Math.abs(z-space.z) < space.d/2)) continue;
      spill.push([x,.26,z,11+random()*6,1,16+random()*9,horizontal ? Math.PI/2:0,
        random() < .24 ? '#80bad0' : '#e6a762']);
    }
    if (!horizontal) continue;
    for (let col = -6; col <= 4; col++) {
      const crossing = col * 136 + 68;
      if (crossing < start + 18 || crossing > end - 18) continue;
      if ([park,plaza].some(space => Math.abs(crossing-space.x) < space.w/2+9 && Math.abs(center-space.z) < space.d/2+9)) continue;
      for (const side of [-1, 1]) {
        for (let stripe = -11; stripe <= 11; stripe += 2.6) {
          paint.push([crossing + stripe*.55,.24,center+side*9.7,1.0,.08,3.3]);
          paint.push([crossing + side*10.4,.24,center+stripe*.5,3.5,.08,.94]);
        }
        const x = crossing + side*10.8, z = center - side*10.2;
        posts.push([x,3.0,z,.34,6.0,.34],[x,5.9,z,.89,.35,5.2]);
        signals.push([x,.74+5.8,z-2.3,.54,.57,.27]);
      }
    }
  }

  for (const { x, z, w, d } of [park, plaza]) {
    curbs.push([x, .48, z, w, .82, d]);
    for (const side of [-1, 1]) {
      lightsAlong(x - w / 2 + 4, z + side * (d / 2 - 3), x + w / 2 - 4, z + side * (d / 2 - 3), 13, 2.2, signs);
    }
  }
  grass.push([park.x, .98, park.z, park.w - 13, .27, park.d - 13]);
  for (const [x, z, w, d] of [[-66, 75, 28, 105], [64, 131, 40, 76], [4, 175, 172, 13]]) {
    pools.push([x, 1.16, z, w, .15, d]);
    for (const side of [-1, 1]) signs.push([x + side * w / 2, 1.4, z, .29, .33, d]);
  }
  for (const [x, z, toX, toZ] of [[-95, 146, 108, 49], [-90, 31, 90, 154], [-94, 103, 104, 103]]) {
    line(curbs, x, 1.2, z, toX, toZ, 3.8);
    lightsAlong(x, z, toX, toZ, 16, 3.1, signs);
  }
  for (const side of [-1, 1]) {
    for (let i = -3; i <= 3; i++) {
      const x = plaza.x + i * 15;
      const z = plaza.z + side * 45;
      curbs.push([x, 1.15, z, 11, .54, 2.2]);
      signs.push([x, 1.48, z, 9, .07, .15]);
    }
    for (let i = -3; i <= 3; i++) {
      const z = plaza.z + i * 12;
      const x = plaza.x + side * 37;
      paint.push([x, .96, z, 7, .045, .38]);
    }
  }
  for (let i = 0; i < 11; i++) {
    const x = -294 + i * 24;
    const z = 916 - Math.cos(i * .43) * 11;
    curbs.push([x, .85, z, 18, 1.5, 11]);
    for (const offset of [-7, 7]) poles.push([x + offset, 2.2, z, .4, 3.5, .43]);
    awnings.push([x, 4.2, z, 17, .68, 10, 0, i % 3 ? '#604365' : '#416278']);
    if (i % 3) lamps.push([x, 4.31, z + 5.1, 16.8, .16, .16]);
    else signs.push([x, 4.31, z + 5.1, 16.8, .16, .16]);
  }
  line(streets, -320, .1, 925, 19, 925, 9);
  lightsAlong(-315, 930, 22, 930, 18, 4.2);
  const pond = new Mesh(new THREE.CylinderGeometry(22, 22, .46, 36), neon('#3484a9', .9));
  pond.position.set(plaza.x, 1.24, plaza.z);
  scene.add(pond);
  for (let i = 0; i < 28; i++) {
    const t = i / 28 * Math.PI * 2;
    const x = plaza.x + 18 * Math.sin(t), z = plaza.z + 18 * Math.cos(t);
    const h = 2.5 + Math.sin(t * 4) ** 2 * 5;
    fountains.push([x, 1.6 + h / 2, z, .21, h, .21]);
    lamps.push([plaza.x + 23 * Math.sin(t), 1.4, plaza.z + 23 * Math.cos(t), 1.1, .3, 1.1]);
  }

  const tree = (x, z, large = false) => {
    const h = large ? 5 + random() * 11 : 3 + random() * 5;
    const green = ['#31746f', '#417461', '#286758', '#42878a', '#50916d'][Math.floor(random() * 5)];
    stems.push([x, h * .35 + .5, z, .55, h * .72, .55]);
    leaves.push([x, h * .82 + .7, z, h * .39, h * .48, h * .39, random() * 5, green]);
    leaves.push([x + .9, h * .59 + .8, z - .6, h * .28, h * .31, h * .34, random() * 5, green]);
    if (large && random() < .34) signs.push([x, 1.5, z, 1.1, .33, 1.1]);
  };
  for (let i = 0; i < 124; i++) {
    const x = park.x + (random() - .5) * (park.w - 23), z = park.z + (random() - .5) * (park.d - 20);
    if (Math.abs(z - 103) > 6 && Math.abs(z - (146 - (x + 95) * .48)) > 7 && Math.abs(z - (31 + (x + 90) * .68)) > 7
      && Math.abs(x + 66) > 17 && Math.abs(x - 64) > 22 && z < 167) tree(x, z, true);
  }
  for (const side of [-1, 1]) {
    for (let i = 0; i < 7; i++) tree(plaza.x + side * 50, plaza.z - 51 + i * 17);
  }

  for (const b of buildings) {
    curbs.push([b.x,.48,b.z,b.w+11,.68,b.d+11]);
    const z = b.z+b.d/2+1.7;
    if (random() < .89) {
      const lamp = b.style === 2 ? signals : b.style === 1 || b.style === 5 ? signs : lamps;
      lamp.push([b.x,3.7,z,Math.min(b.w*.65,7+random()*18),.86,.29]);
      spill.push([b.x,.86,z+3.7,Math.min(b.w,29),1,12,0,lightColors[b.style]]);
      for (const side of [-1,1]) {
        const x = b.x+side*b.w*.28;
        poles.push([x,1.68,z+.75,.32,2.7,.33]);
        lamp.push([x,2.92,z+1.05,.51,.66,.44]);
      }
    }
    if (b.h > 65 && random() < .55) {
      for (let i = -2; i <= 2; i++) {
        const x = b.x + i*b.w*.14;
        awnings.push([x,3.55,z+1.3,b.w*.126,.57,3.65,0,i%2 ? '#70504b' : '#4f5b5e']);
        lamps.push([x,2.9,z+2.8,b.w*.10,.18,.27]);
      }
    }
  }
  for (const offset of [-8, 8]) {
    line(curbs,-147+offset,5.1,971,-69+offset,1647,2.1,2.2);
    lightsAlong(-147+offset,980,-69+offset,1645,26,7.3);
  }
  line(streets,-147,4,965,-69,1650,25,1.75);
  for (const [x,z,toX,toZ] of [[-359,620,-87,601],[-352,393,-99,396],[-75,-224,160,-210]]) {
    line(curbs,x,13,z,toX,toZ,10.8,2.75);
    line(awnings,x,18.5,z,toX,toZ,10.5,1.2);
    const tx=toX-x,tz=toZ-z,norm=Math.hypot(tx,tz),dx=-tz/norm*4.9,dz=tx/norm*4.9;
    for (const side of [-1,1]) {
      line(lamps,x+side*dx,16.45,z+side*dz,toX+side*dx,toZ+side*dz,.38,.32);
      for (let t=.08;t<.98;t+=.075) {
        poles.push([x+tx*t+side*dx,16,z+tz*t+side*dz,.48,5.0,.48]);
      }
    }
    for (const t of [.18,.47,.78]) posts.push([x+tx*t,6,z+tz*t,1.7,12.1,2.0]);
  }
  for (let i=0;i<13;i++) {
    const t=i/13;
    curbs.push([-147+t*78,.32,982+t*660,4.4,9.0,5.1]);
  }

  shore.forEach(([x, z], index) => {
    const [toX, toZ] = shore[(index + 1) % shore.length];
    line(curbs, x, -.6, z, toX, toZ, 2.3, 4.2);
    lightsAlong(x, z, toX, toZ, 24, 2.6, signs);
  });
  for (let i = 0; i < 21; i++) {
    const x = -805 + i * 83, z = 1110 + Math.cos(i * .38) * 52;
    buoys.push([x, -1.3, z, 1, 3.4, 1]);
    if (i % 3 === 0) signs.push([x, 1.5, z, 1.1, .7, 1.1]);
    else lamps.push([x, 1.5, z, 1.15, .7, 1.15]);
  }

  batch(scene, box, asphalt, streets);
  batch(scene, box, stone, curbs);
  batch(scene, box, paintedLines, paint);
  batch(scene, box, structural, poles.concat(stems, buoys, posts));
  batch(scene, box, warmLamp, lamps);
  batch(scene, box, coldLamp, signs);
  batch(scene, box, hazardLamp, signals);
  batch(scene, pavingPlane, pavementGlow, spill);
  batch(scene, box, neon('#9bdbfa', 2.1), fountains);
  batch(scene, box, new MeshBasicMaterial({ color: '#174543' }), grass);
  batch(scene, box, new MeshBasicMaterial({ color: '#276583' }), pools);
  batch(scene, box, new MeshStandardMaterial({ roughness: .62 }), awnings);
  batch(scene, new THREE.IcosahedronGeometry(1, 1), new MeshStandardMaterial({ roughness: 1, emissive: '#0a2824', emissiveIntensity: .65 }), leaves);
}

function mountains(scene) {
  const random = randomFor(411);
  const material = new MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  for (let band = 0; band < 3; band++) {
    const vertices = [], colors = [];
    const tone = new Color(['#394445', '#353e41', '#2e3739'][band]);
    const back = -2200 - (2 - band) * 550;
    const peaks = Array.from({ length: 29 }, (_, i) => {
      const x = (i - 14) * 230;
      const y = (42 + random() * 170 + 27 * (band + 1)) * Math.min(1, Math.abs(x + 500) / 750 + .25);
      return [x, y, back - random() * 290];
    });
    const add = (point, light) => {
      vertices.push(...point);
      colors.push(tone.r * light, tone.g * light, tone.b * light);
    };
    for (let i = 0; i < peaks.length - 1; i++) {
      const a = peaks[i], b = peaks[i + 1], base = [(a[0] + b[0]) / 2, -30, back + 370];
      add(a, .82); add(b, 1.15); add(base, .66);
      add(a, .82); add([a[0] - 125, -30, back + 340], .68); add(base, .66);
      add(b, 1.15); add(base, .66); add([b[0] + 125, -30, back + 340], .69);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    scene.add(new Mesh(geometry, material));
  }
}

const footpaths = [
  [-286, 308, -286, 400, 8], [-153, 310, -153, 406, 8],
  [-271, 409, -168, 409, 9], [-269, 302, -170, 302, 7],
  [-98, 103, 107, 103, 14], [-93, 145, 108, 48, 9],
  [-293, 924, 15, 924, 17], [-219, 722, -219, 805, 8],
];

const distantTowers = new MeshStandardMaterial({ roughness: .87 });
distantTowers.onBeforeCompile = shader => {
  shader.vertexShader = 'varying vec3 towerPosition; varying vec3 towerNormal;\n' + shader.vertexShader.replace('#include <begin_vertex>',
    '#include <begin_vertex>\ntowerPosition = (instanceMatrix * vec4(position,1.0)).xyz; towerNormal = normal;');
  shader.fragmentShader = 'varying vec3 towerPosition; varying vec3 towerNormal;\n' + shader.fragmentShader.replace(
    '#include <emissivemap_fragment>', `#include <emissivemap_fragment>
    float side = step(.5,abs(towerNormal.x));
    vec2 facade = vec2(mix(towerPosition.x,towerPosition.z,side)*.19,towerPosition.y*.23);
    vec2 pane = fract(facade);
    float room = fract(sin(dot(floor(facade) + floor(towerPosition.xz*.033),vec2(127.1,311.7)))*43758.54);
    vec2 aa = min(vec2(.19),fwidth(facade)*.5);
    float shape = smoothstep(.19-aa.x,.19+aa.x,pane.x)*(1.0-smoothstep(.78-aa.x,.78+aa.x,pane.x))
      * smoothstep(.22-aa.y,.22+aa.y,pane.y)*(1.0-smoothstep(.68-aa.y,.68+aa.y,pane.y));
    totalEmissiveRadiance += shape * step(.66,room)*(1.0-step(.5,abs(towerNormal.y)))
      * mix(vec3(.40,.21,.065),vec3(.12,.30,.34),step(.855,room));
    `);
};
const tilesRadius = 3;

function drawTile(tile, detail) {
  const group = new Group();
  const paved = [], roads = [], marks = [], lights = [], pools = [], curbs = [], lawns = [], docks = [];
  for (const {x,z,publicSpace} of tile.blocks) {
    paved.push([x,-1.25,z,blockSize-9,2.5,blockSize-9]);
    if (publicSpace === 'garden') {
      for (const dx of [-25,25]) for (const dz of [-25,25]) lawns.push([x+dx,.2,z+dz,42,.4,39]);
      if (detail) {
        for (const offset of [-50,50]) {
          line(marks,x+offset,.215,z-49,x+offset,z+49,.38,.08);
          line(marks,x-49,.215,z+offset,x+49,z+offset,.38,.08);
        }
        for (const offset of [-38,-15,15,38]) {
          lights.push([x+offset,1.35,z+7,.43,.44,.43],[x-7,1.35,z+offset,.43,.44,.43]);
          pools.push([x+offset,.5,z+7,7,1,8,0,'#9dda98'],[x-7,.5,z+offset,8,1,7,0,'#a6d3bb']);
        }
      }
    }
    if (publicSpace === 'yard') {
      for (let slot=0;slot<9;slot++) {
        const dx = (slot%3-1)*24, dz = (Math.floor(slot/3)-1)*23;
        docks.push([x+dx,1.65,z+dz,10.5,3.2,19,0,slot%3===0?'#6b5242':'#526364']);
        if (slot%4===0) docks.push([x+dx,4.9,z+dz,10.5,3.1,19,0,'#766540']);
      }
      if (detail) {
        for (const side of [-1,1]) {
          curbs.push([x+side*41,7.1,z-27,1.6,14.2,1.6]);
          lights.push([x+side*41,14.4,z-27,1.8,.56,.89]);
          pools.push([x+side*28,.12,z-27,23,1,35,0,'#cf9856']);
        }
        curbs.push([x,14,z-27,83,1.65,1.82]);
      }
    }
  }
  for (let i = 0; i < 5; i++) {
    const at = -tileSize/2 + i * blockSize;
    line(roads,at,.12,-tileSize/2,at,tileSize/2,17,.24);
    line(roads,-tileSize/2,.125,at,tileSize/2,at,17,.25);
    if (detail) {
      for (const offset of [-9.5,9.5]) {
        line(curbs,at+offset,.31,-tileSize/2,at+offset,tileSize/2,1.8,.42);
        line(curbs,-tileSize/2,.32,at+offset,tileSize/2,at+offset,1.8,.42);
      }
      for (let along = -tileSize/2+18; along < tileSize/2-12; along += 19) {
        marks.push([at,.27,along,.24,.1,7],[along,.27,at,7,.1,.24]);
        if (Math.round(along/19)%2===0) {
          lights.push([at+7.4,4.7,along,.88,.33,.76],[along,4.7,at-7.4,.86,.34,.81]);
          curbs.push([at+7.4,2.35,along,.28,4.68,.28],[along,2.35,at-7.4,.28,4.68,.28]);
          pools.push([at-1,.29,along,15,1,19,0,tile.district.color],[along,.29,at+1,18,1,14,0,'#dea164']);
        }
      }
    }
  }
  batch(group,box,stone,paved);
  batch(group,box,publicGreen,lawns);
  batch(group,box,distantTowers,docks);
  batch(group,box,asphalt,roads);
  let move = null;
  if (detail) {
    batch(group,box,trim,curbs);
    batch(group,box,paintedLines,marks);
    batch(group,box,warmLamp,lights);
    batch(group,pavingPlane,pavementGlow,pools);
    towers(group,tile.buildings,false);
    const { circuits, roads } = localTraffic(tile);
    const people = [[-173,-184,202,-184,7],[65,-183,65,193,6],[-200,189,192,189,6]];
    move = addMovingTraffic(group,circuits,roads,people,tile.seed);
  } else {
    const fragments = tile.buildings.map(b => [b.x,b.h/2,b.z,b.w,b.h,b.d,0,glassPalettes[b.style][0]]);
    batch(group,box,distantTowers,fragments);
  }
  return { group, move };
}

function disposeTile(tile) {
  tile.group.removeFromParent();
  tile.group.traverse(object => {
    if (object.isInstancedMesh) object.dispose();
    else if (object.isMesh) object.geometry.dispose();
  });
}

function streamTiles(scene) {
  const loaded = new Map();
  let currentCol, currentRow;
  let pending = [];
  let colliders = [];
  return {
    update(time, position, origin) {
      const col = tileAt(position.x), row = tileAt(position.z);
      let dirty = col !== currentCol || row !== currentRow;
      if (dirty) {
        currentCol = col;
        currentRow = row;
        const wanted = new Map();
        for (let dz = -tilesRadius; dz <= tilesRadius; dz++) for (let dx = -tilesRadius; dx <= tilesRadius; dx++) {
          if (coreTile(col+dx,row+dz)) continue;
          const near = Math.max(Math.abs(dx),Math.abs(dz)) <= 1;
          wanted.set(`${col+dx}/${row+dz}`,{ col: col+dx, row: row+dz, near, priority: dx*dx+dz*dz });
        }
        for (const [key,tile] of loaded) if (!wanted.has(key)) {
          disposeTile(tile);
          loaded.delete(key);
        }
        pending = [...wanted].filter(([key,job]) => loaded.get(key)?.near !== job.near)
          .sort((a,b) => a[1].priority-b[1].priority);
      }
      const budget = pending[0]?.[1].priority === 0 ? 3 : 1;
      for (let i = 0; i < budget && pending.length; i++) {
        const [key,job] = pending.shift();
        const old = loaded.get(key);
        if (old) disposeTile(old);
        const data = old?.data ?? generateTile(job.col,job.row);
        const visuals = drawTile(data,job.near);
        scene.add(visuals.group);
        loaded.set(key,{ ...visuals, data, near:job.near });
        dirty = true;
      }
      if (dirty) {
        colliders = [];
        for (const {data,near} of loaded.values()) if (near) {
          for (const building of data.buildings) colliders.push({ ...building, x: building.x+data.x, z: building.z+data.z });
        }
      }
      for (const {group,data,move} of loaded.values()) {
        group.position.set(data.x-origin.x,0,data.z-origin.z);
        if (move) move(time);
      }
      return colliders;
    },
  };
}

export function createCity(scene) {
  const city = new Group();
  scene.add(city);
  const dome = sky(scene);
  const ocean = water(scene);
  const coreBuildings = generateBuildings();
  const streamer = streamTiles(scene);
  mountains(city);
  ground(city, coreBuildings);
  towers(city, coreBuildings);
  const updateTraffic = addMovingTraffic(city, airCircuits(coreBuildings), streetRuns(coreBuildings), footpaths, 18725);
  let lastColliders, showCore;
  return {
    buildings: coreBuildings,
    update(time, position, origin) {
      towerTime.value = time;
      const x = position.x - origin.x, z = position.z - origin.z;
      dome.position.set(x, position.y, z);
      ocean.position.set(x, -3, z);
      ocean.material.uniforms.worldOffset.value.set(origin.x % 40960, origin.z % 40960);
      city.position.set(-origin.x,0,-origin.z);
      city.visible = Math.max(Math.abs(position.x), Math.abs(position.z)) < 5100;
      if (city.visible) updateTraffic(time);
      const colliders = streamer.update(time,position,origin);
      const nearby = Math.max(Math.abs(position.x), Math.abs(position.z)) < 1480;
      if (colliders !== lastColliders || nearby !== showCore) {
        this.buildings = nearby ? coreBuildings.concat(colliders) : colliders;
        lastColliders = colliders;
        showCore = nearby;
      }
    },
  };
}
