import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { U, drive } from '../lib/state'
import { forcedSpeed, low, reducedMotion } from '../lib/tier'
import { END_S, PARK_S, START_S, carLateral, carYaw, frame, groundAt, sample, sm } from '../world/road'
import { END_VH, OVERLOOK_VH, SUNRISE_VH, calm, dawnAt, keys, roadAt, segmentAt, type Shot } from '../world/script'
import { holdS, signDefs } from '../world/signs'
import { SUMMIT } from '../world/terrain'
import { updateSigns } from '../ui/signSync'
import { Car } from './Car'

// The sun comes up ahead of the parked car and a little to its right, so the car stands
// dark against the brightest part of the sky.
const SUN_AZ = (() => {
  const f = sample(PARK_S)
  return f.heading + carYaw(PARK_S) + 0.2
})()
const setSun = (dawn: number) => {
  const el = -0.07 + 0.13 * sm(0.3, 1, dawn)
  const c = Math.cos(el)
  U.uSunDir.value.set(Math.sin(SUN_AZ) * c, Math.sin(el), -Math.cos(SUN_AZ) * c)
}

const damp = (a: number, b: number, l: number, dt: number) => a + (b - a) * (1 - Math.exp(-l * dt))

type Pose = { pos: THREE.Vector3; tgt: THREE.Vector3; up: THREE.Vector3; fov: number; shift: number; amb: number; ember: number; fogN: number; fogF: number }
const pose = (): Pose => ({ pos: new THREE.Vector3(), tgt: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0), fov: 40, shift: 0, amb: 0, ember: 0, fogN: 0, fogF: 0 })

export const scrollVh = () => {
  const max = Math.max(1, document.documentElement.scrollHeight - innerHeight)
  return (Math.min(max, Math.max(0, scrollY)) / max) * END_VH
}

