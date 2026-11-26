import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { tileSize } from './extent.js';
import { batch } from './scene-parts.js';

const crown = new THREE.IcosahedronGeometry(.5);
const specimen = new THREE.IcosahedronGeometry(.5, 1);
const bough = new THREE.ConeGeometry(.5, 1, 7).toNonIndexed();
const trunk = new THREE.CylinderGeometry(.31, .5, 1, 5).toNonIndexed();

function part(shape, color, x, y, z, w, h, d, yaw = 0) {
  const geometry = shape.clone().scale(w, h, d).rotateY(yaw).translate(x, y, z);
  const positions = geometry.getAttribute('position');
  const colors = new Float32Array(positions.count * 3);
  const tint = new THREE.Color(color);
  const vertex = new THREE.Color();
  for (let i = 0; i < positions.count; i++) {
    const height = (positions.getY(i) - y) / h + .5;
    vertex.copy(tint).multiplyScalar(.68 + .32 * height).toArray(colors, i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

const bark = '#68645c';
const shapes = {
  garden: mergeGeometries([
    part(trunk, bark, 0, .36, 0, .09, .72, .09),
    part(specimen, '#ffffff', -.045, .77, .04, .65, .46, .58),
    part(crown, '#b8c4b8', .19, .61, -.065, .51, .40, .48, .7),
    part(crown, '#ced9cd', .07, .85, -.17, .44, .28, .43, 1.4),
    part(crown, '#aebcb5', -.22, .58, .01, .39, .32, .48, .5),
  ]),
  broadleaf: mergeGeometries([
    part(trunk, bark, 0, .34, 0, .09, .68, .09),
    part(crown, '#ffffff', -.055, .75, .015, .70, .50, .64),
    part(crown, '#cbd8cf', .21, .65, -.085, .44, .44, .45, .7),
    part(crown, '#bacabe', -.09, .61, .20, .46, .36, .43, 1.4),
  ]),
  conifer: mergeGeometries([
    part(trunk, bark, 0, .28, 0, .075, .56, .075),
    part(bough, '#b2c2bc', 0, .46, 0, .49, .48, .46),
    part(bough, '#d4dfd7', -.018, .64, .01, .38, .46, .35, .25),
    part(bough, '#ffffff', -.018, .82, .01, .25, .36, .23, .5),
  ]),
  shrub: mergeGeometries([
    part(crown, '#eef5e5', -.16, .37, .08, .90, .74, .70),
    part(crown, '#ffffff', .16, .52, -.12, .84, .90, .78, .7),
  ]),
};

export const windTime = { value: 0 };
const foliage = new THREE.MeshStandardMaterial({ roughness: 1, vertexColors: true });
foliage.onBeforeCompile = shader => {
  shader.uniforms.windTime = windTime;
  shader.vertexShader = 'uniform float windTime;\n' + shader.vertexShader.replace('#include <begin_vertex>', /* glsl */ `
    #include <begin_vertex>
    // These wavelengths repeat on the floating-origin grid.
    vec2 plot = (modelMatrix * instanceMatrix[3]).xz * (6.28318530718 / ${tileSize.toFixed(1)});
    float gust = .033*sin(dot(plot,vec2(2.0,3.0))-windTime*2.1)
      + .014*sin(dot(plot,vec2(11.0,-7.0))-windTime*4.2);
    float tip = max(0.0,transformed.y);
    vec2 sway = vec2(1.0,-.55) * gust * tip * tip * step(.001,windTime);
    transformed.xz += vec2(dot(sway,normalize(instanceMatrix[0].xz)),
                           dot(sway,normalize(instanceMatrix[2].xz)));
  `);
};

export function plant(items, x, y, z, height, yaw, color) {
  items.push([x, y, z, height, height, height, yaw, color]);
}

export function addPlants(parent, type, items) {
  const mesh = batch(parent, shapes[type], foliage, items);
  if (mesh) mesh.boundingSphere.radius += .06 * Math.max(...items.map(item => item[4]));
}
