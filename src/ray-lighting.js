import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { FullScreenQuad, Pass } from 'three/addons/postprocessing/Pass.js';
import { streetFog } from './weather.js';

export const wetPatches = /* glsl */ `
  float wetPatches(vec2 at) {
    // All wavelengths divide the 640 m origin shift.
    vec2 p = at * (6.28318530718 / 640.0);
    float water = sin(p.x*19.0 + sin(p.y*13.0)*1.3) * sin(p.y*29.0-p.x*7.0);
    water += .31 * cos(p.x*71.0+p.y*52.0) + .18 * sin(p.x*111.0-p.y*95.0);
    return smoothstep(-.28,.72,water);
  }`;

const fullscreenVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv=uv;
    gl_Position=vec4(position.xy,0.0,1.0);
  }
`;

const depthMath = /* glsl */ `
  uniform sampler2D sceneDepth;
  uniform mat4 projection;
  uniform mat4 inverseProjection;
  uniform mat4 viewToWorld;
  uniform vec2 clipRange;
  uniform vec2 pixelSize;

  float viewZ(float depth) {
    return (clipRange.x*clipRange.y)/((clipRange.y-clipRange.x)*depth-clipRange.y);
  }

  vec3 unproject(vec2 uv, float depth) {
    vec4 point=inverseProjection*vec4(uv*2.0-1.0,depth*2.0-1.0,1.0);
    return point.xyz/point.w;
  }

  vec2 toUv(vec3 p) {
    vec4 point=projection*vec4(p,1.0);
    return point.xy/point.w*.5+.5;
  }

  bool onScreen(vec2 uv) {
    return all(greaterThan(uv,vec2(.002))) && all(lessThan(uv,vec2(.998)));
  }

  ${wetPatches}

  float wetSurface(vec3 world) {
    float street=smoothstep(.04,.085,world.y)*(1.0-smoothstep(.94,1.19,world.y));
    float harbor=1.0-smoothstep(.022,.09,abs(3.0+world.y));
    return street*(.22+.78*wetPatches(world.xz)) + harbor*.46;
  }
