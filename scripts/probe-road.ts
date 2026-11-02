import { ROAD_POINTS } from '../src/world/road.ts'
import { SUMMIT } from '../src/world/terrain.ts'
const { PX, PZ, PY, N } = ROAD_POINTS
const bins: { min: number; max: number; ymin: number; ymax: number }[] = Array.from({ length: 24 }, () => ({ min: 1e9, max: 0, ymin: 1e9, ymax: 0 }))
for (let i = 0; i < N; i++) {
  const dx = PX[i] - SUMMIT.x, dz = PZ[i] - SUMMIT.z
  const th = ((Math.atan2(dx, dz) * 180) / Math.PI + 360) % 360
  const b = bins[Math.floor(th / 15)]
  const r = Math.hypot(dx, dz)
  b.min = Math.min(b.min, r); b.max = Math.max(b.max, r); b.ymin = Math.min(b.ymin, PY[i]); b.ymax = Math.max(b.ymax, PY[i])
}
bins.forEach((b, i) => console.log(String(i * 15).padStart(3), b.min < 1e9 ? `r ${b.min.toFixed(0)}-${b.max.toFixed(0)}  y ${b.ymin.toFixed(0)}-${b.ymax.toFixed(0)}` : '-'))
