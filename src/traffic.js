import { CatmullRomCurve3, Vector3 } from 'three';
import { intersectsBuilding, routeSamples } from './flight.js';
import { streetPoint, streets } from './meridian-plan.js';

const circuitPlans = [
  // The inbound and outbound airport patterns run at different heights through the harbor.
  { count: 15, speed: 43, points: [[-280,45,1075],[-252,49,785],[-248,52,492],[-250,50,272],[-162,54,110],
    [16,47,94],[248,56,126],[454,65,300],[517,68,562],[311,65,865],[104,59,1095],[-111,49,1157]] },
  { count: 12, speed: 50, points: [[-56,153,1150],[26,160,893],[52,161,631],[139,146,405],[301,128,184],
    [280,148,-100],[94,160,-353],[-213,174,-427],[-540,168,-220],[-653,161,134],[-568,145,540],[-441,136,912],[-302,133,1158]] },
  { count: 12, speed: 49, points: [[-791,95,404],[-552,85,456],[-266,61,474],[8,57,480],[253,62,479],
    [530,82,471],[738,87,391],[790,90,161],[599,88,-52],[333,80,-27],[93,75,-19],[-183,71,-11],[-462,93,-38],[-747,105,96]] },
  { count: 13, speed: 62, points: [[-1015,133,526],[-1064,144,86],[-970,158,-449],[-758,173,-785],
    [-326,197,-955],[165,215,-970],[592,227,-852],[901,214,-613],[970,181,-193],[884,148,210],
    [805,121,620],[535,115,898],[140,100,1065],[-302,96,1078],[-742,111,870]] },
  { count: 14, speed: 61, points: [[-524,255,762],[-179,253,823],[140,272,788],[472,271,523],[643,270,131],
    [556,271,-350],[318,241,-648],[-49,229,-697],[-425,229,-512],[-652,242,-141],[-725,241,304]] },
  { count: 9, speed: 39, points: [[1071,76,-534],[1151,73,-191],[1100,68,186],[962,62,527],[722,58,847],
    [479,47,1031],[675,60,1113],[1028,78,844],[1274,96,412],[1352,109,-65],[1269,102,-473]] },
];

export function airCircuits(buildings) {
  const collisionBounds = buildings.map(building => ({ ...building, h: building.h + 18 }));
  return circuitPlans.map(({ points, count, speed }) => {
    const nominal = new CatmullRomCurve3(points.map(point => new Vector3(...point)), true);
    nominal.arcLengthDivisions = 720;
    const samples = nominal.getSpacedPoints(Math.ceil(nominal.getLength() / 7)).slice(0, -1);
    // Reserve room for the whole shuttle and for decoration above the tower collision proxy.
    for (const point of samples) {
      for (const b of collisionBounds) {
        if (intersectsBuilding(point, b, 13)) point.y = b.h + 14;
      }
      for (const guide of routeSamples) {
        if (Math.abs(guide.x - point.x) < 19 && Math.abs(guide.z - point.z) < 19
          && Math.abs(guide.y - point.y) < 30) point.y = guide.y + 33;
      }
    }
    // Spread climbs across adjacent segments so successive rooftop passes read as one flight path.
    for (const direction of [1, -1]) {
      const total = samples.length;
      for (let i = 0; i < total * 2; i++) {
        const at = (total + (i * direction) % total) % total;
        const next = (at + direction + total) % total;
        const gap = Math.hypot(samples[at].x - samples[next].x, samples[at].z - samples[next].z);
        samples[next].y = Math.max(samples[next].y, samples[at].y - gap * .26);
      }
    }
    const curve = new CatmullRomCurve3(samples, true);
    curve.arcLengthDivisions = samples.length * 2;
    return { count, speed, curve, length: curve.getLength() };
  });
}

export function streetRuns() {
  return streets.filter(road=>road.length>100).flatMap(road=>{
    const [x,z]=streetPoint(road,8), [toX,toZ]=streetPoint(road,road.length-8);
    const path={x,z,toX,toZ,kind:road.kind};
    return [-1,1].map(direction=>({ start:0,end:road.length-16,path,direction }));
  });
}
