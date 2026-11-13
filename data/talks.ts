import type { Talk } from '~/types'

export const talks: Talk[] = [
  {
    title: 'Maîtriser l\'Atomic Design',
    description: 'Du Copier-Coller au Design System — comprendre, implémenter et maîtriser l\'Atomic Design, illustré en parallèle avec Symfony UX Twig Components et Vue 3.',
    lang: 'fr',
    presentations: [
      {
        lang: 'fr',
        date: '2026-07-28',
        conference: 'Blog Article',
        conferenceUrl: 'https://alexvolkihar.ovh/posts/atomic-design-fr',
        transcript: '/posts/atomic-design-fr',
        spa: 'https://slides.alexvolkihar.ovh/2026/atomic-design/',
      },
    ],
  },
  {
    title: 'Maîtriser l\'Architecture Hexagonale',
    description: 'Du Spaghetti au Code Propre en PHP — guide progressif pour comprendre, implémenter et maîtriser l\'architecture hexagonale à travers un cas pratique de réfactoring.',
    lang: 'fr',
    presentations: [
      {
        lang: 'fr',
        date: '2026-07-06',
        conference: 'Blog Article',
        conferenceUrl: 'https://alexvolkihar.ovh/posts/hexagonal-architecture-fr',
        transcript: '/posts/hexagonal-architecture-fr',
        spa: 'https://slides.alexvolkihar.ovh/2026/hexagonal-architecture/',
      },
    ],
  },
]

talks.forEach((talk) => {
  talk.presentations.sort((a, b) => {
    return new Date(b.date).getTime() - new Date(a.date).getTime()
  })
})

talks.sort((a, b) => {
  return new Date(b.presentations[0].date).getTime() - new Date(a.presentations[0].date).getTime()
})
