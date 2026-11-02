import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import * as THREE from 'three'
import { contact, education, hero, projects } from '../data/content'
import { drive } from '../lib/state'
import { reducedMotion } from '../lib/tier'
import { HAIRPINS, sample, frame, sm } from '../world/road'
import { END_VH, MAP_VH } from '../world/script'
import { parkedAt, projectAnchor, scrollToVh } from './Signs'

// The camera, shared from the canvas so DOM labels can be projected onto the map.
export const camRef: { cam: THREE.PerspectiveCamera | null; w: number; h: number } = { cam: null, w: 1, h: 1 }

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

export function Hero() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const tick = () => {
      if (!ref.current) return
      // The credit clears as the car pulls away, a little faster than the scroll.
      const k = clamp01((drive.vh - 4) / 22)
      ref.current.style.opacity = String(1 - k)
      ref.current.style.transform = reducedMotion ? '' : `translate3d(0, ${(-k * 28).toFixed(1)}px, 0)`
      ref.current.style.visibility = k >= 1 ? 'hidden' : 'visible'
    }
    gsap.ticker.add(tick)
    return () => gsap.ticker.remove(tick)
  }, [])
  return (
    <div className="hero" ref={ref}>
      <h1 className="hero-name" aria-label={hero.name}>
        <span className="hero-line">{hero.first}</span>
        <span className="hero-line">{hero.last}</span>
      </h1>
      <p className="hero-role">{hero.role}</p>
      <p className="hero-line-copy">{hero.line}</p>
      <p className="hero-cue">
        <span className="hero-cue-key" aria-hidden />
        {matchMedia('(pointer: coarse)').matches ? 'Swipe to drive.' : 'Scroll to drive.'} Stop, and the car stops.
      </p>
    </div>
  )
}

export function Cluster() {
  const mph = useRef<HTMLSpanElement>(null)
  const ft = useRef<HTMLSpanElement>(null)
  const sBar = useRef<HTMLSpanElement>(null)
  const aBar = useRef<HTMLSpanElement>(null)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let lm = -1
    let lf = -1
    const tick = () => {
      if (drive.mph !== lm && mph.current) {
        lm = drive.mph
        mph.current.textContent = String(lm)
        sBar.current!.style.transform = `scaleX(${Math.max(0.003, lm / 150).toFixed(3)})`
      }
      const f = Math.round(drive.feet / 10) * 10
      if (f !== lf && ft.current) {
        lf = f
        ft.current.textContent = f.toLocaleString('en-US')
        aBar.current!.style.transform = `scaleX(${Math.max(0.003, drive.climb).toFixed(3)})`
      }
      // Out of the way in the opening frame and once we are looking down at the map.
      let o = clamp01((drive.vh - 14) / 16) * (1 - clamp01((drive.vh - (MAP_VH[0] - 20)) / 30))
      // Upright screens: while the car waits under a board, the credit takes the gauges' place.
      if (innerHeight > innerWidth) o *= 1 - Math.max(...projects.map((_, i) => parkedAt(i, drive.vh)))
      if (root.current) root.current.style.opacity = o.toFixed(3)
    }
    gsap.ticker.add(tick)
    return () => gsap.ticker.remove(tick)
  }, [])
  return (
    <div className="cluster" ref={root} aria-hidden>
      <div className="gauge">
        <span className="gauge-value" ref={mph}>0</span>
        <span className="gauge-unit">mph</span>
        <span className="gauge-bar">
          <span className="gauge-fill is-accent" ref={sBar} />
        </span>
      </div>
      <div className="gauge">
        <span className="gauge-value" ref={ft}>0</span>
        <span className="gauge-unit">ft</span>
        <span className="gauge-bar">
          <span className="gauge-fill" ref={aBar} />
        </span>
      </div>
    </div>
  )
}

export function TopBar() {
  const nameRef = useRef<HTMLAnchorElement>(null)
  useEffect(() => {
    const tick = () => {
      const k = clamp01((drive.vh - 20) / 12) * (1 - clamp01((drive.vh - (MAP_VH[0] + 10)) / 20))
      if (nameRef.current) {
        nameRef.current.style.opacity = k.toFixed(3)
        nameRef.current.style.pointerEvents = k > 0.5 ? 'auto' : 'none'
      }
    }
    gsap.ticker.add(tick)
    return () => gsap.ticker.remove(tick)
  }, [])
  return (
    <nav className="topbar" aria-label="Site">
      <a
        ref={nameRef}
        href="#top"
        className="topbar-name"
        onClick={(e) => {
          e.preventDefault()
          scrollToVh(0)
        }}
      >
        {hero.name}
      </a>
      <a
        href="#contact"
        className="topbar-link"
        onClick={(e) => {
          e.preventDefault()
          scrollToVh(END_VH)
        }}
      >
        <span>Contact</span>
      </a>
    </nav>
  )
}

