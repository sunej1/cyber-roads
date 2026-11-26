import * as THREE from 'three';
import asphaltColor from './assets/ground/asphalt-color.jpg';
import asphaltNormal from './assets/ground/asphalt-normal.jpg';
import asphaltRoughness from './assets/ground/asphalt-rough.jpg';
import paversColor from './assets/ground/pavers-color.jpg';
import paversNormal from './assets/ground/pavers-normal.jpg';
import gravelColor from './assets/ground/gravel-color.jpg';
import turfColor from './assets/ground/turf.webp';
import { tileSize } from './extent.js';
import { wetPatches } from './ray-lighting.js';

const loader = new THREE.TextureLoader();
function loadMap(url, color = false) {
  const map = loader.load(url);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 8;
  if (color) map.colorSpace = THREE.SRGBColorSpace;
  return map;
}

function makeWeatherMap() {
  const size = 128;
  const pixels = new Uint8Array(size * size * 4);
  const grid = (x, y, count, seed) => {
    let hash = Math.imul((x % count) + seed, 0x45d9f3b) ^ Math.imul((y % count) + 1, 0x119de1f3);
    hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
    return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296;
  };
  const noise = (x, y, count, seed) => {
    const ix = Math.floor(x * count), iy = Math.floor(y * count);
    const dx = x * count - ix, dy = y * count - iy;
    const sx = dx * dx * (3 - 2 * dx), sy = dy * dy * (3 - 2 * dy);
    const a = THREE.MathUtils.lerp(grid(ix, iy, count, seed), grid(ix + 1, iy, count, seed), sx);
    const b = THREE.MathUtils.lerp(grid(ix, iy + 1, count, seed), grid(ix + 1, iy + 1, count, seed), sx);
    return THREE.MathUtils.lerp(a, b, sy);
  };
  for (let i = 0; i < size * size; i++) {
    const x = (i % size + .5) / size, y = (Math.floor(i / size) + .5) / size;
    pixels[i * 4] = 255 * (.72 * noise(x, y, 17, 3) + .28 * noise(x, y, 61, 7));
    pixels[i * 4 + 1] = 255 * (.58 * noise(x, y, 23, 11) + .42 * noise(x, y, 47, 13));
    pixels[i * 4 + 2] = 255 * (.68 * noise(x, y, 7, 17) + .32 * noise(x, y, 37, 23));
    pixels[i * 4 + 3] = 255;
  }
  const map = new THREE.DataTexture(pixels, size, size);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.magFilter = THREE.LinearFilter;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.generateMipmaps = true;
  map.needsUpdate = true;
  return map;
}

const weather = makeWeatherMap();
const aggregate = loadMap(gravelColor, true);
const grass = loadMap(turfColor, true);
const asphaltMap = loadMap(asphaltColor, true);

function groundMaterial(material, meters, customize) {
  material.customProgramCacheKey = () => material.name;
  material.onBeforeCompile = shader => {
    shader.uniforms.groundWeather = { value: weather };
    shader.vertexShader = 'varying vec2 groundXZ;\n' + shader.vertexShader.replace('#include <begin_vertex>', /* glsl */ `
      #include <begin_vertex>
      vec4 groundPoint = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        groundPoint = instanceMatrix * groundPoint;
      #endif
      groundXZ = (modelMatrix * groundPoint).xz;
      // Texture periods divide the floating-origin shift.
      vec2 groundUv = groundXZ / ${meters.toFixed(1)};
      #ifdef USE_MAP
        vMapUv = groundUv;
      #endif
      #ifdef USE_NORMALMAP
        vNormalMapUv = groundUv;
      #endif
      #ifdef USE_ROUGHNESSMAP
        vRoughnessMapUv = groundUv;
      #endif
    `);
    shader.fragmentShader = 'varying vec2 groundXZ;\nuniform sampler2D groundWeather;\n' +
      shader.fragmentShader.replace('#include <map_fragment>', /* glsl */ `
        vec3 groundWear = texture2D(groundWeather, groundXZ / ${tileSize.toFixed(1)}).rgb;
        #include <map_fragment>
        diffuseColor.rgb *= .67 + groundWear.r * .66;
      `);
    customize?.(shader);
  };
  return material;
}

function localSurfacePosition(shader) {
  shader.vertexShader = 'varying vec3 surfacePosition;\n' + shader.vertexShader.replace('#include <begin_vertex>', /* glsl */ `
    #include <begin_vertex>
    surfacePosition = vec3(position.xz,0.0);
    #ifdef USE_INSTANCING
      vec2 surfaceSize = vec2(length(instanceMatrix[0].xyz), length(instanceMatrix[2].xyz));
      surfacePosition = vec3(position.xz * surfaceSize, dot(instanceMatrix[3].xz,vec2(.034,.056)));
    #endif
  `);
  shader.fragmentShader = 'varying vec3 surfacePosition;\n' + shader.fragmentShader;
}

