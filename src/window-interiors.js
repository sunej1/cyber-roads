const interiors = /* glsl */ `
  uniform vec4 roomBay;
  uniform vec3 roomPanel;

  float roomHash(vec2 cell) {
    vec3 p=fract(vec3(cell.xyx)*.1031);
    p+=dot(p,p.yzx+33.33);
    return fract((p.x+p.y)*p.z);
  }

  void openWindow(vec2 uv,vec3 view,vec3 normal,inout vec3 paint,inout vec3 emission,
      inout float rough,inout float metal) {
    vec2 grid=vec2(uv.x,-uv.y)*roomBay.xy;
    vec2 changeX=dFdx(grid), changeY=dFdy(grid);
    vec3 surfaceX=dFdx(-view), surfaceY=dFdy(-view);
    float detail=1.0-smoothstep(.17,.40,max(length(changeX),length(changeY)));
    vec2 cell=floor(grid), pane=fract(grid);
    float row=mod(cell.y,roomBay.y);
    float slab=roomPanel.x>.5 ? .29 : mod(row,4.0)==2.0 ? .21 : .115;
    vec2 start=vec2(roomPanel.y,slab+.056);
    vec2 opening=vec2(1.0-2.0*start.x,.83-slab);
    vec2 at=(pane-start)/opening;
    if (detail<=0.0 || any(lessThan(at,vec2(0.0))) || any(greaterThan(at,vec2(1.0)))
        || abs(pane.x-.533)<.021) return;

    float orientation=sign(changeX.x*changeY.y-changeX.y*changeY.x);
    vec3 across=normalize(surfaceX*changeY.y-surfaceY*changeX.y)*orientation;
    vec3 down=normalize(surfaceY*changeX.x-surfaceX*changeY.x)*orientation;
    vec3 aim=-normalize(view);
    float downGlass=clamp(-dot(aim,normal),.045,1.0);
    float variant=roomHash(cell+roomPanel.zz);
    vec3 ray=vec3(dot(aim,across)/(opening.x*roomBay.z),dot(aim,down)/(opening.y*roomBay.w),
      downGlass/mix(2.05,4.5,variant));
    vec2 safeRay=mix(vec2(-1.0),vec2(1.0),step(0.0,ray.xy))*max(abs(ray.xy),vec2(.0001));
    vec2 sides=(step(0.0,ray.xy)-at)/safeRay;
    float farWall=1.0/ray.z;
    float hit=min(min(sides.x,sides.y),farWall);
    vec3 room=vec3(at,0.0)+ray*hit;

    float ceiling=step(room.y,.002);
    float floorHit=step(.998,room.y);
    float strip=1.0-smoothstep(.043,.087,abs(room.x-.49));
    float fixtures=strip*smoothstep(.19,.27,room.z)*(1.0-smoothstep(.71,.80,room.z));
    float baseboard=smoothstep(.84,.91,room.y);
    float rear=step(.998,room.z);
    float wallPanel=smoothstep(.19,.21,room.x)*(1.0-smoothstep(.68,.70,room.x))
      *smoothstep(.29,.31,room.y)*(1.0-smoothstep(.59,.62,room.y))*rear;
    float brightness=(.24+.35*room.z+.13*rear)*(1.0-.41*baseboard-.23*wallPanel);
    brightness=mix(brightness,.35+.78*fixtures,ceiling);
    brightness=mix(brightness,.22+.16*room.z,floorHit);

    vec2 furniture=at+ray.xy*(.58/ray.z);
    float desk=smoothstep(.56,.59,furniture.y)*(1.0-smoothstep(.69,.71,furniture.y));
    desk*=smoothstep(.12,.14,furniture.x)*(1.0-smoothstep(.85,.88,furniture.x));
    float divider=(1.0-smoothstep(.09,.116,abs(furniture.x-mix(.24,.74,variant))))
      *smoothstep(.40,.43,furniture.y)*(1.0-smoothstep(.72,.74,furniture.y));
    float occupied=step(.58,variant)*step(.59,room.z);
    brightness*=1.0-occupied*max(desk*.74,divider*.65);

    float shadeDepth=variant<.25 ? .29+variant*2.27 : .0;
    float shade=(1.0-smoothstep(shadeDepth-.018,shadeDepth+.018,at.y))*step(.02,shadeDepth);
    float louvers=.44+.56*smoothstep(.19,.47,fract(at.y*15.0));
    vec2 lightSample=(cell+vec2(.39,start.y+opening.y*.27))/roomBay.xy;
    vec3 roomLight=textureLod(emissiveMap,vec2(lightSample.x,-lightSample.y),0.0).rgb;
    float through=1.0-pow(1.0-downGlass,2.65);
    vec3 inside=roomLight*(brightness*(1.0-shade*.91) + shade*louvers*.06);
    vec3 glazing=vec3(.035,.055,.075)*mix(.49,1.4,variant)*(1.0-through*.62);
    paint=mix(paint,glazing+shade*louvers*vec3(.054,.049,.041),detail);
    emission=mix(emission,inside*through,detail);
    rough=mix(rough,mix(.15,.31,variant),detail);
    metal=mix(metal,.31,detail);
  }
`;

export function addWindowInteriors(material, bay, panel) {
  material.onBeforeCompile = shader => {
    shader.uniforms.roomBay = { value: bay };
    shader.uniforms.roomPanel = { value: panel };
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', `${interiors}\nvoid main() {`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        openWindow(vMapUv,vViewPosition,nonPerturbedNormal,diffuseColor.rgb,totalEmissiveRadiance,
          roughnessFactor,metalnessFactor);`);
  };
}
