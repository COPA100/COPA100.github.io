import { END_S, PARK_S, carLateral, carYaw, groundAt, sample } from '../src/world/road.ts'
const f = sample(PARK_S)
const lat = carLateral(PARK_S)
const x = f.x + f.rx * lat, z = f.z + f.rz * lat
console.log('END_S', END_S.toFixed(0), 'park', x.toFixed(1), z.toFixed(1), 'y', f.y.toFixed(1), 'heading', f.heading.toFixed(2), 'yaw', carYaw(PARK_S).toFixed(2))
for (let d = -180; d < 180; d += 15) {
  const h = f.heading + (d * Math.PI) / 180
  const tx = Math.sin(h), tz = -Math.cos(h)
  const prof = [10, 25, 50, 100, 200, 400].map((r) => (groundAt(x + tx * r, z + tz * r) - f.y).toFixed(0))
  console.log(String(d).padStart(5), prof.join(' '))
}
