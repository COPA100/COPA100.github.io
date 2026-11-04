import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { invalidate, useFrame } from '@react-three/fiber'
import { U, drive } from '../lib/state'
import type { Buffers } from '../world/build'
import { terrainJob } from '../world/terrainJob'
import { COMMON } from './glsl'
import { CLOUD_Y } from '../world/terrain'

const vert = /* glsl */ `
  varying vec3 vP;
  varying vec3 vN;
  varying float vDist;
  void main() {
    vP = position;
    vN = normal;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vDist = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

const frag = /* glsl */ `
  precision highp float;
  ${COMMON}
  uniform float uAppear, uCloud;
  varying vec3 vP;
  varying vec3 vN;
  varying float vDist;

  // Anti-aliased isoline of constant pixel width that thins out before it can moire.
  float iso(float h, float w, float interval, float px) {
    float d = abs(fract(h / interval - 0.5) - 0.5) * interval / max(w, 1e-4);
    float a = 1.0 - smoothstep(px * 0.5, px * 0.5 + 1.0, d);
    return a * (1.0 - smoothstep(0.1, 0.32, w / interval));
  }

  void main() {
    float h = vP.y;
    float w = fwidth(h);
    vec3 N = normalize(vN);
    float px = uDpr;

    float micro = iso(h, w, 1.25, 0.7 * px);
    float minor = iso(h, w, 5.0, 0.8 * px);
    float mid = iso(h, w, 25.0, 1.05 * px);
    float index = iso(h, w, 100.0, 1.3 * px);

    // Steep ground: cut and fill banks are often only a few metres tall, so they fall between the
    // 5 m lines. Give them the 1.25 m lines too, so a road cut keeps the survey's character.
    float steep = smoothstep(0.3, 0.75, 1.0 - N.y);
    // Only near the road, where cuts are seen up close; far away they would just add noise.
    float microAmb = micro * steep * (1.0 - smoothstep(120.0, 320.0, vDist));

    // Night, but legible: the survey lines hold faintly everywhere; the beams make them bright.
    // As the sun comes up the survey fades out and the real ground shows through.
    float survey = 1.0 - smoothstep(0.25, 0.75, uDawn);
    float amb = max(max(minor * 0.42, mid * 0.7), max(index * 0.95, microAmb * 0.55));
    float hl = headlights(vP);
    float lit = min(hl * 5.0, 2.4);
    float beamLines = max(max(minor, mid), max(index, micro * 0.55));
    // The opening pulse maps the mountain into existence: lines light up behind its front.
    float line = (amb * uAmb * pulseReveal(vP) + beamLines * lit) * survey;
    line += max(max(minor, mid), index) * pulseFront(vP) * 2.4;

    // A faint raking fill, so the ground has form where the lines are sparse.
    float key = max(dot(N, normalize(vec3(-0.5, 0.55, -0.62))), 0.0);
    vec3 fill = vec3(0.010, 0.011, 0.013) + vec3(0.022, 0.023, 0.026) * key * key * uAmb;
    fill += vec3(1.0, 0.96, 0.9) * min(hl, 3.0) * (0.03 + 0.05 * (1.0 - N.y));
    fill += vec3(0.016, 0.016, 0.018) * steep * (0.35 + 0.65 * key) * uAmb;
    vec3 col = fill + BONE * line;
    col += ACCENT * tailglow(vP) * 0.5;

    // Daylight: low sun on dark rock and scrub, the sky filling the shadows.
    float day = smoothstep(0.2, 0.85, uDawn);
    vec3 S = normalize(uSunDir);
    float ndl = max(dot(N, S), 0.0);
    vec3 albedo = mix(vec3(0.10, 0.085, 0.075), vec3(0.13, 0.12, 0.10), steep);
    vec3 skyFill = (dawnZenith(uDawn) * 1.4 + dawnHorizon(uDawn) * 0.12) * (0.55 + 0.45 * N.y);
    col += albedo * (sunColor(uDawn) * ndl * 2.4 + skyFill) * day;

    // The car's altitude, one warm contour around the whole mountain, for the wide shots.
    float dA = abs(h - uEmberY) / max(w, 1e-4);
    float core = 1.0 - smoothstep(0.8 * px, 1.8 * px, dA);
    float halo = exp(-dA / (7.0 * px)) * 0.3;
    float under = exp(-max(uEmberY - h, 0.0) / 30.0) * step(h, uEmberY) * 0.08;
    col += ACCENT * (core + halo + under) * uEmberA * (1.0 - smoothstep(0.4, 1.4, w));

    vec3 view = normalize(vP - cameraPosition);
    vec3 haze = hazeColor(view);
    // Where the slopes meet the cloud deck they go soft, as if the cloud wells up against them.
    // Far off, whole peaks standing out of the deck sink into it too, so none reads as a bare shard.
    float wellsUp = mix(70.0, 190.0, smoothstep(250.0, 900.0, vDist));
    float mist = smoothstep(${CLOUD_Y}.0 + wellsUp, ${CLOUD_Y - 5}.0, h) * smoothstep(0.05, 0.6, uDawn) * step(0.5, uCloud);
    col = mix(col, haze * 0.9, mist * 0.85);

    float fog = fogAmount(vDist);
    col = mix(col, haze, fog);
    gl_FragColor = vec4(col * uAppear, 1.0);
  }
`

const appear = { value: 0 }
// Shared with the cloud deck: the terrain only mists over once the deck is there.
export const cloudK = { value: 0 }

export const terrainMaterial = new THREE.ShaderMaterial({
  vertexShader: vert,
  fragmentShader: frag,
  uniforms: { ...U, uAppear: appear, uCloud: cloudK },
  extensions: { derivatives: true } as never,
})

function toGeometry(b: Buffers, g: THREE.BufferGeometry) {
  g.setAttribute('position', new THREE.BufferAttribute(b.position, 3))
  g.setAttribute('normal', new THREE.BufferAttribute(b.normal, 3))
  g.setIndex(new THREE.BufferAttribute(b.index, 1))
}

export function Terrain() {
  const coarse = useMemo(() => new THREE.BufferGeometry(), [])
  const strip = useMemo(() => new THREE.BufferGeometry(), [])
  const ready = useRef(false)
  const start = useRef(-1)

  useEffect(() => {
    const done = (c: Buffers, s: Buffers) => {
      toGeometry(c, coarse)
      toGeometry(s, strip)
      ready.current = true
      drive.ready = true
      invalidate()
    }
    let live = true
    terrainJob.then((t) => {
      if (!live) return
      ;(window as unknown as { __terrainMs: number }).__terrainMs = t.ms
      done(t.coarse, t.strip)
    })
    return () => {
      live = false
    }
  }, [coarse, strip])

  const stripRef = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    if (import.meta.env.DEV && stripRef.current) stripRef.current.visible = !(window as unknown as { __noStrip?: boolean }).__noStrip
    if (!ready.current) return
    if (start.current < 0) start.current = clock.elapsedTime
    appear.value = Math.min(1, (clock.elapsedTime - start.current) / 0.9)
  })

  return (
    <group>
      <mesh geometry={coarse} material={terrainMaterial} frustumCulled={false} />
      <mesh ref={stripRef} geometry={strip} material={terrainMaterial} frustumCulled={false} />
    </group>
  )
}
