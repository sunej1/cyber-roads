import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PerspectiveCamera, Scene, Vector3 } from 'three';
import { RayLightingPass } from '../src/ray-lighting.js';

test('a continuous axial rebase preserves the road schedule and translates only a fresh water capture', () => {
  const camera=new PerspectiveCamera(), origin=new Vector3(0,0,1920);
  const pass=new RayLightingPass(new Scene(),camera,()=>[],true,origin);
  const calls=[];
  pass.renderMirror=(_renderer,mirror)=>{
    calls.push(pass.mirrors.indexOf(mirror));
    mirror.projection.identity();
  };
  const render=(z,offset,angle=0)=>{
    origin.z=offset;
    camera.position.set(169,23,z-offset);
    camera.rotation.x=angle;
    pass.renderMirrors();
    return calls.splice(0);
  };
  try {
    assert.deepEqual(render(2239.7,1920),[0,1]);
    assert.deepEqual(render(2239.7,1920),[0]);
    assert.deepEqual(render(2239.7,1920),[1]);
    assert.deepEqual(render(2240.1,2560),[0]);
    assert.equal(pass.mirrors[1].projection.elements[14],640);
    assert.deepEqual(render(2239.7,1920),[0,1]);
    assert.deepEqual(render(2240.1,2560,.10),[0,1]);
    assert.deepEqual(render(2239.7,1920,.10),[0]);
    pass.setSize(1088,680);
    assert.deepEqual(render(2240.1,2560,.10),[0,1]);
    assert.deepEqual(render(2240.8,2560,.10),[0]);
    assert.deepEqual(render(2241.4,2560,.10),[1]);
  } finally {
    pass.dispose();
  }
});
