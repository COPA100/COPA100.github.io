import { useEffect, useMemo, useRef } from 'react'
import gsap from 'gsap'
import { experience, projects } from '../data/content'
import { drive } from '../lib/state'
import { sm } from '../world/road'
import { END_VH, HOLDS, MARKER_VH } from '../world/script'
import { signDefs, type SignDef } from '../world/signs'
import { registerSign } from './signSync'

const PX_PER_M = 100

export const scrollToVh = (vh: number, smooth = true) => {
  const max = document.documentElement.scrollHeight - innerHeight
  const top = (vh / END_VH) * max
  const lenis = (window as unknown as { __lenis?: { scrollTo: (y: number, o: object) => void } }).__lenis
  if (lenis && smooth) lenis.scrollTo(top, { duration: 1.6, easing: (t: number) => 1 - Math.pow(1 - t, 4) })
  else window.scrollTo({ top, behavior: smooth && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'auto' })
}

export const projectAnchor = (i: number) => (HOLDS[i][0] + HOLDS[i][1]) / 2
export const markerAnchor = (i: number) => MARKER_VH[i]

function visFor(d: SignDef) {
  if (d.kind === 'project') {
    const [a, b] = HOLDS[d.slot]
    // Only once the camera has settled behind the car, so a board never floats over a wide shot.
    return (vh: number) => sm(a - 2, a + 7, vh) * (1 - sm(b + 2, b + 10, vh))
  }
  const m = MARKER_VH[d.slot]
  return (vh: number) => sm(m - 90, m - 62, vh) * (1 - sm(m + 62, m + 90, vh))
}

/** How "parked" the car is under project sign i: 0 while arriving or leaving, 1 while stopped. */
export const parkedAt = (i: number, vh: number) => {
  const [a, b] = HOLDS[i]
  return sm(a + 10, a + 22, vh) * (1 - sm(b - 10, b, vh))
}

const beamOn = () => (drive.highTarget = 1)
const beamOff = () => (drive.highTarget = 0)

// A hairpin warning arrow, bending the way the road does.
function Hairpin({ turn }: { turn: 1 | -1 }) {
  return (
    <svg viewBox="0 0 120 150" className="sign-hairpin" style={{ transform: turn > 0 ? 'scaleX(-1)' : undefined }} aria-hidden>
      <path d="M92 150V64a32 32 0 0 0-64 0v34" fill="none" stroke="currentColor" strokeWidth="16" />
      <path d="M2 92h52L28 132z" fill="currentColor" />
    </svg>
  )
}

function ProjectSign({ d }: { d: SignDef }) {
  const p = projects[d.slot]
  return (
    <>
      {/* Light from the four lamps above, each its own pool, so they strike one by one. */}
      <div className="sign-lamps" aria-hidden>
        <i />
        <i />
        <i />
        <i />
      </div>
      <header className="sign-top">
        <Hairpin turn={d.turn} />
        {p.aside && <span className="sign-aside">{p.aside}</span>}
      </header>
      <h2 className={`sign-name${p.name.length > 9 ? ' is-long' : ''}`} id={`sign-${p.id}`}>
        {p.name}
      </h2>
      <p className="sign-line">{p.line}</p>
      {p.figure && (
        <p className="sign-figure">
          <b>{p.figure.value}</b>
          <span>{p.figure.label}</span>
        </p>
      )}
      <footer className="sign-foot">
        <ul className="sign-stack" aria-label="Built with">
          {p.stack.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
        {p.link && (
          <a
            className="sign-link"
            href={p.link.href}
            target="_blank"
            rel="noreferrer"
            onPointerEnter={beamOn}
            onPointerLeave={beamOff}
            onFocus={beamOn}
            onBlur={beamOff}
          >
            <span>{p.link.label}</span>
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        )}
      </footer>
      {/* The note is drawn beside the sign once the car stops; screen readers get it here. */}
      <p className="sr-only">
        {p.credit} {p.note}
      </p>
    </>
  )
}

function MarkerSign({ d }: { d: SignDef }) {
  const j = experience[d.slot]
  return (
    <>
      <p className="marker-when">{j.when}</p>
      <h3 className="marker-org">{j.org}</h3>
      <p className="marker-role">{j.role}</p>
      <p className="marker-note">{j.note}</p>
    </>
  )
}

function Sign({ d, portrait }: { d: SignDef; portrait: boolean }) {
  const ref = useRef<HTMLElement>(null)
  const w = Math.round(d.w * PX_PER_M)
  const h = Math.round(d.h * PX_PER_M)
  useEffect(() => registerSign(d, ref.current!, w, h, visFor(d)), [d, w, h])
  const anchor = d.kind === 'project' ? projectAnchor(d.slot) : markerAnchor(d.slot)
  const p = d.kind === 'project' ? projects[d.slot] : null
  return (
    <article
      ref={ref}
      className={`sign sign--${d.kind} ${portrait ? 'is-portrait' : 'is-landscape'} ${p ? (p.figure ? 'has-figure' : 'no-figure') : ''}`}
      style={{ width: w, height: h }}
      aria-labelledby={p ? `sign-${p.id}` : undefined}
      // A keyboard user tabbing to a sign is driven to it.
      onFocus={() => {
        if (Math.abs(drive.vh - anchor) > 20) scrollToVh(anchor, false)
      }}
    >
      {d.kind === 'project' ? <ProjectSign d={d} /> : <MarkerSign d={d} />}
    </article>
  )
}

/** Credit and the longer story, set quietly beside the frame while the car waits under a sign. */
function Notes() {
  const refs = useRef<(HTMLDivElement | null)[]>([])
  useEffect(() => {
    const last: number[] = projects.map(() => -1)
    const tick = () => {
      projects.forEach((_, i) => {
        const el = refs.current[i]
        if (!el) return
        const k = Math.round(parkedAt(i, drive.vh) * drive.vis * 100) / 100
        if (k === last[i]) return
        last[i] = k
        el.style.opacity = String(k)
        el.style.visibility = k > 0 ? 'visible' : 'hidden'
        el.style.setProperty('--k', String(k))
      })
    }
    gsap.ticker.add(tick)
    return () => gsap.ticker.remove(tick)
  }, [])
  return (
    <div className="notes" aria-hidden>
      {projects.map((p, i) => (
        <div
          key={p.id}
          className="note"
          ref={(el) => {
            refs.current[i] = el
          }}
        >
          <p className="note-credit">{p.credit}</p>
          <p className="note-body">{p.note}</p>
        </div>
      ))}
    </div>
  )
}

export function Signs({ portrait }: { portrait: boolean }) {
  const defs = useMemo(() => signDefs(portrait), [portrait])
  return (
    <>
      <section className="sign-layer" aria-label="Projects and experience">
        {defs.map((d) => (
          <Sign key={d.id + portrait} d={d} portrait={portrait} />
        ))}
      </section>
      <Notes />
    </>
  )
}
