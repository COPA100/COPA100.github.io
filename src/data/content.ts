// Every piece of portfolio copy lives here. Reorder or swap projects and the signs follow.
// Copy comes from COPY.md, which was written from the repos themselves.

export type Project = {
  id: string
  name: string
  aside?: string
  /** One line: what it is, read at a glance from the car. */
  line: string
  /** At most one standout figure. */
  figure?: { value: string; label: string }
  stack: string[]
  link: { href: string; label: string }
  /** Who built it. Shown with the note once the car has stopped under the sign. */
  credit: string
  /** The longer, more interesting sentence, revealed only while parked. */
  note: string
}

export const hero = {
  name: 'Colin Park',
  first: 'Colin',
  last: 'Park',
  role: 'Software engineer',
  line: 'Builds software for real people on a real deadline, and tests it until it holds up.',
}

export const projects: Project[] = [
  {
    id: 'quantly',
    name: 'Quantly',
    line: 'Upload your brokerage holdings, see how risky they really are.',
    figure: { value: '43×', label: 'faster drawdown math than NumPy, from a C++ engine' },
    stack: ['Python', 'C++', 'React', 'AWS'],
    link: { href: 'https://github.com/COPA100/quantly', label: 'github.com/COPA100/quantly' },
    credit: 'Built solo.',
    note: 'It replays your actual holdings through six market crashes since 2007 (the 2008 financial crisis, COVID, the 2022 rate shock) and shows what each position would have lost. Behind the charts is a job pipeline built to survive its own workers being killed mid-analysis, which a nightly test does on purpose.',
  },
  {
    id: 'hackx',
    name: 'HackX',
    aside: 'HooHacks',
    line: "The app that runs UVA's hackathon, from application to raffle.",
    stack: ['React Native', 'Expo', 'TypeScript', 'Firebase'],
    link: { href: 'https://app.hoohacks.io', label: 'app.hoohacks.io' },
    credit: 'Team project. Top contributor. Built the original QR and NFC check-in.',
    note: "One codebase ships to the web, iPhone and Android: hackers apply and get a ticket that changes with their status, organizers check people in by QR code or an NFC badge tap, and judges score projects. There's no server, so the database rules are the whole security model, and every admin change has to write its own audit-log entry or the database refuses it.",
  },
  {
    id: 'idea-x',
    name: 'Idea X',
    line: 'Runs a one-day student pitch competition, start to finish.',
    stack: ['React', 'Firebase', 'Vite', 'Playwright'],
    link: { href: 'https://hoohacks.github.io/idea-x/', label: 'hoohacks.github.io/idea-x' },
    credit: 'Team project, started in 2022. Led the 2026 rewrite and wrote most of the current code.',
    note: "On the day, organizers check people in, open submissions and publish a judging schedule that seats every judge without double-booking anyone. If something changes after the plan is built, the app won't publish and offers a targeted fix instead. Judges' scores are saved on their phone first, so a dropped venue Wi-Fi connection can't lose one.",
  },
  {
    id: 'research-atlas',
    name: 'Research Atlas',
    line: "Matches students with professors' open research positions.",
    stack: ['React', 'TypeScript', 'FastAPI', 'Claude API'],
    link: { href: 'https://github.com/COPA100/Research-Atlas', label: 'github.com/COPA100/Research-Atlas' },
    credit: 'Team of four at the UVA Claude for Good Hackathon, November 2025. Built the front end.',
    note: "A professor posts a position, and the app pulls students with matching interests and asks Claude to rate each one against the posting from 0 to 10, then shows the five best. Built in a day at a hackathon, so it's a prototype, not a product.",
  },
]

export const experience = [
  {
    id: 'liberty-mutual',
    org: 'Liberty Mutual',
    role: 'Software Engineer Intern',
    when: 'Jun–Aug 2026, returning summer 2027',
    note: 'Built a pipeline that matches crash telemetry from 57,000 company devices to IT support tickets, so investigations start from the likely cause instead of a search.',
  },
  {
    id: 'hoohacks',
    org: 'HooHacks',
    role: 'Technology Chair & Software Developer',
    when: 'Sep 2025–present',
    note: "Leads the nine-person team behind the apps and websites for UVA's hackathon and Ideathon, and is on call to fix things live on event day.",
  },
]

export const education = 'University of Virginia, BS Computer Science, class of 2029'

export const contact = {
  email: 'colinpark100@gmail.com',
  github: 'https://github.com/COPA100',
  linkedin: 'https://www.linkedin.com/in/colin-park1/',
  resume: '#',
}
