export function projectedError(error, radius, distance, focalPixels) {
  return error * focalPixels / Math.max(1.5, distance - radius);
}

export function detailHierarchy(surfaces, offsetX = 0, offsetZ = 0) {
  const cells = new Map();
  for (const surface of surfaces) {
    const child = { ...surface, x: surface.x + offsetX, z: surface.z + offsetZ, offsetX, offsetZ };
    const key = `${Math.floor(child.x/128)}/${Math.floor(child.z/128)}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(child);
  }
  return [...cells.values()].map(children => {
    const x = children.reduce((sum, child) => sum + child.x, 0) / children.length;
    const y = children.reduce((sum, child) => sum + child.y, 0) / children.length;
    const z = children.reduce((sum, child) => sum + child.z, 0) / children.length;
    const radius = Math.max(...children.map(child => Math.hypot(child.x-x,child.y-y,child.z-z)+child.radius));
    return { x,y,z,radius,children,error:Math.max(...children.map(child=>child.error)) };
  });
}

export function selectDetailClusters(hierarchies, view, previous, limits) {
  const result = [];
  const score = node => projectedError(node.error,node.radius,Math.hypot(node.x-view.x,node.y-view.y,node.z-view.z),view.focalPixels);
  for (const roots of hierarchies) for (const root of roots) {
    if (score(root)<1.52 || !view.contains(root)) continue;
    for (const cluster of root.children) {
      const dx=view.x-cluster.x,dz=view.z-cluster.z;
      const facing=dx*cluster.nx + dz*cluster.nz;
      if (facing < -6 || !view.contains(cluster)) continue;
      const old=previous.get(cluster) ?? 0;
      const weight=score(cluster);
      if (weight < (old ? 1.63 : 2.32)) continue;
      const detail=weight*cluster.fineRatio;
      result.push({
        cluster, score:weight*(cluster.kind==='store'?1.25:1),
        fine:detail>=(old===2?2.08:2.9),
      });
    }
  }
  result.sort((a,b)=>b.score-a.score);
  let fineRemaining=limits.fine;
  const selected=new Map();
  for (const {cluster,fine} of result.slice(0,limits.total)) {
    const upgraded=fine && fineRemaining>0;
    selected.set(cluster,upgraded?2:1);
    if (upgraded) fineRemaining--;
  }
  return selected;
}
