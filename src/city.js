import * as THREE from 'three';
import { generateBuildings, intersectsBuilding, park, plaza, randomFor, shore } from './flight.js';

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
  ['#141a2c', '#26283a', ['#ffe0a0', '#cb9870', '#7298b0', '#ebe1c5']],
  ['#121d2d', '#26364c', ['#83e7ee', '#5d9dc3', '#e1f1e9', '#e5bd8a']],
  ['#21172b', '#38283e', ['#fd83ba', '#bc6197', '#b88bc9', '#ffd69d']],
  ['#201c28', '#322c3b', ['#f1c484', '#cc8e69', '#a7b6a7', '#d6c5f2']],
];

function facadeTexture(style) {
  const random = randomFor(900 + style);
  const [base, frame, lights] = glassPalettes[style];
  const map = texture(256, 256, ctx => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 256, 256);
    for (let row = 0; row < 8; row++) {
      const y = row * 32;
      ctx.fillStyle = frame;
      ctx.fillRect(0, y, 256, 3);
      ctx.fillStyle = '#111322';
      ctx.fillRect(0, y + 27, 256, 4);
      for (let col = 0; col < 8; col++) {
        const x = col * 32;
        ctx.fillStyle = frame;
        ctx.fillRect(x + 2, y + 5, 2, 21);
        const pane = ctx.createLinearGradient(x + 6, y + 6, x + 6, y + 26);
        if (random() < 0.33) {
          pane.addColorStop(0, lights[Math.floor(random() * lights.length)]);
          pane.addColorStop(1, base);
        } else {
          pane.addColorStop(0, frame);
          pane.addColorStop(1, '#101424');
        }
        ctx.fillStyle = pane;
        ctx.fillRect(x + 6, y + 6, 21, 19);
        ctx.fillStyle = '#110e1a8a';
        ctx.fillRect(x + 15, y + 6, 1, 19);
      }
    }
  });
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  return map;
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
        vec3 sun = normalize(vec3(-0.5, -0.015, -1.0));
        vec3 moon = normalize(vec3(0.14, 0.25, -1.0));
        float h = max(0.0, d.y);
        float sunset = pow(max(0.0,dot(d,sun)), 12.0) * exp(-h*7.0);
        vec3 horizon = mix(vec3(.14,.071,.155), vec3(.64,.173,.104), sunset);
        vec3 col = mix(horizon, vec3(.012,.016,.050), 1.0-exp(-h*5.5));
        vec2 uv = vec2(atan(d.x, -d.z),h) * vec2(6,19);
        float cloud = noise(uv) * .62 + noise(uv*2.46) * .27 + noise(uv*6.8) * .11;
        float veil = smoothstep(.45,.76,cloud) * smoothstep(.009,.15,h) * exp(-h*1.5);
        col = mix(col, vec3(.027,.025,.070) + sunset*vec3(.33,.082,.076), veil*.84);
        float ribbons = noise(uv * vec2(.64,2.6) + vec2(8.1,1.9));
        col += vec3(.14,.029,.048) * sunset * smoothstep(.46,.67,ribbons) * smoothstep(.015,.076,h);
        float skyline = pow(max(0.0,dot(d, normalize(vec3(.28,-.01,-1.0)))),18.0);
        col += vec3(.06,.026,.116) * skyline * exp(-h*9.0);
        vec2 stars = vec2(atan(d.x,-d.z), h) * 320.0;
        float speck = step(.993, hash(floor(stars))) * (1.0-smoothstep(.015,.095,length(fract(stars)-.5)));
        col += speck * smoothstep(.12,.45,h) * (1.0-veil) * .42;
        float m = length(d-moon);
        col += vec3(.29,.38,.65) * exp(-m*31.0) * .34;
        col += vec3(1.0,.80,.72) * (1.0-smoothstep(.015,.0167,m)) * (.85+.15*noise(d.xy*460.0));
        gl_FragColor=vec4(col,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const dome = new Mesh(new THREE.SphereGeometry(4400, 32, 20), material);
  dome.renderOrder = -1;
  parent.add(dome);
}

