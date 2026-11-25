export const blockWidth = 136;
export const blockDepth = 125;
export const park = { x: 10, z: 105, w: 228, d: 174 };
export const plaza = { x: -220, z: 355, w: 142, d: 135 };

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
const avenues = [
  ...Array.from({ length:12 },(_,i)=>{
    const center=(i-6)*blockWidth+blockWidth/2;
    return { horizontal:false,center,kind:northSouth.includes(center)?'avenue':'street',
      start:center>540?160:-800+Math.max(0,-center-490)*.6,
      end:center===-204?925:center>430?620:center<-540?730:888 };
  }),
  ...Array.from({ length:13 },(_,i)=>{
    const center=(i-6)*blockDepth+blockDepth/2;
    return { horizontal:true,center,kind:crossTown.includes(center)?'avenue':'street',
      start:Math.abs(center)>660?-668:-925,end:center>650?391:center>150?641:553 };
  }),
  { horizontal:true,center:925,start:-530,end:327,kind:'avenue' },
];

export const streets = avenues.flatMap(road=>{
  const { horizontal,center,kind }=road;
  const width=kind==='avenue' ? 22 : horizontal ? 12 : 14;
  const open = across => {
    const [x,z]=horizontal?[across,center]:[center,across];
    return isOnLand(x,z) && ![park,plaza].some(space=>
      Math.abs(x-space.x)<space.w/2+(horizontal?4:width/2+4)
      && Math.abs(z-space.z)<space.d/2+(horizontal?width/2+4:4));
  };
  const runs=[];
  let start=null;
  for (let across=road.start;across<=road.end+4;across+=4) {
    const end=Math.min(across,road.end);
    if (across<road.end && open(across)) {
      if (start===null) start=across;
    } else if (start!==null) {
      if (end-start>34) runs.push({ ...road,width,start,end:open(end)?end:end-4 });
      start=null;
    }
  }
  return runs;
});

export function streetFront(building) {
  const { x,z,w,d }=building;
  let front=null;
  for (const road of streets) {
    const along=road.horizontal?x:z;
    const span=(road.horizontal?w:d)/2;
    if (along+span<road.start || along-span>road.end) continue;
    const facing=road.center-(road.horizontal?z:x);
    const gap=Math.abs(facing)-(road.horizontal?d:w)/2-road.width/2;
    if (gap<3) return null;
    if (along<road.start || along>road.end || gap>49) continue;
    const rank=gap-(road.kind==='avenue'?3:0);
    if (!front || rank<front.rank) {
      const yaw=road.horizontal ? (facing>0?0:Math.PI) : Math.sign(facing)*Math.PI/2;
      front={ road,gap,rank,yaw };
    }
  }
  return front;
}
