import test from 'node:test';
import assert from 'node:assert/strict';
import { towerMasses } from '../src/megabuildings.js';

test('the new skyline families have different outlines inside their collision envelopes', () => {
  for (const h of [27, 73, 74, 210]) {
    for (const type of [2, 9]) {
      const outlines = new Set();
      for (let style=0; style<6; style++) {
        const building={h,type,style};
        const masses=towerMasses(building);
        assert.deepEqual(towerMasses(building),masses);
        assert.equal(masses[0].from,0);
        assert.equal(Math.max(...masses.map(({to})=>to)),1);
        assert.ok(masses.some(mass=>mass.skin));
        assert.ok(masses.some(mass=>!mass.skin && mass.from>0));
        for (const {from,to,w,d,shift=0,slide=0,lean=0,topW=w,topD=d} of masses) {
          assert.ok(from>=0 && from<to && to<=1);
          assert.ok(Math.abs(shift)+w/2<=.5 && Math.abs(shift+lean)+topW/2<=.5);
          assert.ok(Math.abs(slide)+Math.max(d,topD)/2<=.5);
        }
        outlines.add(JSON.stringify(masses.map(({skin,...form})=>form)));
      }
      assert.equal(outlines.size,6);
    }
  }
});