export function Director() {
  const { camera, size, pointer, setDpr } = useThree()
  const perf = useRef({ frames: 0, slow: 0, last: 0 }).current
  const portrait = size.height > size.width
  const list = useMemo(() => keys(portrait), [portrait])
  const signs = useMemo(() => signDefs(portrait), [portrait])
  const carRef = useRef<THREE.Group>(null)
  const st = useRef({
    s: START_S,
    prevS: START_S,
    v: 0,
    vPrev: 0,
    accel: 0,
    t0: performance.now(),
    px: 0,
    py: 0,
    guard: 0,
    f: frame(),
    g: frame(),
    pa: pose(),
    pb: pose(),
    F: new THREE.Vector3(),
    R: new THREE.Vector3(),
    Up: new THREE.Vector3(),
    car: new THREE.Vector3(),
    m: new THREE.Matrix4(),
    tmp: new THREE.Vector3(),
  }).current

  // Evaluates one shot into a pose, live, against the car's current state.
  const evalShot = (shot: Shot, out: Pose) => {
    const { f } = st
    out.fov = shot.fov
    out.shift = 0
    out.up.set(0, 1, 0)
    Object.assign(out, shot.env)
    const car = st.car
    switch (shot.k) {
      case 'opening': {
        // Head-on, low, a few car lengths up the road: the lamps catch, then the car comes at us.
        sample(START_S, f)
        const P = portrait
        // Arrival: the camera settles in from further off and higher as the lamps catch.
        const k = reducedMotion ? 0 : Math.pow(1 - Math.min(1, drive.since / 3.6), 3)
        const ahead = (P ? 17 : 14) + k * 16
        const side = P ? 0.6 : 2.6
        out.pos.set(car.x + f.tx * ahead + f.rx * side, car.y + (P ? 1.9 : 1.7) + k * 5, car.z + f.tz * ahead + f.rz * side)
        const tside = P ? 1 : 9
        out.tgt.set(car.x - f.tx * 30 + f.rx * tside, car.y + (P ? 7.5 : 5), car.z - f.tz * 30 + f.rz * tside)
        out.shift = P ? -0.12 : 0
        break
      }
      case 'chase': {
        const az = (shot.az * Math.PI) / 180
        const ca = Math.cos(az)
        const sa = Math.sin(az)
        const r = shot.r
        const lat = shot.lat ?? 0
        out.pos.set(
          car.x - st.F.x * ca * r + st.R.x * (sa * r + lat),
          car.y + shot.h,
          car.z - st.F.z * ca * r + st.R.z * (sa * r + lat),
        )
        // Follow the grade only halfway, so a steep climb never tips the car out of the bottom of frame.
        out.tgt.set(car.x + st.F.x * shot.look, car.y + shot.lookH + st.F.y * shot.look * 0.5, car.z + st.F.z * shot.look)
        break
      }
      case 'hold': {
        // Behind the waiting car, looking past it down the bend at the board.
        const d = signs[shot.sign]
        const dx = d.right[2]
        const dz = -d.right[0]
        const [ex, ey, ez] = d.eye
        const x = ex - dx * shot.back + d.right[0] * shot.lat * d.turn
        const z = ez - dz * shot.back + d.right[2] * shot.lat * d.turn
        out.pos.set(x, Math.max(ey + shot.up, groundAt(x, z) + 1.1), z)
        // Split the frame between the car's wheels and the board's top edge: car under the sign.
        const top = d.c[1] + d.h / 2
        const py = out.pos.y
        // Upright screens frame to the car's body rather than its wheels, so the board can be bigger.
        const pCar = Math.atan2(ey + (portrait ? 0.5 : -0.3) - py, Math.hypot(ex - x, ez - z))
        const pTop = Math.atan2(top - py, Math.hypot(d.c[0] - x, d.c[2] - z))
        // Fit the lens to the board and the car, so a tall board never rises into the top bar.
        const fill = portrait ? 0.8 : 0.82
        const spanDeg = ((pTop - pCar) * 180) / Math.PI
        out.fov = Math.max(shot.fov, spanDeg / fill)
        const pitch = (pCar + pTop) / 2 + shot.aim
        const yaw = Math.atan2(d.c[0] - x, d.c[2] - z)
        out.tgt.set(x + Math.sin(yaw) * Math.cos(pitch) * 50, py + Math.sin(pitch) * 50, z + Math.cos(yaw) * Math.cos(pitch) * 50)
        // Until the car reaches its waiting spot, the whole set-up rides along with it.
        const [ha, hb] = holdS(shot.sign)
        const sc = Math.min(hb, Math.max(ha, st.s))
        if (sc !== st.s) {
          const g = sample(sc, st.g)
          const l = carLateral(sc)
          st.tmp.set(car.x - (g.x + g.rx * l), car.y - g.y, car.z - (g.z + g.rz * l))
          out.pos.add(st.tmp)
          out.tgt.add(st.tmp)
        }
        out.shift = 0
        break
      }
      case 'orbit': {
        const a = (shot.th * Math.PI) / 180
        out.pos.set(SUMMIT.x + Math.sin(a) * shot.r, shot.y, SUMMIT.z + Math.cos(a) * shot.r)
        out.tgt.set(SUMMIT.x * 0.6 + car.x * 0.4, shot.lookY, SUMMIT.z * 0.6 + car.z * 0.4)
        out.shift = portrait ? 0.14 : 0.06
        break
      }
      case 'fixed': {
        out.pos.set(...shot.pos)
        out.tgt.set(...shot.tgt)
        break
      }
      case 'side': {
        // Off the downhill shoulder, level with the car, tracking it across the frame.
        out.pos.set(car.x + st.R.x * shot.dist - st.F.x * shot.lead, car.y + shot.h, car.z + st.R.z * shot.dist - st.F.z * shot.lead)
        // Where the shoulder rises, lift over it rather than look through the bank.
        out.pos.y = Math.max(out.pos.y, groundAt(out.pos.x, out.pos.z) + 2.2)
        // And keep a clear line of sight to the car over any spur in between.
        for (let k = 1; k < 8; k++) {
          const t = k / 8
          const g = groundAt(out.pos.x + (car.x - out.pos.x) * t, out.pos.z + (car.z - out.pos.z) * t)
          const need = (g + 0.8 - (car.y + 1) * t) / (1 - t)
          if (need > out.pos.y) out.pos.y = need
        }
        out.tgt.set(car.x - st.F.x * shot.lead * 0.2, car.y + shot.aimH, car.z - st.F.z * shot.lead * 0.2)
        out.shift = portrait ? 0.06 : 0.02
        break
      }
      case 'overlook': {
        // Behind and inside the parked car, looking past it into the night it is lighting.
        out.pos.set(car.x - st.F.x * shot.back + st.R.x * shot.side, car.y + shot.h, car.z - st.F.z * shot.back + st.R.z * shot.side)
        out.tgt.set(car.x + st.F.x * shot.ahead, car.y + shot.aimH, car.z + st.F.z * shot.ahead)
        out.shift = 0
        break
      }
    }
  }

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const time = state.clock.elapsedTime
    U.uTime.value = time

    // Ignition: taillights come up first, then the headlights catch twice.
    // Dev only: __replay() restarts the intro, __slow stretches it, __freeze holds a moment.
    const dev = import.meta.env.DEV ? (window as unknown as { __slow?: number; __freeze?: number; __replay?: () => void }) : null
    if (dev && !dev.__replay) dev.__replay = () => ((st.t0 = performance.now()), (drive.lit = false))
    const since = dev?.__freeze ?? (drive.ready ? (performance.now() - st.t0) / 1000 / (dev?.__slow ?? 1) : 0)
    if (!drive.ready) st.t0 = performance.now()
    if (reducedMotion) {
      U.uLights.value = drive.ready ? 1 : 0
      U.uTail.value = drive.ready ? 1 : 0
    } else {
      U.uTail.value = Math.min(1, Math.max(0, (since - 0.5) / 0.3))
      const a = since - 0.95
      U.uLights.value = a < 0 ? 0 : a < 0.07 ? 0.7 : a < 0.16 ? 0.06 : Math.min(1, 0.55 + (a - 0.16) * 1.5)
    }
    drive.since = since
    if (!drive.lit && (reducedMotion ? drive.ready : since > 1.15)) drive.lit = true
    // As the lamps catch, a survey pulse runs out from the car and maps the mountain behind it.
    if (reducedMotion) {
      U.uPulse.value = 1e5
      U.uPulseA.value = 0
    } else {
      // Slow off the car, accelerating out: the front lingers on the near slopes, where it's seen.
      const p = Math.min(1, Math.max(0, (since - 1.12) / 3.0))
      U.uPulse.value = p <= 0 ? 0 : 6 + 2600 * Math.pow(p, 2.2)
      U.uPulseA.value = p <= 0 ? 0 : Math.min(1, p * 14) * (1 - sm(0.6, 1, p))
      if (p >= 1) U.uPulse.value = 1e5
    }

    // Scroll is the throttle: distance comes from scroll position, nothing else.
    let vh = scrollVh()
    let vis = 1
    if (reducedMotion) ({ vh, vis } = calm(vh))
    drive.vh = vh
    const target = roadAt(vh)
    st.s = reducedMotion ? target : damp(st.s, target, low ? 11 : 8, dt)
    if (Math.abs(st.s - target) < 0.0005) st.s = target
    const raw = (st.s - st.prevS) / Math.max(dt, 0.001)
    st.prevS = st.s
    st.vPrev = st.v
    st.v = damp(st.v, raw, 6, dt)
    st.accel = damp(st.accel, (st.v - st.vPrev) / Math.max(dt, 0.001), 7, dt)
    drive.s = st.s
    drive.v = st.v
    const absV = Math.abs(st.v)
    const speed = forcedSpeed ?? 1 - Math.exp(-absV / 240)
    drive.speed = reducedMotion ? 0 : speed
    drive.mph = absV < 0.6 && forcedSpeed === null ? 0 : Math.round(150 * speed)
    U.uSpeed.value = drive.speed
    U.uCarS.value = st.s

    // Stopped means foot on the brake; lifting off dims the bar; hard deceleration flares it.
    const braking = Math.max(1 - absV / 3, Math.min(1, (-st.accel * Math.sign(st.v || 1)) / 80))
    U.uBrake.value = damp(U.uBrake.value, Math.max(0, braking), 10, dt)
    // Parked at the overlook, the driver flicks the high beams on and lights the drop.
    const dawn = dawnAt(vh)
    drive.dawn = dawn
    U.uDawn.value = dawn
    setSun(dawn)
    // As daylight takes over, the lamps stop mattering: the beams fade, the taillights stay.
    U.uLights.value *= 1 - 0.85 * sm(0.45, 0.95, dawn)
    const brights = sm(OVERLOOK_VH[0] - 26, OVERLOOK_VH[0] + 4, vh) * (1 - sm(SUNRISE_VH[0] + 10, SUNRISE_VH[0] + 50, vh))
    drive.high = damp(drive.high, Math.max(drive.highTarget, brights), brights > drive.high ? 5 : 12, dt)
    U.uHigh.value = drive.high

    // Car in road space, pitched to the grade.
    const f = sample(st.s, st.f)
    const lat = carLateral(st.s)
    const yaw = carYaw(st.s)
    const heading = f.heading + yaw
    // Parked level in the lay-by, so the high beams run out flat over the drop.
    const pitch = Math.atan(f.grade) * (1 - sm(PARK_S - 30, PARK_S, st.s))
    const cp = Math.cos(pitch)
    st.F.set(Math.sin(heading) * cp, Math.sin(pitch), -Math.cos(heading) * cp)
    st.R.set(Math.cos(heading), 0, Math.sin(heading))
    st.Up.crossVectors(st.R, st.F).normalize()
    st.car.set(f.x + f.rx * lat, f.y, f.z + f.rz * lat)
    if (st.s > END_S - 130) st.car.y = Math.max(f.y, groundAt(st.car.x, st.car.z) + 0.14)
    U.uCar.value.copy(st.car)
    U.uCarF.value.copy(st.F)
    U.uCarR.value.copy(st.R)
    U.uCarU.value.copy(st.Up)
    drive.feet = Math.round((st.car.y * 3.2808 + 2400) / 1) // a base elevation, so the numbers read like a range road
    drive.climb = sm(START_S, PARK_S, st.s)

    const car = carRef.current
    if (car) {
      st.m.makeBasis(st.R, st.Up, st.tmp.copy(st.F).negate())
      car.quaternion.setFromRotationMatrix(st.m)
      // Squat on acceleration, a faint engine shudder at idle.
      const squat = reducedMotion ? 0 : Math.max(-0.016, Math.min(0.02, st.accel * 0.0004))
      car.rotateX(squat)
      const idle = reducedMotion ? 0 : (1 - Math.min(1, speed * 6)) * Math.sin(time * 31) * 0.0012
      car.position.copy(st.car)
      car.position.y += idle
    }

    // Camera: blend two live poses.
    const { A, B, t } = segmentAt(list, vh)
    evalShot(A, st.pa)
    evalShot(B, st.pb)
    const pa = st.pa
    const pb = st.pb
    const pos = pa.pos.lerp(pb.pos, t)
    const tgt = pa.tgt.lerp(pb.tgt, t)
    const up = pa.up.lerp(pb.up, t).normalize()
    const fov = pa.fov + (pb.fov - pa.fov) * t
    const shift = pa.shift + (pb.shift - pa.shift) * t
    U.uAmb.value = (pa.amb + (pb.amb - pa.amb) * t) * (drive.ready ? 1 : 0)
    U.uEmberA.value = pa.ember + (pb.ember - pa.ember) * t
    U.uFogN.value = pa.fogN + (pb.fogN - pa.fogN) * t
    U.uFogF.value = pa.fogF + (pb.fogF - pa.fogF) * t
    U.uEmberY.value = st.car.y

    // Pointer parallax on desktop, sprung so it never feels attached to the mouse.
    if (!low && !reducedMotion) {
      st.px = damp(st.px, pointer.x, 2.2, dt)
      st.py = damp(st.py, pointer.y, 2.2, dt)
      pos.x += st.R.x * st.px * 0.6
      pos.z += st.R.z * st.px * 0.6
      pos.y += st.py * 0.3
    }
    if (!reducedMotion) {
      // Road vibration climbs with speed; barely a tremor when idling.
      const k = (speed * speed * 0.045 + 0.001) * Math.max(0, 1 - pos.distanceTo(st.car) / 60)
      pos.x += Math.sin(time * 41.3) * k * 0.6
      pos.y += Math.sin(time * 47.9 + 1.3) * k
    }

    // Verification hook: pin the camera to an explicit pose.
    const dbg = import.meta.env.DEV ? (window as unknown as { __shot?: { pos: number[]; tgt: number[]; fov?: number; rel?: boolean } }).__shot : undefined
    if (dbg) {
      const o = dbg.rel ? st.car : { x: 0, y: 0, z: 0 }
      pos.set(dbg.pos[0] + o.x, dbg.pos[1] + o.y, dbg.pos[2] + o.z)
      tgt.set(dbg.tgt[0] + o.x, dbg.tgt[1] + o.y, dbg.tgt[2] + o.z)
    }

    // Never clip the ground, whatever the shot list says.
    const clear = groundAt(pos.x, pos.z) + 1.2
    const need = Math.max(0, clear - pos.y)
    st.guard = damp(st.guard, need, 6, dt)
    pos.y += Math.max(st.guard, need * 0.9)

    const cam = camera as THREE.PerspectiveCamera
    camera.position.copy(pos)
    camera.up.copy(up)
    camera.lookAt(tgt)
    const aspect = size.width / size.height
    const kick = reducedMotion ? 0 : speed * 9
    cam.fov = (dbg?.fov ?? fov) + kick
    cam.aspect = aspect
    // Keep near/far sane from a few metres to the survey altitude.
    const above = pos.y - groundAt(pos.x, pos.z)
    cam.near = Math.max(0.2, Math.min(40, above * 0.05, pos.distanceTo(st.car) * 0.3))
    cam.far = 16000
    cam.setViewOffset(size.width, size.height, 0, -shift * size.height, size.width, size.height)
    cam.updateProjectionMatrix()
    cam.updateMatrixWorld()

    // Quiet performance guard: drop resolution before dropping frames. An average fps hides a
    // screen that hovers just under its refresh rate, so count slow frames instead (over 19 ms,
    // i.e. a missed 60 Hz vsync) and step down when they are more than one in twelve.
    perf.frames++
    if (rawDt > 0.019) perf.slow++
    if (time - perf.last > 2) {
      const pr = state.gl.getPixelRatio()
      const settled = drive.ready && performance.now() - st.t0 > 2500 && document.visibilityState === 'visible'
      if (perf.last > 0 && settled && perf.frames > 30 && perf.slow / perf.frames > 1 / 12 && pr > 1) {
        setDpr(Math.max(1, pr - 0.25))
        if (import.meta.env.DEV) console.debug(`[guard] ${perf.slow}/${perf.frames} slow frames, dpr ${pr} -> ${Math.max(1, pr - 0.25)}`)
      }
      perf.frames = 0
      perf.slow = 0
      perf.last = time
    }
    U.uDpr.value = state.gl.getPixelRatio()
    U.uPx.value = (Math.tan((cam.fov * Math.PI) / 360) * 2 * 0.8) / size.height
    drive.vis = vis
    if (import.meta.env.DEV) (window as unknown as { __dbg: unknown }).__dbg = { cam: pos.toArray().map(Math.round), tgt: tgt.toArray().map(Math.round), car: st.car.toArray().map(Math.round), s: Math.round(st.s), vh: Math.round(vh) }
    updateSigns(cam, size.width, size.height)
  }, 0)

  return <Car ref={carRef} />
}