function water(parent) {
  const material = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } },
    vertexShader: `
      varying vec3 worldPos;
      void main() {
        vec4 p = modelMatrix * vec4(position, 1.0);
        worldPos = p.xyz;
        gl_Position = projectionMatrix * viewMatrix * p;
      }`,
    fragmentShader: `
      uniform float time;
      varying vec3 worldPos;
      void main() {
        vec2 p = worldPos.xz;
        vec3 ray = normalize(worldPos - cameraPosition);
        float horizon = pow(1.0-abs(ray.y),7.0);
        float waves = sin(p.y*.123+p.x*.028+time*.85) * sin(p.y*.081-p.x*.019-time*.67);
        float chop = sin(p.y*.31+p.x*.14+sin(p.x*.055+time*.3)*1.7+time)
          * sin(p.y*.23-p.x*.085+sin(p.y*.16)*1.4-time*.77);
        float ripples = max(0.0, waves*.66+chop*.34);
        float glow = pow(max(0.0,dot(normalize(vec2(-.5,-1.0)),normalize(ray.xz))), 22.0);
        vec3 color = vec3(.014,.025,.048) + vec3(.056,.032,.070)*horizon;
        color += (vec3(.016,.027,.040) + vec3(.29,.096,.067)*glow*horizon) * ripples;
        float distanceToLand = min(abs(p.y-925.0),abs(p.x-730.0));
        float harbor = exp(-distanceToLand*.006) * exp(-dot(p/1550.0,p/1550.0));
        float ribbons = pow(max(0.0,sin(p.x*.08+p.y*.007+chop*.8)*sin(p.x*.15-waves*.8)), 3.0);
        color += mix(vec3(.09,.029,.15),vec3(.027,.15,.18),.5+.5*sin(p.x*.018)) * harbor * ribbons * (.35+ripples);
        gl_FragColor = vec4(color,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new Mesh(new THREE.PlaneGeometry(9200, 9200), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -3;
  parent.add(mesh);
  return material.uniforms.time;
}

function addFacades(scene, slices) {
  glassPalettes.forEach((_, style) => {
    const vertices = [], uv = [];
    const face = (a, b, c, d, u, v) => {
      vertices.push(...a, ...b, ...d, ...b, ...c, ...d);
      uv.push(0, 0, u, 0, 0, v, u, 0, u, v, 0, v);
    };
    for (const { x, z, w, d, base, h } of slices[style]) {
      const left = x - w / 2 - 0.09, right = x + w / 2 + 0.09;
      const front = z + d / 2 + 0.09, back = z - d / 2 - 0.09;
      const low = base + 1.4, top = base + h - 1.25;
      const u = w / 34, s = d / 34, v = (top - low) / 29;
      face([left,low,front], [right,low,front], [right,top,front], [left,top,front], u, v);
      face([right,low,back], [left,low,back], [left,top,back], [right,top,back], u, v);
      face([right,low,front], [right,low,back], [right,top,back], [right,top,front], s, v);
      face([left,low,back], [left,low,front], [left,top,front], [left,top,back], s, v);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    scene.add(new Mesh(geometry, new MeshBasicMaterial({ map: facadeTexture(style) })));
  });
}

function billboard(building, index) {
  const pink = index % 3 === 0;
  const accent = pink ? '#ff67b6' : '#6ff8ed';
  const map = texture(512, 256, ctx => {
    ctx.fillStyle = pink ? '#26132e' : '#0b2430';
    ctx.fillRect(0, 0, 512, 256);
    const gradient = ctx.createLinearGradient(0, 260, 500, 0);
    gradient.addColorStop(0, pink ? '#65184f' : '#125058');
    gradient.addColorStop(.6, '#101a32');
    ctx.fillStyle = gradient;
    ctx.fillRect(12, 12, 488, 232);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3;
    ctx.strokeRect(13, 13, 486, 230);
    ctx.globalAlpha = 0.32;
    for (let i = 0; i < 9; i++) {
      ctx.beginPath();
      ctx.moveTo(300 + i * 20, 12);
      ctx.lineTo(500, 190 - i * 20);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = accent;
    ctx.font = 'bold 26px monospace';
    ctx.fillText(index % 2 ? '◈   AERIAL TRANSIT' : '◈   MERIDIAN CITY', 32, 58);
    ctx.fillStyle = '#fff1ed';
    ctx.font = 'italic 900 81px sans-serif';
    ctx.fillText(building.sign, 29, 153, 452);
    ctx.fillStyle = accent;
    ctx.fillRect(31, 186, 117, 5);
    ctx.font = '22px monospace';
    ctx.fillText(index % 2 ? 'SKY DECK OPEN' : 'NIGHT SERVICE', 32, 222);
  });
  const material = new MeshBasicMaterial({ map, color: new Color(1.35, 1.35, 1.35) });
  const board = new Mesh(new THREE.PlaneGeometry(building.w * .81, building.w * .41), material);
  board.position.set(building.x, building.h * .62, building.z + building.d / 2 + 1.3);
  return board;
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

function towers(scene, buildings) {
  const slices = glassPalettes.map(() => []);
  const shells = [], caps = [], ribs = [], ledges = [], warm = [], teal = [], pink = [], beacons = [];
  const random = randomFor(13082);
  buildings.forEach((b, index) => {
    const segment = (w, d, base, h) => {
      shells.push([b.x, base + h / 2, b.z, w, h, d]);
      slices[b.style].push({ x: b.x, z: b.z, w, d, base, h });
      caps.push([b.x, base + h - .4, b.z, w + 1.5, 1.4, d + 1.5]);
    };
    if (b.type === 0) segment(b.w, b.d, 0, b.h);
    else {
      const base = b.h * (b.type === 3 ? .24 : .37);
      const width = [0, .87, .65, .88][b.type], depth = [0, .87, .86, .76][b.type];
      segment(b.w, b.d, 0, base);
      if (b.type === 2) {
        segment(b.w * .82, b.d * .91, base, b.h * .39);
        segment(b.w * width, b.d * depth, base + b.h * .39, b.h - base - b.h * .39);
      } else segment(b.w * width, b.d * depth, base, b.h - base);
    }
    const top = slices[b.style].at(-1);
    const xLeft = b.x - top.w / 2, xRight = b.x + top.w / 2;
    const zFront = b.z + top.d / 2 + .25, zBack = b.z - top.d / 2 - .25;
    const lit = b.style === 2 ? pink : b.style === 1 ? teal : warm;
    for (const x of [xLeft, xRight]) {
      for (const z of [zFront, zBack]) {
        ribs.push([x, top.base + top.h / 2, z, 1.2, top.h, 1.3]);
        if (b.sign || random() < .13) {
          const stripe = top.h * (.63 + random() * .29);
          lit.push([x, b.h - 4 - stripe / 2, z, .46, stripe, .53]);
        }
      }
    }
    if (b.sign) {
      for (const side of [-1, 1]) {
        const bladeX = b.x + side * top.w * .49;
        const shoulder = b.h * (b.type === 3 ? .64 : .82);
        const extension = b.h * (b.type === 2 ? .11 : .045);
        ledges.push([bladeX, (b.h + shoulder + extension) / 2, b.z, 2.1, b.h + extension - shoulder, top.d * .92]);
        lit.push([bladeX, b.h + extension - .4, b.z, .72, .59, top.d * .91]);
        beacons.push([bladeX, b.h + extension, zFront - 4, 1, .7, 1]);
      }
      for (const floor of [.48, .74, .86]) {
        ledges.push([b.x, b.h * floor, b.z, top.w + 1.8, 2.4, top.d + 2.4]);
        lit.push([b.x, b.h * floor + 1.28, zFront + 1.07, top.w * .94, .38, .33]);
        for (const side of [-1, 1]) lit.push([b.x + side * (top.w / 2 + .96), b.h * floor + 1.24, b.z, .33, .35, top.d * .92]);
      }
      caps.push([b.x, b.h + 3.2, b.z, top.w * .73, 6.5, top.d * .55]);
      const glow = lit === teal ? '#77fff0' : lit === pink ? '#ff539b' : '#ffc68c';
      for (const side of [-1, 1]) for (const floor of [.74, .98]) {
        scene.add(glowSprite(glow, b.x + side * top.w * .46, b.h * floor, zFront + 2.1, 13, .18));
      }
    } else if (b.h > 85) {
      for (let y = 18 + random() * 15; y < top.h - 5; y += 24 + random() * 19) {
        ledges.push([b.x, top.base + y, b.z, top.w + .8, .81, top.d + .8]);
      }
    }
    if (b.sign || random() < .24) {
      lit.push([b.x, b.h - .3, zFront + .5, top.w, .32, .4]);
      lit.push([b.x, b.h - .3, zBack - .5, top.w, .32, .4]);
    }
    if (b.h > 126 || random() < .25) {
      const mast = b.sign ? 11 + random() * 21 : 4 + random() * 11;
      caps.push([b.x + top.w * .19, b.h + mast / 2, b.z, .7, mast, .7]);
      beacons.push([b.x + top.w * .19, b.h + mast, b.z, 1.1, .76, 1.1]);
    }
    caps.push([b.x, b.h + 1.2, b.z + top.d * .14, top.w * .30, 2.5, top.d * .24]);
    if (b.sign) {
      const sign = billboard(b, index);
      sign.position.z = zFront + .8;
      scene.add(sign);
    }
  });
  batch(scene, box, new MeshStandardMaterial({ color: '#252536', roughness: .93 }), shells);
  batch(scene, box, new MeshStandardMaterial({ color: '#34313f', roughness: .9 }), caps);
  batch(scene, box, new MeshBasicMaterial({ color: '#403a52' }), ribs);
  batch(scene, box, neon('#ffc589', 1.75), warm);
  batch(scene, box, neon('#57f6f0', 2.7), teal);
  batch(scene, box, neon('#ff5aa4', 2.8), pink);
  batch(scene, box, neon('#ff5069', 3), beacons);
  batch(scene, box, new MeshStandardMaterial({ color: '#363444', roughness: .82, metalness: .31 }), ledges);
  addFacades(scene, slices);
}

function ground(scene, buildings) {
  const stone = new MeshStandardMaterial({ color: '#2c3040', roughness: .85 });
  const road = new MeshStandardMaterial({ color: '#181d2a', roughness: .78 });
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
  const signs = [], fountains = [], buoys = [], awnings = [];
  const random = randomFor(13652);
  const line = (array, x, y, z, toX, toZ, width, height = .18) => {
    const dx = toX - x, dz = toZ - z;
    array.push([(x + toX) / 2, y, (z + toZ) / 2, width, height, Math.hypot(dx, dz), Math.atan2(dx, dz)]);
  };
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

  for (let col = -6; col <= 5; col++) {
    const x = col * 136 + 68;
    const north = x > 540 ? 160 : -800 + Math.max(0, -x - 490) * .6;
    const south = x > 430 ? 620 : x < -540 ? 730 : 888;
    line(streets, x, .11, north, x, south, 16);
    line(curbs, x + 9, .22, north, x + 9, south, 1.8);
    lightsAlong(x - 9, north, x - 9, south, 37, 6);
    for (let z = north + 16; z < south - 10; z += 22) line(paint, x, .25, z, x, z + 9, .28);
  }
  for (let row = -6; row <= 6; row++) {
    const z = row * 125 + 62.5;
    const west = (Math.abs(z) > 660 ? -668 : -925), east = z > 650 ? 391 : z > 150 ? 641 : 553;
    line(streets, west, .12, z, east, z, 13);
    lightsAlong(west, z + 8.2, east, z + 8.2, 48, 5.8);
    for (let x = west + 14; x < east - 10; x += 22) line(paint, x, .25, z, x + 9, z, .26);
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
    curbs.push([b.x, .42, b.z, b.w + 14, .55, b.d + 14]);
    if (random() < .73) {
      signs.push([b.x, 3.3, b.z + b.d / 2 + 1, 7 + random() * 11, 1.1, .2]);
      for (let i = -1; i <= 1; i++) lamps.push([b.x + i * 4, 1.2, b.z + b.d / 2 + 3, .23, 2.1, .23]);
    }
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

  batch(scene, box, road, streets);
  batch(scene, box, stone, curbs);
  batch(scene, box, new MeshBasicMaterial({ color: '#786b70' }), paint);
  batch(scene, box, new MeshStandardMaterial({ color: '#292b35' }), poles.concat(stems, buoys));
  batch(scene, box, neon('#ffd9a2', 2.3), lamps);
  batch(scene, box, neon('#65eddb', 1.8), signs);
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
    const tone = new Color(['#414052', '#383749', '#2a293c'][band]);
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

function traffic(scene, buildings) {
  const random = randomFor(18725);
  const lanes = [
    { horizontal: true, lane: 679, height: 73, start: -1010, end: 1050 },
    { horizontal: true, lane: 312.5, height: 94, start: -1000, end: 1010 },
    { horizontal: true, lane: 814, height: 60, start: -520, end: 860 },
    { horizontal: true, lane: 955, height: 46, start: -740, end: 775 },
    { horizontal: false, lane: 855, height: 88, start: -990, end: 1180 },
    { horizontal: false, lane: 970, height: 115, start: -1050, end: 1120 },
    { horizontal: false, lane: -218, height: 72, start: 150, end: 850 },
  ].filter(lane => {
    for (let across = lane.start; across < lane.end; across += 9) {
      const position = { x: lane.horizontal ? across : lane.lane, y: lane.height, z: lane.horizontal ? lane.lane : across };
      if (buildings.some(b => intersectsBuilding(position, b, 10))) return false;
    }
    return true;
  });
  const movers = lanes.flatMap((lane, i) => Array.from({ length: i < 3 ? 5 : 3 }, (_, index) => ({
    ...lane, phase: (index + random() * .35) / (i < 3 ? 5 : 3),
    speed: (23 + random() * 19) / (lane.end - lane.start), direction: i % 2 ? 1 : -1,
  })));
  const dark = new MeshStandardMaterial({ color: '#858398', metalness: .4, roughness: .45 });
  const parts = [
    { mesh: new THREE.InstancedMesh(box, dark, movers.length), w: 2.7, h: .85, d: 6.3, offset: 0, y: 0 },
    { mesh: new THREE.InstancedMesh(box, neon('#cbf8ff', 3), movers.length), w: 1.95, h: .23, d: .29, offset: 3.25, y: -.1 },
    { mesh: new THREE.InstancedMesh(box, neon('#ff426e', 3), movers.length), w: 1.95, h: .23, d: .29, offset: -3.25, y: -.1 },
  ];
  const dummy = new THREE.Object3D();
  for (const { mesh } of parts) {
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    scene.add(mesh);
  }
  return time => {
    for (const { mesh, w, h, d, offset, y } of parts) {
      movers.forEach(({ horizontal, lane, height, start, end, phase, speed, direction }, index) => {
        const progress = (time * speed + phase) % 1;
        const across = THREE.MathUtils.lerp(start, end, direction === 1 ? progress : 1 - progress) + offset * direction;
        dummy.position.set(horizontal ? across : lane, height + y, horizontal ? lane : across);
        dummy.rotation.y = horizontal ? -direction * Math.PI / 2 : direction === 1 ? Math.PI : 0;
        dummy.scale.set(w, h, d);
        dummy.updateMatrix();
        mesh.setMatrixAt(index, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
  };
}

export function createCity(scene) {
  const city = new Group();
  scene.add(city);
  const buildings = generateBuildings();
  sky(city);
  const waterTime = water(city);
  mountains(city);
  ground(city, buildings);
  towers(city, buildings);
  const updateTraffic = traffic(city, buildings);
  return {
    buildings,
    update(time) {
      waterTime.value = time;
      updateTraffic(time);
    },
  };
}
