import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detailHierarchy, projectedError, selectDetailClusters } from '../src/detail-selection.js';

const wall = (x, z, kind='facade') => ({x,y:7,z,radius:3,nx:0,nz:1,error:.6,fineRatio:.5,kind});
const viewAt = ({x=0,y=7,z=0,contains=()=>true} = {}) => ({x,y,z,contains,focalPixels:600});

test('the hierarchy encloses complete facade clusters after shifting their tile into world space', () => {
  const roots=detailHierarchy([wall(11,13),wall(19,40),wall(181,2)],640,-640);
  assert.equal(roots.length,2);
  assert.equal(roots[0].children[0].x,651);
  assert.equal(roots[0].children[0].z,-627);
  for (const {x,y,z,radius,children} of roots) {
    for (const child of children) {
      assert.ok(Math.hypot(child.x-x,child.y-y,child.z-z)+child.radius <= radius);
    }
  }
  assert.ok(projectedError(.7,3,40,600)>projectedError(.7,3,120,600));
});

test('selection culls hidden clusters, prioritizes near storefronts and caps the finest tier', () => {
  const roots=detailHierarchy([wall(0,-18,'store'),wall(3,-21),wall(21,-29),wall(58,-26),wall(0,17),wall(0,-410)]);
  const view=viewAt({contains:node=>!node.kind || node.x<50});
  const chosen=selectDetailClusters([roots],view,new Map(),{total:2,fine:1});
  assert.deepEqual([...chosen].map(([part,tier])=>[part.kind,tier]),[['store',2],['facade',1]]);
});

test('detail stays resident within the projected error hysteresis band',()=>{
  const roots=detailHierarchy([wall(0,-197)]);
  const [cluster]=roots[0].children;
  const caps={total:4,fine:2};
  assert.equal(selectDetailClusters([roots],viewAt(),new Map(),caps).size,0);
  assert.equal(selectDetailClusters([roots],viewAt(),new Map([[cluster,1]]),caps).get(cluster),1);
  assert.equal(selectDetailClusters([roots],viewAt({z:43}),new Map([[cluster,1]]),caps).size,0);
});
