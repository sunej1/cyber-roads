import * as THREE from 'three';
import { randomFor } from './flight.js';

export function createRain(scene, camera, fewerDrops) {
  const card = new THREE.PlaneGeometry(1, 1);
  const geometry = new THREE.InstancedBufferGeometry().copy(card);
  card.dispose();
  const random = randomFor(3819);
  geometry.instanceCount = fewerDrops ? 440 : 1040;
  geometry.setAttribute('seed', new THREE.InstancedBufferAttribute(
    Float32Array.from({ length: geometry.instanceCount * 4 }, () => random()), 4,
  ));
  const material = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } },
    depthWrite: false,
    transparent: true,
    vertexShader: /* glsl */ `
      uniform float time;
      attribute vec4 seed;
      varying vec2 streak;
      varying float opacity;
      void main() {
        vec3 span=vec3(80.0,48.0,80.0);
        vec3 velocity=vec3(4.0,-25.0,-2.3)*mix(.74,1.23,seed.w);
        vec3 offset=mod(seed.xyz*span+velocity*time-cameraPosition+span*.5,span)-span*.5;
        vec3 at=cameraPosition+offset;
        vec4 view=viewMatrix*vec4(at,1.0);
        vec3 along=(viewMatrix*vec4(velocity*mix(.025,.076,seed.w),0.0)).xyz;
        vec2 across=normalize(vec2(along.y,-along.x)+vec2(.0001,0.0));
        view.xyz+=along*position.y;
        view.xy+=across*position.x*clamp(-view.z*.0027,.019,.115);
        float range=length(offset);
        opacity=mix(.20,.61,seed.w)*smoothstep(2.4,7.0,-view.z)*(1.0-smoothstep(20.0,43.0,range));
        streak=uv;
        gl_Position=projectionMatrix*view;
      }`,
    fragmentShader: /* glsl */ `
      varying vec2 streak;
      varying float opacity;
      void main() {
        float across=1.0-smoothstep(.05,.5,abs(streak.x-.5));
        float along=smoothstep(0.0,.34,streak.y)*(1.0-smoothstep(.74,1.0,streak.y));
        gl_FragColor=vec4(.39,.56,.68,opacity*across*along);
      }`,
  });
  const rain = new THREE.Mesh(geometry, material);
  rain.frustumCulled = false;
  rain.layers.set(1);
  camera.layers.enable(1);
  scene.add(rain);
  return (time, reducedMotion) => {
    rain.visible = !reducedMotion;
    material.uniforms.time.value = time;
  };
}

export const streetFog = /* glsl */ `
  uniform vec4 lamps[6];
  uniform vec3 lampTint[6];
  uniform float time;

  float readFog(float height) { return exp(-max(0.0,height-1.0)/13.0); }

  vec3 fogStreet(vec3 color,vec3 viewPoint,vec3 worldPoint) {
    vec3 eye=viewToWorld[3].xyz;
    vec3 ray=normalize(viewPoint);
    float distanceToSurface=length(viewPoint);
    float distanceInFog=min(620.0,distanceToSurface);
    vec3 end=mix(eye,worldPoint,distanceInFog/max(.001,distanceToSurface));
    float low=min(eye.y,end.y), high=max(eye.y,end.y);
    float height=high-low;
    float average=height<.08 ? readFog(low) :
      (max(0.0,min(high,1.0)-low)+13.0*(readFog(low)-readFog(high)))/height;
    vec2 at=(eye.xz+end.xz)*.5*(6.28318530718/640.0);
    float drift=sin(at.x*3.0+at.y*5.0+time*.29)*cos(at.y*4.0-at.x*2.0-time*.15);
    float density=distanceInFog*average*(.012+.0042*drift);
    vec3 scatter=vec3(0.0);
    for (int i=0;i<6;i++) {
      if (lamps[i].w<=0.0) continue;
      float passed=clamp(dot(lamps[i].xyz,ray),0.0,distanceInFog);
      float radius=lamps[i].w*.57;
      float spread=1.0-length(lamps[i].xyz-ray*passed)/radius;
      if (spread<=0.0) continue;
      float localHeight=mix(eye.y,end.y,passed/max(.1,distanceInFog));
      scatter+=lampTint[i]*spread*spread*readFog(localHeight)*smoothstep(.5,8.0,passed)
        *exp(-density*passed/max(.1,distanceInFog));
    }
    float rise=abs((viewToWorld*vec4(ray,0.0)).y);
    float horizon=smoothstep(650.0,3900.0,distanceToSurface)*exp(-rise*15.0);
    vec3 air=vec3(.050,.070,.082);
    color=mix(color,air,horizon);
    return mix(air,color,exp(-density))+scatter;
  }
`;
