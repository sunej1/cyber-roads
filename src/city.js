import * as THREE from 'three';
import { box, batch, beam, line, neon } from './scene-parts.js';
import { towers, facadeColors, structural, trim } from './architecture.js';
import { setScreenTime } from './ads.js';
import { generateBuildings, park, plaza, randomFor, shore } from './flight.js';
import { airCircuits, streetRuns, streets as streetGrid } from './traffic.js';
import { addMovingTraffic } from './street-life.js';
import { coreTile, districtForPosition, groundAt, riverAt, streetVertex, tileAt, tileSize } from './extent.js';
import { generateTile, localTraffic } from './world.js';
import { asphalt } from './surface-materials.js';
import { detailHierarchy } from './detail-selection.js';
import { streetDetails } from './streetscape.js';
import { streetFixtures, streetLighting } from './street-lighting.js';

const { Color, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial }=THREE;
const lightColors=['#ffc479','#62d8ed','#ff785c','#e4b154','#fff1a4','#add27e'];
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
    uniforms: { time: { value: 0 }, worldOffset: { value: new THREE.Vector2() } },
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

const stone = new MeshStandardMaterial({ color: '#323a3b', roughness: .75 });
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
      gl_FragColor = vec4(glowColor, light*ripple*.11);
    }`,
});
const pavingPlane = new THREE.PlaneGeometry().rotateX(-Math.PI / 2);

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
  const junction=streetVertex(0,1760);
  const causeway=[[-244,937],[-244,1157],[-207,1394],[junction.x,junction.z]];
  for (let i=1;i<causeway.length;i++) {
    const [x,z]=causeway[i-1], [tx,tz]=causeway[i];
    line(streets,x,2.7,z,tx,tz,25,2.2);
    for (const offset of [-11,11]) {
      line(curbs,x+offset,4.09,z,tx+offset,tz,1.21,1.75);
      lightsAlong(x+offset,z,tx+offset,tz,33,6.1);
    }
    for (let step=.1;step<1;step+=.18) curbs.push([x+(tx-x)*step,-1.4,z+(tz-z)*step,7,7,4.4]);
  }
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
  return streetFixtures(lamps);
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

const terrainMaterial = new MeshStandardMaterial({ vertexColors:true, roughness:.91 });
const circle = new THREE.CylinderGeometry(.5,.5,1,16);
const octagon = new THREE.CylinderGeometry(.30,.5,1,8);
const leavesGeometry = new THREE.IcosahedronGeometry(.5,1);
const treeBark = new MeshStandardMaterial({ color:'#504c40', roughness:1 });
const treeCanopy = new MeshStandardMaterial({ roughness:1 });
const paintedMetal = new MeshStandardMaterial({ roughness:.67, metalness:.36 });
const bridgeGlass = neon('#729e95',.9);
const steel = new MeshStandardMaterial({ color:'#747674', roughness:.66, metalness:.46 });
const landColors = {
  downtown:new Color('#393f44'), canal:new Color('#3b4647'), industry:new Color('#494741'), outskirts:new Color('#424e3d'),
};
const dampBank = new Color('#3b4647');

function tileTerrain({x,z}) {
  const subdivisions=26;
  const geometry=new THREE.PlaneGeometry(tileSize,tileSize,subdivisions,subdivisions);
  geometry.rotateX(-Math.PI/2);
  const points=geometry.attributes.position;
  const colors=[];
  const tint=new Color();
  for (let i=0;i<points.count;i++) {
    const worldX=points.getX(i)+x, worldZ=points.getZ(i)+z;
    const y=groundAt(worldX,worldZ);
    points.setY(i,y);
    tint.copy(landColors[districtForPosition(worldX,worldZ).id]);
    tint.lerp(dampBank,Math.min(1,-y*.28));
    const noise=.89+.075*Math.sin(worldX*.16+worldZ*.11)+.06*Math.cos(worldZ*.022-worldX*.028);
    tint.multiplyScalar(noise);
    colors.push(tint.r,tint.g,tint.b);
  }
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.computeVertexNormals();
  return new Mesh(geometry,terrainMaterial);
}

function drawTile(tile, detail) {
  const group=new Group();
  group.add(tileTerrain(tile));
  const paved=[], roads=[], marks=[], lights=[], pools=[], curbs=[], lawns=[], docks=[], tanks=[], rails=[], trees=[], trunks=[];
  const random=randomFor(tile.seed ^ 0x1927347);
  const marketPaths=[];
  const planted=(x,z,scale=1)=>{
    const h=(4.5+random()*7.8)*scale;
    const color=['#424e36','#465543','#535a37','#3b4b3c','#656748'][Math.floor(random()*5)];
    trunks.push([x,h*.29,z,h*.065,h*.57,h*.06]);
    trees.push([x,h*.72,z,h*.67,h*.93,h*.65,random()*6.28,color]);
    if (detail) trees.push([x+h*.14,h*.56,z+h*.055,h*.49,h*.60,h*.48,random()*6.28,color]);
  };
  for (const {x,z,use,yaw} of tile.blocks) {
    if (use==='plaza' || use==='estate' || use==='grove') {
      if (use==='plaza') {
        const color='#57665c';
        lawns.push([x,.14,z,72,.28,62,yaw,color]);
        paved.push([x,.25,z,17,.44,69,yaw],[x,.251,z,68,.44,13,yaw]);
        for (const a of [-29,29]) for (const b of [-25,25]) planted(x+a,z+b,1.22);
        if (detail) {
          for (const offset of [-31,-17,17,31]) {
            lights.push([x+offset,1.22,z+7,.45,.45,.45],[x-7,1.22,z+offset,.45,.45,.45]);
            pools.push([x+offset,.46,z+6,5,1,8,0,'#e0b174'],[x-7,.46,z+offset,8,1,6,0,'#a3c7b7']);
          }
          marketPaths.push([x-32,z+2,x+30,z+2,7]);
        }
      } else {
        const count=use==='grove'?(detail?17:9):detail?6:3;
        for (let i=0;i<count;i++) {
          const dx=(random()-.5)*(use==='grove'?110:93);
          const dz=use==='grove'?(random()-.5)*106:(random()-.68)*47;
          if (groundAt(x+dx+tile.x,z+dz+tile.z)>-.93) planted(x+dx,z+dz,use==='grove'?1.22:.8);
        }
      }
    } else if (use==='tanks') {
      paved.push([x,.14,z,119,.33,113,yaw]);
      for (const a of [-24,24]) for (const b of [-25,25]) {
        const w=26+random()*10, h=7+random()*7.5;
        if (groundAt(x+a+tile.x,z+b+tile.z)<-1.1) continue;
        tanks.push([x+a,h/2,z+b,w,h,w,0,'#686b61'],[x+a,h+.12,z+b,w*1.04,1.1,w*1.04,0,'#9a8a70']);
        if (detail) {
          tanks.push([x+a,h*.54,z+b,w*1.009,.54,w*1.009,0,'#aa8656']);
          rails.push([x+a,h+1.03,z+b,w*.21,1.15,.42]);
          lights.push([x+a,h+.98,z+b-w*.43,.47,.35,.47]);
        }
      }
    } else if (use==='yard') {
      paved.push([x,.12,z,117,.24,113,yaw]);
      for (let i=0;i<12;i++) {
        const a=(i%4-1.5)*19,b=(Math.floor(i/4)-1)*25;
        if (groundAt(x+a+tile.x,z+b+tile.z)<-.9) continue;
        docks.push([x+a,1.55,z+b,11.8,3.02,21,0,i%3===0?'#8a6248':'#516363']);
        if (i%3===1) docks.push([x+a,4.50,z+b,11.8,2.89,21,0,'#7a674b']);
        if (detail) for (let j=-2;j<=2;j++) rails.push([x+a+5.99,1.46,z+b+j*3.95,.15,2.79,.18]);
      }
      if (detail) {
        for (const side of [-1,1]) {
          const xx=x+side*44;
          curbs.push([xx,8.18,z-36,1.65,16.4,1.65]);
          beam(curbs,xx,4,z-48,xx,16,z-36,.73,.74);
          lights.push([xx,16.7,z-36,1.7,.52,.91]);
          pools.push([xx,.43,z-29,16,1,33,0,'#bd9a69']);
        }
        curbs.push([x,16.1,z-36,90,1.49,1.42]);
      }
    } else if (use==='market' || use==='urban') {
      if (detail) {
        paved.push([x,.08,z,use==='market'?107:114,.18,112,yaw]);
        if (use==='market') {
          for (const offset of [-15,5,25]) {
            docks.push([x+offset,2.8,z,8.8,.72,6.9,0,offset===5?'#60474b':'#4e5e66']);
            curbs.push([x+offset-4,1.57,z,.36,3.13,.38],[x+offset+4,1.57,z,.36,3.13,.38]);
            lights.push([x+offset,2.25,z+3.42,5.8,.34,.19]);
          }
          marketPaths.push([x-25,z+7,x+31,z+7,4]);
        }
      }
    }
  }

  const bridges=[];
  const glazing=[];
  for (const walk of tile.skywalks) {
    const {from,to,h,base,d}=walk;
    line(bridges,from.x,base+.7,from.z,to.x,to.z,walk.w,1.44);
    line(bridges,from.x,h-.56,from.z,to.x,to.z,walk.w,1.13);
    if (!detail) continue;
    const dx=to.x-from.x,dz=to.z-from.z;
    const nx=-dz/d,nz=dx/d;
    for (const side of [-1,1]) {
      const s=side*(walk.w*.5-.4);
      const lampsOffset=side*walk.w*.506;
      line(glazing,from.x+nx*s,base+4.35,from.z+nz*s,to.x+nx*s,to.z+nz*s,.46,4.72);
      line(lights,from.x+nx*lampsOffset,base+1.72,from.z+nz*lampsOffset,
        to.x+nx*lampsOffset,to.z+nz*lampsOffset,.23,.25);
      for (let at=.06;at<.98;at+=.082) {
        const next=Math.min(1,at+.079);
        const x=from.x+dx*at+nx*s,z=from.z+dz*at+nz*s;
        bridges.push([x,base+4,z,.64,6.9,.64]);
        beam(rails,x,base+1.5,z,from.x+dx*next+nx*s,h-1,from.z+dz*next+nz*s,.23,.26);
      }
    }
  }
  if (detail && tile.district.id==='canal') {
    for (const side of [-1,1]) for (let z=-tileSize/2;z<tileSize/2;z+=20) {
      const bank=riverAt(tile.x,tile.z+z),next=riverAt(tile.x,tile.z+z+20);
      const x=bank.center+side*(bank.width+16)-tile.x;
      const tx=next.center+side*(next.width+16)-tile.x;
      if (Math.abs(x)>tileSize/2 || Math.abs(tx)>tileSize/2 || groundAt(x+tile.x,z+tile.z)<-1.7) continue;
      line(curbs,x,-.74,z,tx,z+20,2.65,2.2);
      if (Math.round(z/20)%2===0) {
        curbs.push([x,.45,z,1.3,1.55,1.25]);
        lights.push([x,1.28,z,.61,.29,.60]);
      }
    }
  }
  const junctions=[];
  for (const road of tile.roads) {
    const {x,z,toX,toZ,width,kind,bridge}=road;
    const dx=toX-x,dz=toZ-z,length=Math.hypot(dx,dz);
    const nx=-dz/length,nz=dx/length;
    const y=bridge ? .63 : .20;
    line(roads,x,y,z,toX,toZ,width,bridge ? .46 : .27);
    junctions.push([x,y-.008,z,width,.21,width]);
    if (bridge) {
      const number=Math.max(1,Math.ceil(length/65));
      for (let i=0;i<number;i++) {
        const t=(i+.5)/number, xx=x+dx*t, zz=z+dz*t;
        curbs.push([xx,-2.05,zz,width*.38,4.9,3.2]);
      }
    }
    if (!detail) continue;
    if (kind==='rail') {
      for (const side of [-1,1]) {
        const offset=side*1.47;
        line(rails,x+nx*offset,y+.31,z+nz*offset,toX+nx*offset,toZ+nz*offset,.22,.25);
      }
    }
    if (kind!=='street') {
      for (const side of [-1,1]) {
        const s=side*(width*.5+.9);
        line(curbs,x+nx*s,y+.18,z+nz*s,toX+nx*s,toZ+nz*s,1.8,.38);
        if (bridge) line(rails,x+nx*s,y+.82,z+nz*s,toX+nx*s,toZ+nz*s,.45,.61);
      }
    }
    const spaced=kind==='rail'?5.5:kind==='avenue'?18:26;
    for (let cursor=13;cursor<length-10;cursor+=spaced) {
      const at=cursor/length, px=x+at*dx,pz=z+at*dz;
      if (kind==='rail') {
        marks.push([px,y+.25,pz,5.7,.13,.72,Math.atan2(dx,dz)]);
        continue;
      }
      if (kind!=='street') line(marks,px,y+.19,pz,px+dx/length*5.5,pz+dz/length*5.5,.23,.045);
      const every=kind==='avenue'?2:3;
      if (Math.round(cursor/spaced)%every!==0) continue;
      if (kind==='street' && tile.district.id==='outskirts' && random()<.68) continue;
      const sign=cursor<length*.5?-1:1;
      const s=sign*(width*.5+.67);
      const lx=px+nx*s,lz=pz+nz*s;
      const h=kind==='avenue'?6.4:4.15;
      curbs.push([lx,y+h*.5,lz,.31,h,.31]);
      lights.push([lx-nx*sign*1.6,y+h,lz-nz*sign*1.6,1.28,.32,.62,Math.atan2(dz,dx)]);
      beam(curbs,lx,y+h-.55,lz,lx-nx*sign*1.8,y+h,lz-nz*sign*1.8,.19,.20);
      pools.push([px+nx*s*.35,y+.24,pz,Math.min(16,width*.84),1,15,Math.atan2(dx,dz),tile.district.color]);
    }
    if (kind==='avenue') {
      for (const t of [.055,.945]) for (let stripe=-3;stripe<=3;stripe++) {
        const s=stripe*1.28;
        marks.push([x+dx*t+nx*s,y+.175,z+dz*t+nz*s,.69,.06,2.05,Math.atan2(dx,dz)]);
      }
    }
  }

  batch(group,box,stone,paved);
  batch(group,box,publicGreen,lawns);
  batch(group,box,paintedMetal,docks);
  batch(group,circle,paintedMetal,tanks);
  batch(group,box,asphalt,roads);
  batch(group,circle,asphalt,junctions);
  batch(group,box,structural,bridges);
  batch(group,box,treeBark,trunks);
  batch(group,leavesGeometry,treeCanopy,trees);
  let move=null;
  let hierarchy=[], fixtures=[];
  if (detail) {
    batch(group,box,trim,curbs);
    batch(group,box,paintedLines,marks);
    batch(group,box,warmLamp,lights);
    batch(group,box,steel,rails);
    batch(group,box,bridgeGlass,glazing);
    batch(group,pavingPlane,pavementGlow,pools);
    hierarchy=detailHierarchy(towers(group,tile.buildings,true),tile.x,tile.z);
    fixtures=streetFixtures(lights,tile.x,tile.z);
    const {circuits,roads}=localTraffic(tile);
    move=addMovingTraffic(group,circuits,roads,marketPaths,tile.seed);
  } else {
    const silhouettes=[], stacks=[];
    for (const b of tile.buildings) {
      const entry=[b.x,b.h/2,b.z,b.w,b.h,b.d,b.yaw,facadeColors[b.style]];
      if (b.type===8 || b.type===4 || b.type===12) stacks.push(entry);
      else if (b.type===9) {
        for (const side of [-1,1]) silhouettes.push([b.x+side*b.w*.25,b.h*.44,b.z,b.w*.41,b.h*.88,b.d*.82,b.yaw,entry[7]]);
      } else if (b.type===10 || b.type===11) {
        silhouettes.push([b.x,b.h*.18,b.z,b.w,b.h*.36,b.d,b.yaw,entry[7]]);
        for (const side of [-1,1]) stacks.push([b.x+side*b.w*.29,b.h*.48,b.z,b.w*.10,b.h*.96,b.d*.10,b.yaw,'#6b6055']);
      } else silhouettes.push(entry);
    }
    batch(group,box,distantTowers,silhouettes);
    batch(group,octagon,paintedMetal,stacks);
  }
  return {group,move,hierarchy,fixtures};
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
  let colliders=[];
  return {
    nearbyLayouts: () => loaded.values(),
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
          for (const building of data.buildings.concat(data.skywalks)) {
            colliders.push({ ...building, x: building.x+data.x, z: building.z+data.z });
          }
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
  const coreFixtures=ground(city,coreBuildings);
  const coreDetail=detailHierarchy(towers(city,coreBuildings));
  const details=streetDetails(scene);
  const lighting=streetLighting(scene);
  const updateTraffic = addMovingTraffic(city, airCircuits(coreBuildings), streetRuns(coreBuildings), footpaths, 18725);
  let lastColliders, showCore;
  return {
    buildings: coreBuildings,
    nearbyLayouts: streamer.nearbyLayouts,
    lights: lighting.lights,
    afterCamera(now,dt,position,camera,origin,height) {
      const nearCore=Math.max(Math.abs(position.x),Math.abs(position.z))<1620;
      const hierarchies=nearCore?[coreDetail]:[];
      const fixtureLists=nearCore?[coreFixtures]:[];
      for (const tile of streamer.nearbyLayouts()) {
        if (tile.near) {
          hierarchies.push(tile.hierarchy);
          fixtureLists.push(tile.fixtures);
        }
      }
      camera.updateMatrixWorld();
      details.update(now,camera,origin,height,hierarchies);
      lighting.update(now,dt,camera,origin,fixtureLists.concat([details.fixtures()]));
    },
    update(time, position, origin) {
      setScreenTime(time);
      ocean.material.uniforms.time.value = time;
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