// Hairpin stakes on the survey map, each one a way back to its sign.
export function MapLabels() {
  const refs = useRef<HTMLButtonElement[]>([])
  useEffect(() => {
    const f = frame()
    const pts = HAIRPINS.map((s) => {
      sample(s, f)
      return new THREE.Vector3(f.x, f.y, f.z)
    })
    const v = new THREE.Vector3()
    const tick = () => {
      const k = sm(0.75, 1, drive.map)
      const cam = camRef.cam
      refs.current.forEach((el, i) => {
        if (!el) return
        if (!cam || k <= 0) {
          el.style.opacity = '0'
          el.style.pointerEvents = 'none'
          return
        }
        v.copy(pts[i]).project(cam)
        const x = (v.x * 0.5 + 0.5) * camRef.w
        const y = (-v.y * 0.5 + 0.5) * camRef.h
        el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
        el.style.opacity = k.toFixed(3)
        el.style.pointerEvents = k > 0.9 ? 'auto' : 'none'
      })
    }
    gsap.ticker.add(tick)
    return () => gsap.ticker.remove(tick)
  }, [])
  return (
    <div className="map-labels" aria-label="The route">
      {projects.map((p, i) => (
        <button
          key={p.id}
          type="button"
          className="map-label"
          ref={(el) => {
            if (el) refs.current[i] = el
          }}
          onClick={() => scrollToVh(projectAnchor(i))}
          tabIndex={-1}
        >
          <i aria-hidden />
          <span>{p.name}</span>
        </button>
      ))}
    </div>
  )
}

export function Contact() {
  const ref = useRef<HTMLElement>(null)
  const scale = useRef<HTMLSpanElement>(null)
  const scaleLabel = useRef<HTMLSpanElement>(null)
  const [copied, setCopied] = useState(false)
  const timer = useRef(0)
  useEffect(() => {
    let live = false
    const tick = () => {
      const k = sm(0.82, 1, drive.map)
      const on = k > 0.5
      if (on !== live && ref.current) {
        live = on
        ref.current.classList.toggle('is-live', on)
      }
      // A true scale bar: metres per pixel at the map's centre.
      const cam = camRef.cam
      if (cam && scale.current && k > 0) {
        const dist = cam.position.y - 450
        const mPerPx = (2 * dist * Math.tan((cam.fov * Math.PI) / 360)) / camRef.h
        const m = mPerPx * 120 > 900 ? 1000 : 500
        scale.current.style.width = `${(m / mPerPx).toFixed(1)}px`
        scaleLabel.current!.textContent = m === 1000 ? '1 km' : '500 m'
      }
    }
    gsap.ticker.add(tick)
    return () => gsap.ticker.remove(tick)
  }, [])
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(contact.email)
      setCopied(true)
      clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setCopied(false), 1800)
    } catch {
      /* Clipboard refused: the mailto link still works. */
    }
  }
  return (
    <section className="contact" id="contact" ref={ref} aria-label="Contact">
      <div className="contact-block">
        <p className="contact-kicker" data-rise>
          End of the road. Let&rsquo;s talk.
        </p>
        <a className="contact-mail" href={`mailto:${contact.email}`} data-rise>
          {contact.email.split('@')[0]}
          <wbr />@{contact.email.split('@')[1]}
        </a>
        <div className="contact-links" data-rise>
          <button type="button" className="contact-link" onClick={copy} aria-live="polite">
            <span>{copied ? 'Copied' : 'Copy email'}</span>
          </button>
          <a className="contact-link" href={contact.github} target="_blank" rel="noreferrer">
            <span>GitHub</span>
          </a>
          <a className="contact-link" href={contact.linkedin} target="_blank" rel="noreferrer">
            <span>LinkedIn</span>
          </a>
          <a className="contact-resume" href={contact.resume} onClick={(e) => e.preventDefault()}>
            Resume
          </a>
        </div>
        <div className="contact-foot" data-rise>
          <p>{education}</p>
          <p className="contact-scale" aria-hidden>
            <span className="contact-scale-bar" ref={scale} />
            <span ref={scaleLabel}>500 m</span>
          </p>
        </div>
      </div>
    </section>
  )
}

void END_VH
