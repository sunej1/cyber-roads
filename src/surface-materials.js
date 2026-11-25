import * as THREE from 'three';
import atlasUrl from './assets/surface-atlas.jpg';
import { texture } from './scene-parts.js';
import { wetPatches } from './ray-lighting.js';

const atlas = new Image();
atlas.src = atlasUrl;

export function drawSurface(ctx, sample) {
  if (!atlas.complete || !atlas.naturalWidth) return;
  const w = atlas.naturalWidth / 2, h = atlas.naturalHeight / 2;
  ctx.drawImage(atlas, sample % 2 * w + 1, Math.floor(sample / 2) * h + 1, w - 2, h - 2,
    0, 0, ctx.canvas.width, ctx.canvas.height);
}

export function surfaceMap(size, paint, data = false) {
  const map = texture(size, size, paint);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  if (data) map.colorSpace = THREE.NoColorSpace;
  if (!atlas.complete) atlas.addEventListener('load', () => {
    paint(map.image.getContext('2d'));
    map.needsUpdate = true;
  }, { once: true });
  return map;
}

const asphaltAlbedo = surfaceMap(512, ctx => {
  ctx.fillStyle = '#41474c';
  ctx.fillRect(0,0,512,512);
  drawSurface(ctx,3);
});
const asphaltBump = surfaceMap(512, ctx => {
  ctx.fillStyle = '#666';
  ctx.fillRect(0,0,512,512);
  ctx.save();
  ctx.filter = 'grayscale(1) contrast(1.35)';
  drawSurface(ctx,3);
  ctx.restore();
}, true);

export const asphalt = new THREE.MeshStandardMaterial({
  map: asphaltAlbedo, bumpMap: asphaltBump, bumpScale: .025,
  color: '#b9c0bd', roughness: .85, metalness: .05,
});
asphalt.onBeforeCompile = shader => {
  shader.vertexShader = 'varying vec2 pavementXZ;\n' + shader.vertexShader.replace('#include <begin_vertex>', `
    #include <begin_vertex>
    vec4 pavementPosition=vec4(transformed,1.0);
    #ifdef USE_INSTANCING
      pavementPosition=instanceMatrix*pavementPosition;
    #endif
    pavementXZ=(modelMatrix*pavementPosition).xz;
    vMapUv=pavementXZ*.25;
    vBumpMapUv=pavementXZ*.25;
  `);
  shader.fragmentShader = 'varying vec2 pavementXZ;\n' + wetPatches + '\n' + shader.fragmentShader.replace('#include <roughnessmap_fragment>', `
    #include <roughnessmap_fragment>
    float water=wetPatches(pavementXZ);
    roughnessFactor=mix(roughnessFactor,.40,water);
    diffuseColor.rgb*=1.0-.19*water;
  `);
};

export const weatheredConcrete = new THREE.MeshStandardMaterial({
  color: '#9c9c8f', roughness: .91,
  map: surfaceMap(512, ctx => {
    ctx.fillStyle = '#63635e';
    ctx.fillRect(0,0,512,512);
    drawSurface(ctx,0);
  }),
});

export function installSkyProbe(renderer, scene) {
  const sky = texture(256,128,ctx => {
    const gradient = ctx.createLinearGradient(0,0,0,128);
    gradient.addColorStop(0,'#242e39');
    gradient.addColorStop(.47,'#566775');
    gradient.addColorStop(.54,'#767669');
    gradient.addColorStop(.64,'#383938');
    gradient.addColorStop(1,'#1d2527');
    ctx.fillStyle = gradient;
    ctx.fillRect(0,0,256,128);
    for (const [x,y,size,color] of [[36,60,23,'#c78d57'],[172,65,16,'#75a5b6']]) {
      const halo = ctx.createRadialGradient(x,y,0,x,y,size);
      halo.addColorStop(0,color);
      halo.addColorStop(1,color+'00');
      ctx.fillStyle = halo;
      ctx.fillRect(x-size,y-size,size*2,size*2);
    }
  });
  sky.mapping = THREE.EquirectangularReflectionMapping;
  const generator = new THREE.PMREMGenerator(renderer);
  scene.environment = generator.fromEquirectangular(sky).texture;
  scene.environmentIntensity = .46;
  generator.dispose();
  sky.dispose();
}