`;

const traceFragment = /* glsl */ `
  varying vec2 vUv;
  uniform sampler2D sceneColor;
  uniform vec3 viewUp;
  uniform vec4 lamps[6];
  uniform sampler2D roadMirror;
  uniform sampler2D waterMirror;
  uniform mat4 roadProjection;
  uniform mat4 waterProjection;
  uniform float time;
  ${depthMath}

  float depthGap(vec3 ray, vec2 uv) {
    return viewZ(texture2D(sceneDepth,uv).r)-ray.z;
  }

  vec3 viewNormal(vec2 uv, vec3 p) {
    vec2 x=vec2(pixelSize.x*2.0,0.0), y=vec2(0.0,pixelSize.y*2.0);
    vec3 right=unproject(uv+x,texture2D(sceneDepth,uv+x).r)-p;
    vec3 left=p-unproject(uv-x,texture2D(sceneDepth,uv-x).r);
    vec3 top=unproject(uv+y,texture2D(sceneDepth,uv+y).r)-p;
    vec3 bottom=p-unproject(uv-y,texture2D(sceneDepth,uv-y).r);
    return normalize(cross(abs(right.z)<abs(left.z)?right:left,abs(top.z)<abs(bottom.z)?top:bottom));
  }

  vec4 screenReflection(vec3 surface) {
    vec3 ray=reflect(normalize(surface),viewUp);
    vec3 start=surface+viewUp*.16;
    float lastDistance=.8;
    float lastGap=-1.0;
    for (int i=0;i<24;i++) {
      float t=float(i+1)/24.0;
      float distance=1.05+t*t*145.0;
      vec3 probe=start+ray*distance;
      if (probe.z>-.43) break;
      vec2 hit=toUv(probe);
      if (!onScreen(hit)) break;
      float gap=depthGap(probe,hit);
      if (gap>.045 && lastGap<=.045) {
        float lo=lastDistance, hi=distance;
        for (int step=0;step<5;step++) {
          float mid=(lo+hi)*.5;
          vec3 q=start+ray*mid;
          if (depthGap(q,toUv(q))>.045) hi=mid;
          else lo=mid;
        }
        vec3 final=start+ray*hi;
        hit=toUv(final);
        float residual=depthGap(final,hit);
        if (residual>.045 && residual<.65+hi*.013 && dot(final-surface,viewUp)>.75) {
          float edge=min(min(hit.x,hit.y),min(1.0-hit.x,1.0-hit.y));
          float strength=smoothstep(.014,.12,edge)*(1.0-smoothstep(48.0,143.0,hi));
          return vec4(texture2D(sceneColor,hit).rgb,strength*.58);
        }
      }
      lastGap=gap;
      lastDistance=distance;
    }
    return vec4(0.0);
  }

  vec3 reflectedColor(vec3 world, vec3 surface, float wetness) {
    bool water=world.y< -2.5;
    world.y=water ? -2.965 : .46;
    vec4 mirror=water ? waterProjection*vec4(world,1.0) : roadProjection*vec4(world,1.0);
    vec2 uv=mirror.xy/mirror.w*.5+.5;
    vec2 edge=min(uv,1.0-uv);
    float confidence=mirror.w>0.0 ? smoothstep(.005,.083,min(edge.x,edge.y)) : 0.0;
    vec3 bounce=vec3(0.0);
    if (confidence>0.0) {
      vec2 at=world.xz*(6.28318530718/640.0);
      float ripple=sin(at.x*147.0+at.y*184.0+time*4.1)*cos(at.y*125.0-at.x*82.0-time*2.2);
      uv+=vec2(ripple,cos(ripple*3.2))*(water?.008:.0031);
      vec2 spread=vec2(.0028,.0037)*(water?1.45:mix(1.62,.81,wetness));
      if (water) {
        bounce=texture2D(waterMirror,uv).rgb*.50;
        bounce+=(texture2D(waterMirror,uv+spread).rgb+texture2D(waterMirror,uv-spread).rgb)*.25;
      } else {
        bounce=texture2D(roadMirror,uv).rgb*.54;
        bounce+=(texture2D(roadMirror,uv+spread).rgb+texture2D(roadMirror,uv-spread).rgb)*.23;
      }
    }
    vec4 detail=surface.z> -190.0 ? screenReflection(surface) : vec4(0.0);
    float fresnel=pow(1.0-max(0.0,dot(viewUp,-normalize(surface))),1.45);
    float strength=(.14+.38*fresnel)*wetness*(1.0-smoothstep(305.0,455.0,-surface.z));
    return min(mix(bounce*confidence,detail.rgb,detail.a),vec3(4.4))*strength;
  }

  float nearOcclusion(vec3 p,vec3 normal) {
    float radius=2.65;
    float scale=clamp(projection[1][1]*radius/(-p.z),pixelSize.y*2.0,.053)*.48;
    float occlusion=0.0;
    for (int i=0;i<6;i++) {
      float angle=float(i)*1.04719755+.38;
      vec2 dir=vec2(cos(angle)*pixelSize.x/pixelSize.y,sin(angle));
      vec2 uv=vUv+dir*scale*(i%2==0?.58:1.0);
      float depth=texture2D(sceneDepth,uv).r;
      vec3 difference=unproject(uv,depth)-p;
      float d=length(difference);
      float horizon=dot(difference,normal)/max(.075,d);
      occlusion+=smoothstep(.12,.65,horizon)*(1.0-smoothstep(.6,radius,d));
    }
    return min(.27,occlusion*.069);
  }

  float localShadow(vec3 point, vec3 normal) {
    vec4 selected=vec4(0.0);
    float best=0.0;
    for (int i=0;i<6;i++) {
      vec3 delta=lamps[i].xyz-point;
      float distance=length(delta);
      float weight=(1.0-distance/max(1.0,lamps[i].w))*max(0.0,dot(normal,delta/max(.2,distance)));
      if (lamps[i].w>0.0 && weight>best) {
        best=weight;
        selected=lamps[i];
      }
    }
    if (best<.07) return 0.0;
    vec3 start=point+normal*.15;
    for (int i=1;i<13;i++) {
      vec3 probe=mix(start,selected.xyz,float(i)/13.0);
      if (probe.z>-.4) break;
      vec2 uv=toUv(probe);
      if (!onScreen(uv)) break;
      float gap=depthGap(probe,uv);
      if (gap>.095 && gap<.6+length(probe-start)*.075) return best*.43;
    }
    return 0.0;
  }

  void main() {
    float depth=texture2D(sceneDepth,vUv).r;
    vec3 p=unproject(vUv,depth);
    if (depth>.999995 || p.z< -455.0) {
      gl_FragColor=vec4(0.0);
      return;
    }
    vec3 normal=viewNormal(vUv,p);
    vec3 world=(viewToWorld*vec4(p,1.0)).xyz;
    float wet=wetSurface(world)*smoothstep(.87,.99,dot(normal,viewUp));
    vec3 reflections=vec3(0.0);
    if (wet>.08) reflections=reflectedColor(world,p,wet);
    float contact=p.z> -265.0 ? nearOcclusion(p,normal) : 0.0;
    if (world.y<24.0 && p.z> -165.0) contact=max(contact,localShadow(p,normal));
    gl_FragColor=vec4(reflections,contact);
  }
