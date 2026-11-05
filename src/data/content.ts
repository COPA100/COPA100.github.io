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
  link?: { href: string; label: string }
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
  school: 'UVA ’29',
}

export const projects: Project[] = [
  {
    id: 'quantly',
    name: 'Quantly',
    line: 'Portfolio risk analysis with a C++ engine underneath.',
    figure: { value: '43×', label: 'faster drawdown math than NumPy, from a C++ engine' },
    stack: ['Python', 'C++', 'React', 'AWS'],
    link: { href: 'https://github.com/COPA100/quantly', label: 'github.com/COPA100/quantly' },
    credit: 'Built solo.',
    note: "A full-stack risk platform: it stress-tests a portfolio against real market crashes, estimates how far it could fall, and shows what's actually driving its returns. It runs on AWS, with a custom C++ engine doing the heavy math.",
  },
  {
    id: 'hackx',
    name: 'HackX',
    aside: 'HooHacks',
    line: 'The app that runs HooHacks on iOS, Android, and web.',
    stack: ['React Native', 'Expo', 'TypeScript', 'Firebase', 'Sentry'],
    link: { href: 'https://app.hoohacks.io', label: 'app.hoohacks.io' },
    credit: "Team project. I'm the top contributor.",
    note: 'The cross-platform app that runs HooHacks end to end, from applications and check-in to judging, for hackers, judges, mentors, and organizers on iOS, Android, and the web.',
  },
  {
    id: 'idea-x',
    name: 'IdeaX',
    line: "The app that runs Ideathon, UVA's one-day pitch competition.",
    figure: { value: '160+', label: 'people used it on the day' },
    stack: ['React', 'Firebase', 'Vite', 'Playwright'],
    link: { href: 'https://hoohacks.github.io/idea-x/', label: 'hoohacks.github.io/idea-x' },
    credit: 'Team project, started in 2022. I led the 2026 rewrite.',
    note: 'It runs all of Ideathon day, from check-in and pitch submissions to judging and results, for a $1,500 prize pool.',
  },
  {
    id: 'biberty-blur',
    name: 'Biberty Blur',
    aside: 'Liberty Mutual hackathon',
    line: 'Blurs sensitive data on your screen while you share it.',
    stack: ['TypeScript', 'AWS Lambda', 'AWS CDK', 'Comprehend'],
    credit: 'Led a team at the Liberty Mutual intern hackathon, July 2026.',
    note: 'A browser extension that watches the page while you screen-share and blurs anything that looks like personal data, using pattern matching for the obvious cases and Amazon Comprehend for the rest.',
  },
]

// In the order they happened, which is the order they stand along the road.
export const experience = [
  {
    id: 'westwood-cares',
    org: 'Westwood Cares Foundation',
    role: 'Website Administrator',
    when: 'Jul 2025–present',
    note: "I optimized the charity's website, which has since brought in $40,000+ in donations.",
  },
  {
    id: 'hoohacks',
    org: 'HooHacks',
    role: 'Technology Chair & Software Developer',
    when: 'Sep 2025–present',
    note: "I lead a 9-person team building the apps and sites for UVA's hackathon and Ideathon. 2,500+ registrants, 850+ attendees.",
  },
  {
    id: 'liberty-mutual',
    org: 'Liberty Mutual',
    role: 'Software Engineer Intern',
    when: 'Jun–Aug 2026, returning summer 2027',
    note: 'I built a Python pipeline on Azure and Snowflake that matches crash telemetry from 57,000 company devices to IT tickets, cutting investigation time by 30%.',
  },
]

export const education = 'University of Virginia, BS Computer Science, class of 2029'

export const contact = {
  email: 'colinpark100@gmail.com',
  github: 'https://github.com/COPA100',
  linkedin: 'https://www.linkedin.com/in/colin-park1/',
}
