<script setup lang='ts'>
import { formatDate } from '~/logics'

const { frontmatter } = defineProps({
  frontmatter: {
    type: Object,
    required: true,
  },
})

const router = useRouter()
const route = useRoute()
const content = ref<HTMLDivElement>()

const base = 'https://alexvolkihar.ovh'
const linkedinShareUrl = computed(() => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(`${base}${route.path}`)}`)

onMounted(() => {
  const navigate = () => {
    if (location.hash) {
      const el = document.querySelector(decodeURIComponent(location.hash))
      if (el) {
        const rect = el.getBoundingClientRect()
        const y = window.scrollY + rect.top - 40
        window.scrollTo({
          top: y,
          behavior: 'smooth',
        })
        return true
      }
    }
  }

  const handleAnchors = (
    event: MouseEvent & { target: HTMLElement },
  ) => {
    const link = event.target.closest('a')

    if (
      !event.defaultPrevented
      && link
      && event.button === 0
      && link.target !== '_blank'
      && link.rel !== 'external'
      && !link.download
      && !event.metaKey
      && !event.ctrlKey
      && !event.shiftKey
      && !event.altKey
    ) {
      const url = new URL(link.href)
      if (url.origin !== window.location.origin)
        return

      event.preventDefault()
      const { pathname, hash } = url
      if (hash && (!pathname || pathname === location.pathname)) {
        window.history.replaceState({}, '', hash)
        navigate()
      }
      else {
        router.push({ path: pathname, hash })
      }
    }
  }

  useEventListener(window, 'hashchange', navigate)
  useEventListener(content.value!, 'click', handleAnchors, { passive: false })

  setTimeout(() => {
    if (!navigate())
      setTimeout(navigate, 1000)
  }, 1)
})

const ART_TYPES = ['plum', 'dots', 'field', 'orbit', 'wave', 'constellation', 'rain', 'spiral', 'ripple', 'bubbles', 'truchet', 'stars', 'lissajous', 'fireflies', 'aurora', 'grid', 'halftone', 'circuit', 'river', 'rust', 'snow', 'radar', 'glass', 'pendulum', 'kaleidoscope'] as const

const ART_LOADERS: Record<typeof ART_TYPES[number], () => Promise<any>> = {
  plum: () => import('./ArtPlum.vue'),
  dots: () => import('./ArtDots.vue'),
  field: () => import('./ArtField.vue'),
  orbit: () => import('./ArtOrbit.vue'),
  wave: () => import('./ArtWave.vue'),
  constellation: () => import('./ArtConstellation.vue'),
  rain: () => import('./ArtRain.vue'),
  spiral: () => import('./ArtSpiral.vue'),
  ripple: () => import('./ArtRipple.vue'),
  bubbles: () => import('./ArtBubbles.vue'),
  truchet: () => import('./ArtTruchet.vue'),
  stars: () => import('./ArtStars.vue'),
  lissajous: () => import('./ArtLissajous.vue'),
  fireflies: () => import('./ArtFireflies.vue'),
  aurora: () => import('./ArtAurora.vue'),
  grid: () => import('./ArtGrid.vue'),
  halftone: () => import('./ArtHalftone.vue'),
  circuit: () => import('./ArtCircuit.vue'),
  river: () => import('./ArtRiver.vue'),
  rust: () => import('./ArtRust.vue'),
  snow: () => import('./ArtSnow.vue'),
  radar: () => import('./ArtRadar.vue'),
  glass: () => import('./ArtGlass.vue'),
  pendulum: () => import('./ArtPendulum.vue'),
  kaleidoscope: () => import('./ArtKaleidoscope.vue'),
}

// Exposed as `data-art` on the rendered background so the active variant is
// visible in devtools when `art: random` is in play.
const resolvedArt = computed(() => {
  const art = frontmatter.art
  if (art === 'random')
    return ART_TYPES[Math.floor(Math.random() * ART_TYPES.length)]
  return art as typeof ART_TYPES[number] | undefined
})

const ArtComponent = computed(() => {
  if (typeof window === 'undefined' || !resolvedArt.value)
    return undefined
  const loader = ART_LOADERS[resolvedArt.value]
  return loader ? defineAsyncComponent(loader) : undefined
})
</script>

<template>
  <ClientOnly v-if="ArtComponent">
    <component :is="ArtComponent" :data-art="resolvedArt" />
  </ClientOnly>
  <div
    v-if="frontmatter.display ?? frontmatter.title"
    class="prose m-auto mb-8"
    :lang="frontmatter.lang"
    :class="[frontmatter.wrapperClass]"
  >
    <h1 class="mb-0 slide-enter-50">
      {{ frontmatter.display ?? frontmatter.title }}
    </h1>
    <p
      v-if="frontmatter.date"
      class="opacity-50 !-mt-6 slide-enter-50"
    >
      {{ formatDate(frontmatter.date, false) }} <span v-if="frontmatter.duration">· {{ frontmatter.duration }}</span>
    </p>
    <p v-if="frontmatter.place" class="mt--4!">
      <span op50>at </span>
      <a v-if="frontmatter.placeLink" :href="frontmatter.placeLink" target="_blank">
        {{ frontmatter.place }}
      </a>
      <span v-else font-bold>
        {{ frontmatter.place }}
      </span>
    </p>
    <p
      v-if="frontmatter.subtitle"
      class="opacity-50 !-mt-6 italic slide-enter"
    >
      {{ frontmatter.subtitle }}
    </p>
    <p
      v-if="frontmatter.draft"
      class="slide-enter" bg-orange-4:10 text-orange-4 border="l-3 orange-4" px4 py2
    >
      This is a draft post, the content may be incomplete. Please check back later.
    </p>
  </div>
  <article
    ref="content"
    :lang="frontmatter.lang"
    :class="[frontmatter.tocAlwaysOn ? 'toc-always-on' : '', frontmatter.class]"
  >
    <slot />
  </article>
  <div v-if="route.path !== '/'" class="prose m-auto mt-8 mb-8 slide-enter animate-delay-500 print:hidden">
    <template v-if="frontmatter.duration">
      <span font-mono op50>> </span>
      <span op50>share on </span>
      <a :href="linkedinShareUrl" target="_blank" op50>linkedin</a>
    </template>
    <br>
    <span font-mono op50>> </span>
    <RouterLink
      :to="route.path.split('/').slice(0, -1).join('/') || '/'"
      class="font-mono op50 hover:op75"
      v-text="'cd ..'"
    />
  </div>
</template>
