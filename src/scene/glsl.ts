// Every surface is lit by the same analytic car lights, so terrain, road, reflectors and signs
// all fall off together. There are no three.js lights anywhere.

export const COMMON = /* glsl */ `
uniform vec3 uCar, uCarF, uCarR, uCarU, uSunDir;
uniform float uSpeed, uBrake, uTime, uLights, uTail, uHigh, uAmb, uDawn, uEmberY, uEmberA, uFogN, uFogF, uDpr, uCarS;
const vec3 BONE = vec3(0.913, 0.894, 0.847);
const vec3 ACCENT = vec3(1.0, 0.23, 0.13);

// One low-beam lamp: a wide flood under a crisp cut-off, a hot core, inverse-square falloff.
float lobe(vec3 p, vec3 lp) {
  vec3 v = p - lp;
  float f = dot(v, uCarF);
  if (f < 0.05) return 0.0;
  float x = dot(v, uCarR) / f;
  float y = dot(v, uCarU) / f;
  float d2 = dot(v, v);
  float cut = 0.012 + uHigh * 0.18;
  float flood = smoothstep(0.95, 0.15, abs(x)) * smoothstep(cut + 0.03, cut - 0.02, y);
  float yy = (y + 0.028 - uHigh * 0.04) / 0.05;
  float core = exp(-x * x * 9.0) * exp(-yy * yy);
  float fall = 1.0 / (1.0 + d2 * 0.0011) * exp(-sqrt(d2) * 0.0065);
  return (flood * 0.7 + core * 1.6) * fall;
}

float headlights(vec3 p) {
  vec3 base = uCar + uCarF * 2.15 + uCarU * 0.66;
  return (lobe(p, base - uCarR * 0.62) + lobe(p, base + uCarR * 0.62)) * uLights * (1.0 + uHigh * 0.9);
}

// Taillight spill: a warm wash on the road just behind the car.
float tailglow(vec3 p) {
  vec3 tp = uCar - uCarF * 2.35 + uCarU * 0.9;
  vec3 v = p - tp;
  float back = smoothstep(0.8, -1.2, dot(v, uCarF));
  return back / (1.0 + dot(v, v) * 0.35) * (0.16 + uBrake * 0.5) * uTail;
}

float fogAmount(float dist) {
  return smoothstep(uFogN, uFogF, dist);
}

// ---- Dawn ----
// One palette for the sky, the haze, the clouds and the sunlit ground, so the sunrise reads as
// one light. Stages overlap: deep red first, then orange, then gold.
vec3 dawnHorizon(float d) {
  vec3 c = vec3(0.028, 0.03, 0.036);
  c = mix(c, vec3(0.30, 0.07, 0.06), smoothstep(0.14, 0.42, d));
  c = mix(c, vec3(0.95, 0.38, 0.16), smoothstep(0.3, 0.75, d));
  c = mix(c, vec3(1.0, 0.72, 0.42), smoothstep(0.65, 1.0, d));
  return c;
}
vec3 dawnZenith(float d) {
  vec3 c = vec3(0.0);
  c = mix(c, vec3(0.03, 0.03, 0.08), smoothstep(0.1, 0.5, d));
  c = mix(c, vec3(0.09, 0.11, 0.24), smoothstep(0.5, 1.0, d));
  return c;
}
vec3 sunColor(float d) {
  return mix(vec3(1.0, 0.32, 0.12), vec3(1.0, 0.82, 0.6), smoothstep(0.45, 1.0, d)) * smoothstep(0.25, 0.75, d);
}
// The haze that distance fades into: black at night, the horizon colour by morning, warmer toward the sun.
vec3 hazeColor(vec3 dir) {
  float toward = pow(max(dot(normalize(vec3(dir.x, 0.0, dir.z)), normalize(vec3(uSunDir.x, 0.0, uSunDir.z))), 0.0), 3.0);
  return dawnHorizon(uDawn) * (0.55 + 0.45 * toward);
}
`
