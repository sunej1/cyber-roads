export const waterSlope = /* glsl */ `
  vec2 waterSlope(vec2 position, float time) {
    // Integer frequencies preserve the ripples across a 640 m origin shift.
    vec2 p = position * (6.28318530718 / 640.0);
    float drift = sin(dot(p, vec2(13.0, 7.0)) + time*.47)*1.57;
    float swell = cos(dot(p, vec2(17.0, 58.0)) - time*1.42 + drift);
    float crossWave = cos(dot(p, vec2(-49.0, 67.0)) - time*2.34 + swell*.74);
    float chop = cos(dot(p, vec2(109.0, 193.0)) - time*3.69 + swell*.78 + crossWave*.53);
    return swell*vec2(.025,.084) + crossWave*vec2(-.054,.073) + chop*vec2(.022,.039);
  }
`;
