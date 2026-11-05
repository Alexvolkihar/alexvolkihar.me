import dayjs from 'dayjs'

export const isDark = useDark()
export const englishOnly = useLocalStorage('antfu-english-only', false)
/**
 * Whether the visitor's browser lists `lang` among its languages. Only used as the default
 * before the visitor makes a choice: English plus the browser's language. True during the
 * static build, where there is no browser (lists render unfiltered until mounted anyway).
 */
function browserWants(lang: string): boolean {
  if (typeof navigator === 'undefined')
    return true
  const langs = navigator.languages?.length ? navigator.languages : [navigator.language]
  return langs.some(l => l?.toLowerCase().split('-')[0] === lang)
}

export const showFrenchPosts = useLocalStorage('antfu-show-french-posts', browserWants('fr'))
export const showJapanesePosts = useLocalStorage('antfu-show-japanese-posts', browserWants('ja'))
/**
 * Show or hide the French/Japanese posts. Leaving "English Only" from a
 * language box shows English plus that language only, as the boxes displayed.
 */
export function toggleLanguagePosts(lang: 'fr' | 'ja') {
  const shown = lang === 'fr' ? showFrenchPosts : showJapanesePosts
  const other = lang === 'fr' ? showJapanesePosts : showFrenchPosts
  if (englishOnly.value) {
    englishOnly.value = false
    shown.value = true
    other.value = false
  }
  else {
    shown.value = !shown.value
  }
}

export const galleryView = useLocalStorage<'cover' | 'contain'>('antfu-gallery-view', 'cover')

/**
 * Credit to [@hooray](https://github.com/hooray)
 * @see https://github.com/vuejs/vitepress/pull/2347
 */
export function toggleDark(event: MouseEvent) {
  // @ts-expect-error experimental API
  const isAppearanceTransition = document.startViewTransition
    && !window.matchMedia('(prefers-reduced-motion: reduce)').matches

  if (!isAppearanceTransition) {
    isDark.value = !isDark.value
    return
  }

  const x = event.clientX
  const y = event.clientY
  const endRadius = Math.hypot(
    Math.max(x, innerWidth - x),
    Math.max(y, innerHeight - y),
  )
  const transition = document.startViewTransition(async () => {
    isDark.value = !isDark.value
    await nextTick()
  })
  transition.ready
    .then(() => {
      const clipPath = [
        `circle(0px at ${x}px ${y}px)`,
        `circle(${endRadius}px at ${x}px ${y}px)`,
      ]
      document.documentElement.animate(
        {
          clipPath: isDark.value
            ? [...clipPath].reverse()
            : clipPath,
        },
        {
          duration: 400,
          easing: 'ease-out',
          fill: 'forwards',
          pseudoElement: isDark.value
            ? '::view-transition-old(root)'
            : '::view-transition-new(root)',
        },
      )
    })
}

export function normalizeDateInput(d: string | number | Date) {
  if (typeof d === 'number' && Number.isInteger(d) && d >= 1000 && d <= 9999)
    return `${d}-01-01`
  if (typeof d === 'string' && /^\d{4}$/.test(d.trim()))
    return `${d.trim()}-01-01`
  return d
}

export function formatDate(d: string | number | Date, onlyDate = true) {
  const date = dayjs(normalizeDateInput(d))
  if (onlyDate || date.year() === dayjs().year())
    return date.format('MMM D')
  return date.format('MMM D, YYYY')
}
