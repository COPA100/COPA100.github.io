import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { contact, education, hero, projects } from '../data/content'
import { drive } from '../lib/state'
import { reducedMotion } from '../lib/tier'
import { END_VH, SUNRISE_VH } from '../world/script'
import { parkedAt, projectAnchor, scrollToVh } from './Signs'

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
      <p className="hero-role">
        {hero.role}
        <span className="hero-sep" aria-hidden />
        <span className="sr-only">, </span>
        {hero.school}
      </p>
      <p className="hero-cue">
        <span className="hero-cue-key" aria-hidden />
        {matchMedia('(pointer: coarse)').matches ? 'Swipe to drive.' : 'Scroll to drive.'}
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
      // Out of the way in the opening frame, and gone before the sun is up.
      let o = clamp01((drive.vh - 14) / 16) * (1 - clamp01((drive.vh - SUNRISE_VH[0]) / 30))
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
      // The contact block takes the top-left corner at the end, so the name steps aside for it.
      const k = clamp01((drive.vh - 20) / 12) * (1 - clamp01((drive.vh - (SUNRISE_VH[1] - 40)) / 20))
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

export function Contact() {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    let live = false
    const tick = () => {
      // In once the sun has cleared the horizon.
      const on = drive.vh > SUNRISE_VH[1] - 30
      if (on !== live && ref.current) {
        live = on
        ref.current.classList.toggle('is-live', on)
      }
    }
    gsap.ticker.add(tick)
    return () => gsap.ticker.remove(tick)
  }, [])
  return (
    <section className="contact" id="contact" ref={ref} aria-label="Contact">
      <div className="contact-block">
        <p className="contact-kicker" data-rise>
          Contact
        </p>
        <h2 className="contact-title" data-rise>
          Thanks for driving.
        </h2>
        <div className="contact-links" data-rise>
          <a className="contact-btn" href={`mailto:${contact.email}`}>
            Email
          </a>
          <a className="contact-btn" href={contact.github} target="_blank" rel="noreferrer">
            GitHub
          </a>
          <a className="contact-btn" href={contact.linkedin} target="_blank" rel="noreferrer">
            LinkedIn
          </a>
          <a className="contact-btn" href={contact.resume} onClick={(e) => e.preventDefault()}>
            Resume
          </a>
        </div>
        <p className="contact-foot" data-rise>
          {education}
        </p>
      </div>
    </section>
  )
}
