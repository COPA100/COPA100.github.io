import { useMemo } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { quality } from '../lib/tier'
import { U, drive } from '../lib/state'

// A dome with a barely-there horizon, and a seeded field of stars that opens up as you climb.
export function Sky() {
  const { dome, stars } = useMemo(() => {
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(9000, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: false,
        uniforms: { uMap: U.uMap },
        vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
        fragmentShader: `precision highp float; uniform float uMap; varying vec3 vD;
          void main(){
            float h = vD.y;
            vec3 c = mix(vec3(0.028, 0.03, 0.036), vec3(0.0), smoothstep(-0.02, 0.32, h));
            gl_FragColor = vec4(c * (1.0 - uMap), 1.0);
          }`,
      }),
    )
    dome.frustumCulled = false
    dome.renderOrder = -10

    const n = quality.stars
    const pos = new Float32Array(n * 3)
    const size = new Float32Array(n)
    let seed = 91
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2
      const e = Math.pow(rnd(), 0.75) * 1.45 + 0.03
      pos.set([Math.cos(a) * Math.cos(e) * 8000, Math.sin(e) * 8000, Math.sin(a) * Math.cos(e) * 8000], i * 3)
      size[i] = 0.5 + Math.pow(rnd(), 5) * 2.2
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1))
    const m = new THREE.ShaderMaterial({
      uniforms: { uOpacity: { value: 0 }, uDpr: U.uDpr },
      vertexShader: `attribute float aSize; uniform float uDpr; varying float vB;
        void main(){ vB = aSize; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; gl_PointSize = max(1.2, aSize * uDpr * 1.4); }`,
      fragmentShader: `precision highp float; uniform float uOpacity; varying float vB;
        void main(){ float a = 1.0 - smoothstep(0.2, 0.5, length(gl_PointCoord - 0.5)); a *= uOpacity * min(1.0, vB * 0.7); gl_FragColor = vec4(vec3(0.9, 0.89, 0.86) * a, 1.0); }`,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    })
    const stars = new THREE.Points(g, m)
    stars.frustumCulled = false
    stars.renderOrder = -9
    return { dome, stars }
  }, [])

  useFrame(({ camera }) => {
    dome.position.copy(camera.position)
    stars.position.copy(camera.position)
    ;(stars.material as THREE.ShaderMaterial).uniforms.uOpacity.value = (0.35 + 0.65 * drive.climb) * (1 - drive.map) * (drive.ready ? 1 : 0.4)
  })

  return (
    <>
      <primitive object={dome} />
      <primitive object={stars} />
    </>
  )
}
