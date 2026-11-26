const blockWidth = 136;
const blockDepth = 125;
export const park = { x: 10, z: 105, w: 228, d: 174 };
export const plaza = { x: -220, z: 355, w: 142, d: 135 };
export const harborMarket = { x: -145, z: 901, w: 330, d: 24 };

export const gardenWalks = [
  { x: -68, z: 12, toX: -68, toZ: 196, width: 8, walkers: 6 },
  { x: 68, z: 12, toX: 68, toZ: 196, width: 8, walkers: 6 },
  { x: -109, z: 62.5, toX: 131, toZ: 62.5, width: 10, walkers: 7 },
  { x: -109, z: 187.5, toX: 131, toZ: 187.5, width: 6, walkers: 4 },
  { x: 0, z: 62.5, toX: 0, toZ: 187.5, width: 10 },
  { x: -68, z: 125, toX: 68, toZ: 125, width: 7 },
];

export const gardenBasins = [-33, 33].flatMap(x => [94, 156].map(z => ({ x, z, w: 45, d: 39 })));

export const shore = [
  [-1080, 560], [-1040, 100], [-980, -490], [-718, -805], [-440, -995],
  [15, -1020], [440, -940], [720, -680], [705, -310], [622, -80],
  [704, 184], [832, 477], [715, 660], [427, 731], [400, 916],
  [62, 979], [-256, 971], [-545, 936], [-817, 771],
];

export function isOnLand(x, z) {
  let inside = false;
  for (let i=0,j=shore.length-1;i<shore.length;j=i++) {
    const [leftX,leftZ] = shore[j], [rightX,rightZ] = shore[i];
    if ((leftZ>z)!==(rightZ>z) && x<leftX+(rightX-leftX)*(z-leftZ)/(rightZ-leftZ)) inside=!inside;
  }
  return inside;
}

const northSouth = [-204,204];
const crossTown = [-312.5,-62.5,562.5];
const northQuay = [[-476,-812.5],[-340,-918],[68,-956],[340,-912],[476,-812.5]];
const eastQuay = [[630,-687.5],[654,-480],[612,-250],[588,-62.5],[612,187.5],
  [748,437.5],[612,620],[385,690],[340,812.5]];
function edgeAt(points, along, axis) {
  const i=points.findIndex(point=>point[axis]>=along);
  if (i===0) return points[0][1-axis];
  const start=points[i-1], end=points[i];
  const t=(along-start[axis])/(end[axis]-start[axis]);
  return start[1-axis]+(end[1-axis]-start[1-axis])*t;
}
const gridPlan = [
  { horizontal:false,center:-884,start:-562.5,end:687.5,kind:'street' },
  ...Array.from({ length:12 },(_,i)=>{
    const center=(i-6)*blockWidth+blockWidth/2;
    return { horizontal:false,center,kind:northSouth.includes(center)?'avenue':'street',
      start:center>=-476 && center<=476 ? edgeAt(northQuay,center,0)
        : center>540 ? 187.5 : -800+Math.max(0,-center-490)*.6,
      end:center===-204?925:center>430?620:center<-540?730:888 };
  }),
  ...Array.from({ length:13 },(_,i)=>{
    const center=(i-6)*blockDepth+blockDepth/2;
    return { horizontal:true,center,kind:crossTown.includes(center)?'avenue':'street',
      start:center===-687.5?-668:center===687.5?-884:center===812.5?-668:-925,
      end:center>=-687.5 && center<187.5 ? edgeAt(eastQuay,center,1)
        : center>650 ? 391 : center>150 ? 641 : 553 };
  }),
  { horizontal:true,center:-812.5,start:-476,end:476,kind:'street' },
  { horizontal:true,center:925,start:-530,end:327,kind:'avenue' },
];

function makeStreet(x,z,toX,toZ,kind,width) {
  const length=Math.hypot(toX-x,toZ-z);
  const dx=(toX-x)/length, dz=(toZ-z)/length;
  return { x,z,toX,toZ,kind,width,length,dx,dz,yaw:Math.atan2(dx,dz) };
}

const grid = gridPlan.flatMap(road=>{
  const { horizontal,center,kind }=road;
  const width=kind==='avenue' ? 22 : horizontal ? 12 : 14;
  const point = across => horizontal?[across,center]:[center,across];
  const open = across => {
    const [x,z]=point(across);
    const margin=width/2+3;
    return [-margin,margin].every(offset=>isOnLand(x+(horizontal?0:offset),z+(horizontal?offset:0)))
      && ![park,plaza].some(space=>
      Math.abs(x-space.x)<space.w/2+(horizontal?4:width/2+4)
      && Math.abs(z-space.z)<space.d/2+(horizontal?width/2+4:4));
  };
  const runs=[];
  const firstSample=horizontal?road.start+4:Math.floor(road.start/4)*4+4;
  let start=null, last=null;
  for (let across=road.start; ; across=Math.min(across===road.start?firstSample:across+4,road.end)) {
    const clear=open(across);
    if (clear) {
      if (start===null) start=across;
      last=across;
    }
    if ((!clear || across===road.end) && start!==null) {
      if (last-start>34) runs.push(makeStreet(...point(start),...point(last),kind,width));
      start=null;
    }
    if (across===road.end) break;
  }
  return runs;
});

const connect = (points,kind,width) => points.slice(1).map(([x,z],i)=>
  makeStreet(...points[i],x,z,kind,width));

export const streets = [
  ...grid,
  ...connect([[-748,-312.5],[-340,187.5]],'avenue',25),
  ...connect([[204,-562.5],[612,187.5]],'avenue',25),
  ...connect(eastQuay,'quay',18),
  ...connect(northQuay,'quay',16),
];

export function streetPoint(road, along, offset = 0) {
  return [road.x+road.dx*along+road.dz*offset,road.z+road.dz*along-road.dx*offset];
}

function sectionsBetweenJunctions(road, offset = 0) {
  const sections=[];
  let start=0;
  for (const { along, clearance, skew } of road.junctions) {
    const halfGap=clearance+skew*offset;
    if (along-halfGap>start) sections.push([start,along-halfGap]);
    start=Math.max(start,along+halfGap);
  }
  if (start<road.length) sections.push([start,road.length]);
  return sections;
}

for (const road of streets) {
  road.junctions = streets.flatMap(other=>{
    const cross=road.dx*other.dz-road.dz*other.dx;
    if (Math.abs(cross)<.01) return [];
    const x=other.x-road.x, z=other.z-road.z;
    const along=(x*other.dz-z*other.dx)/cross;
    const across=(x*road.dz-z*road.dx)/cross;
    if (along<-.01 || along>road.length+.01 || across<-.01 || across>other.length+.01) return [];
    return [{ along, clearance:(other.width/2+3)/Math.abs(cross),
      skew:Math.abs((road.dx*other.dx+road.dz*other.dz)/cross) }];
  }).sort((a,b)=>a.along-b.along);
  road.sections=sectionsBetweenJunctions(road);
  road.markedSections=sectionsBetweenJunctions(road,road.width/2+3);
}