export const asphalt = groundMaterial(new THREE.MeshStandardMaterial({
  name: 'Street asphalt', color: '#b6bec2', roughness: .98, metalness: .03,
  map: asphaltMap, normalMap: loadMap(asphaltNormal), normalScale: new THREE.Vector2(.54,.54),
  roughnessMap: loadMap(asphaltRoughness),
}), 5, shader => {
  localSurfacePosition(shader);
  shader.fragmentShader = wetPatches + shader.fragmentShader.replace('#include <roughnessmap_fragment>', /* glsl */ `
    #include <roughnessmap_fragment>
    float section = (surfacePosition.y + 10.0) / 25.0;
    float patchSeed = fract(floor(section) * .618034 + surfacePosition.z);
    vec2 patchPoint = vec2(surfacePosition.x + (patchSeed - .5) * 9.0, (fract(section) - .5) * 25.0);
    vec2 extents = vec2(1.0 + 3.5 * patchSeed, 2.3 + 5.3 * fract(patchSeed * 9.3));
    vec2 shape = extents - abs(patchPoint) + (groundWear.g - .5) * vec2(.55, 1.5);
    float edge = min(shape.x,shape.y);
    float filterWidth = max(.055,fwidth(edge));
    float repair = smoothstep(-filterWidth,filterWidth,edge) * step(.35,patchSeed);
    float tar = (1.0 - smoothstep(.04, .17 + filterWidth, abs(edge))) * step(.35,patchSeed);
    float water = wetPatches(groundXZ);
    roughnessFactor = mix(mix(.47,.97,roughnessFactor) - .12 * repair, .40, water);
    float asphaltGray = dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
    diffuseColor.rgb = mix(vec3(asphaltGray),diffuseColor.rgb,.4);
    float tread = 1.0-smoothstep(.42,1.12,abs(abs(surfacePosition.x)-3.45));
    float patchColor = mix(.56, 1.33, step(.72,patchSeed));
    diffuseColor.rgb *= (1.0 - .19*water) * mix(1.0,patchColor,repair) * (1.0 - .42*tar - .16*tread);
  `);
});

export const groundPaint = groundMaterial(new THREE.MeshBasicMaterial({ name: 'Worn street paint', color: '#afa17c' }), 5, shader => {
  shader.uniforms.paintGrain = { value: asphaltMap };
  shader.fragmentShader = 'uniform sampler2D paintGrain;\n' + shader.fragmentShader.replace('#include <map_fragment>', /* glsl */ `
    float grain = texture2D(paintGrain,groundXZ/5.0).g;
    diffuseColor.rgb *= .62 + .38*smoothstep(.021,.12,grain + (groundWear.g-.5)*.09);
  `);
});

export const paving = groundMaterial(new THREE.MeshStandardMaterial({
  name: 'Concrete pavers', color: '#e0e5e5', roughness: .84,
  map: loadMap(paversColor, true), normalMap: loadMap(paversNormal), normalScale: new THREE.Vector2(.65,.65),
}), 8, shader => {
  shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', /* glsl */ `
    vec3 stone = texture2D(map,vMapUv).rgb;
    float gray = dot(stone,vec3(.2126,.7152,.0722));
    diffuseColor.rgb *= mix(vec3(gray),stone,.30) * mix(.75,1.19,groundWear.g);
  `);
});

export const gravel = groundMaterial(new THREE.MeshStandardMaterial({
  name: 'Compacted gravel', color: '#a2a5a3', roughness: .94, map: aggregate,
}), 8);

export const yardSurface = groundMaterial(new THREE.MeshStandardMaterial({
  name: 'Tracked freight gravel', color: '#c4b8a8', roughness: .95, map: aggregate,
}), 8, shader => {
  localSurfacePosition(shader);
  shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', /* glsl */ `
    #include <map_fragment>
    float lane = mod(surfacePosition.x + 12.0 + (groundWear.g-.5)*1.6,24.0)-12.0;
    float compacted = 1.0-smoothstep(2.2,4.2,abs(lane));
    float tire = 1.0-smoothstep(.38,.96,abs(abs(lane)-1.46));
    diffuseColor.rgb *= mix(.64,1.42,groundWear.b) * (1.0 - .16*compacted - .22*tire);
  `);
});

function groundCover(name, color, fromTerrain) {
  return groundMaterial(new THREE.MeshStandardMaterial({
    name, color, roughness: .94, vertexColors: fromTerrain, map: aggregate,
  }), 8, shader => {
    const coverage = fromTerrain ? 'grassCoverage' : '.70';
    if (fromTerrain) {
      shader.vertexShader = 'attribute float grassAmount;\nvarying float grassCoverage;\n' +
        shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ngrassCoverage = grassAmount;');
      shader.fragmentShader = 'varying float grassCoverage;\n' + shader.fragmentShader;
    }
    shader.uniforms.groundGrass = { value: grass };
    shader.fragmentShader = 'uniform sampler2D groundGrass;\n' + shader.fragmentShader.replace('#include <map_fragment>', /* glsl */ `
      vec2 breakup = (groundWear.rg - .5) * .42;
      vec3 dirt = texture2D(map, vMapUv + breakup).rgb;
      vec3 lawn = texture2D(groundGrass, groundXZ / 5.0 + breakup).rgb;
      float turf = smoothstep(.31,.69,${coverage} + .67*(groundWear.b-.5) + .43*(groundWear.g-.5));
      diffuseColor.rgb *= mix(dirt*.85, lawn*1.18, turf) * mix(.61,1.40,groundWear.b);
    `);
  });
}

export const turf = groundCover('Park grass', '#9eac99', false);
export const terrainMaterial = groundCover('Terrain', '#ffffff', true);