`;

const compositeFragment = /* glsl */ `
  varying vec2 vUv;
  uniform sampler2D sceneColor;
  uniform sampler2D traced;
  uniform bool raysActive;
  ${depthMath}
  ${streetFog}
  void main() {
    vec4 beauty=texture2D(sceneColor,vUv);
    float depth=texture2D(sceneDepth,vUv).r;
    vec3 view=unproject(vUv,depth);
    vec3 world=(viewToWorld*vec4(view,1.0)).xyz;
    vec3 color=beauty.rgb;
    if (raysActive && depth<.999995 && view.z> -455.0) {
      vec4 rays=texture2D(traced,vUv);
      float validReflection=smoothstep(.03,.23,wetSurface(world));
      color=color*(1.0-rays.a)+rays.rgb*validReflection;
    }
    gl_FragColor=vec4(fogStreet(color,view,world),beauty.a);
  }
`;

function material(fragment, uniforms) {
  return new THREE.ShaderMaterial({
    vertexShader: fullscreenVertex, fragmentShader: fragment, uniforms,
    blending: THREE.NoBlending, depthTest: false, depthWrite: false, toneMapped: false,
  });
}

export class RayLightingPass extends Pass {
  constructor(scene, camera, fixtures, hdr, origin) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.fixtures = fixtures;
    this.origin = origin;
    this.lastOrigin = new THREE.Vector3();
    this.raysEnabled = false;
    this.mirrorIndex = 0;
    this.mirrorsStale = true;
    this.capture = new THREE.PerspectiveCamera();
    this.target = hdr ? new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false }) : null;
    this.mirrors = hdr ? [.46, -2.965].map(height => {
      const reflector = new Reflector(new THREE.PlaneGeometry(1, 1), { textureWidth: 1, textureHeight: 1, multisample: 0 });
      reflector.rotation.x = -Math.PI / 2;
      reflector.position.y = height;
      reflector.updateMatrixWorld();
      return { reflector, target: reflector.getRenderTarget(), projection: new THREE.Matrix4() };
    }) : [];
    this.inputs = {
      sceneColor: { value: null },
      sceneDepth: { value: null },
      projection: { value: camera.projectionMatrix },
      inverseProjection: { value: camera.projectionMatrixInverse },
      viewToWorld: { value: camera.matrixWorld },
      clipRange: { value: new THREE.Vector2(camera.near, camera.far) },
      pixelSize: { value: new THREE.Vector2(1, 1) },
    };
    this.clock = { value: 0 };
    this.viewUp = new THREE.Vector3();
    this.lamps = Array.from({ length: 6 }, () => new THREE.Vector4());
    this.tints = Array.from({ length: 6 }, () => new THREE.Color(0));
    this.position = new THREE.Vector3();
    const lighting = { ...this.inputs, time: this.clock, lamps: { value: this.lamps } };
    this.trace = hdr ? material(traceFragment, {
      ...lighting, viewUp: { value: this.viewUp },
      roadMirror: { value: this.mirrors[0].target.texture }, waterMirror: { value: this.mirrors[1].target.texture },
      roadProjection: { value: this.mirrors[0].projection }, waterProjection: { value: this.mirrors[1].projection },
    }) : null;
    this.composite = material(compositeFragment, {
      ...lighting, traced: { value: this.target?.texture ?? null }, raysActive: { value: false }, lampTint: { value: this.tints },
    });
    this.quad = new FullScreenQuad(this.composite);
  }

  setSize(width, height) {
    this.inputs.pixelSize.value.set(1 / width, 1 / height);
    this.target?.setSize(Math.max(1, Math.round(width * .5)), Math.max(1, Math.round(height * .5)));
    const scale = Math.min(.43, 640 / width);
    for (const mirror of this.mirrors) {
      mirror.target.setSize(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)));
    }
    this.mirrorsStale = true;
  }

  renderMirrors(renderer) {
    this.capture.copy(this.camera, false);
    this.capture.layers.disable(1);
    this.capture.zoom /= 1.22;
    this.capture.far = 1440;
    this.capture.updateProjectionMatrix();
    this.capture.updateMatrixWorld();
    if (this.mirrorsStale || !this.lastOrigin.equals(this.origin)) {
      for (const mirror of this.mirrors) this.renderMirror(renderer, mirror);
      this.lastOrigin.copy(this.origin);
      this.mirrorsStale = false;
    } else {
      // The last capture is reprojected while the other surface is refreshed.
      this.renderMirror(renderer, this.mirrors[this.mirrorIndex]);
      this.mirrorIndex = 1 - this.mirrorIndex;
    }
  }

  renderMirror(renderer, { reflector, projection }) {
    reflector.onBeforeRender(renderer, this.scene, this.capture);
    const reflected = reflector.getReflectionCamera(this.capture);
    projection.multiplyMatrices(reflected.projectionMatrix, reflected.matrixWorldInverse);
  }

  render(renderer, writeBuffer, readBuffer) {
    const camera = this.camera;
    this.inputs.sceneColor.value = readBuffer.texture;
    this.inputs.sceneDepth.value = readBuffer.depthTexture;
    const lights = this.fixtures();
    for (let i = 0; i < this.lamps.length; i++) {
      const light = lights[i];
      if (light && light.intensity > .2) {
        this.position.copy(light.position).applyMatrix4(camera.matrixWorldInverse);
        this.lamps[i].set(this.position.x, this.position.y, this.position.z, light.distance);
        this.tints[i].copy(light.color).multiplyScalar(Math.min(.24, light.intensity * .0017));
      } else this.lamps[i].w = 0;
    }
    const active = this.raysEnabled && this.trace !== null;
    this.composite.uniforms.raysActive.value = active;
    if (active) {
      this.renderMirrors(renderer);
      this.viewUp.set(0, 1, 0).transformDirection(camera.matrixWorldInverse);
      this.quad.material = this.trace;
      renderer.setRenderTarget(this.target);
      this.quad.render(renderer);
    } else {
      this.mirrorsStale = true;
    }
    this.quad.material = this.composite;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }

  dispose() {
    for (const { reflector } of this.mirrors) {
      reflector.dispose();
      reflector.geometry.dispose();
    }
    this.target?.dispose();
    this.trace?.dispose();
    this.composite.dispose();
    this.quad.dispose();
  }
}
