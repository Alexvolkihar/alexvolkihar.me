<script setup lang="ts">
import { getSeries } from '~/logics/genart'

// One live piece of a series, for use inside a Markdown post:
//   <GenArtDemo series="strata" />
// It starts on the series' first gallery piece (so the server-rendered HTML
// and the first client render agree), draws only once it scrolls near the
// viewport, and can be reseeded with a fresh random hash.

const props = defineProps<{
  series: string
  /** UI language. Defaults to the `lang` of the page frontmatter, then English. */
  lang?: string
}>()

const UI = {
  en: { reseed: 'Reseed', reseedLabel: (t: string) => `Reseed: draw a new random ${t} piece`, reset: 'Back to the first piece', resetLabel: (t: string) => `Back to the first piece of ${t}`, open: 'Open the series' },
  fr: { reseed: 'Relancer', reseedLabel: (t: string) => `Relancer : tirer une nouvelle œuvre ${t} au hasard`, reset: 'Revenir à la première œuvre', resetLabel: (t: string) => `Revenir à la première œuvre (${t})`, open: 'Ouvrir la série' },
  ja: { reseed: '新しいシード', reseedLabel: (t: string) => `新しいシード：${t}のランダムな作品を描く`, reset: '最初の作品に戻す', resetLabel: (t: string) => `最初の作品に戻す（${t}）`, open: 'シリーズを開く' },
}
const route = useRoute()
const t = computed(() => {
  const lang = props.lang ?? (route.meta as { frontmatter?: { lang?: string } }).frontmatter?.lang
  return UI[lang as keyof typeof UI] ?? UI.en
})

const def = computed(() => getSeries(props.series))
const first = computed(() => def.value.gallery[0])
const hash = ref(first.value)
watch(first, (h) => {
  hash.value = h
})

// Several of these sit in one article and some series take a noticeable
// moment to render: draw each one only when it comes close to the screen.
const root = ref<HTMLElement>()
const visible = ref(false)
const { stop } = useIntersectionObserver(root, (entries) => {
  if (entries.some(e => e.isIntersecting)) {
    visible.value = true
    stop()
  }
}, { rootMargin: '300px 0px' })

const traits = computed(() => Object.entries(def.value.features(hash.value)))
const isFirst = computed(() => hash.value === first.value)
const short = computed(() => `${hash.value.slice(0, 10)}…${hash.value.slice(-4)}`)

function reseed() {
  // Picks WHICH piece to show, never how it is drawn: the drawing stays a
  // pure function of the hash.
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  hash.value = `0x${Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')}`
}

function reset() {
  hash.value = first.value
}
</script>

<template>
  <figure ref="root" class="genart-demo my-8 mx-0">
    <div class="max-w-110 mx-auto aspect-square bg-gray/5">
      <GenArtCanvas v-if="visible" :series="series" :hash="hash" />
    </div>
    <figcaption class="max-w-110 mx-auto mt-3 text-sm text-left">
      <div aria-live="polite">
        <span class="font-mono op50" :title="hash">{{ def.title }} · {{ short }}</span>
        <div class="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
          <span v-for="[k, v] of traits" :key="k">
            <span op50>{{ k }}</span> {{ v }}
          </span>
        </div>
      </div>
      <div class="flex flex-wrap gap-2 mt-3">
        <button btn-gray class="text-sm" :aria-label="t.reseedLabel(def.title)" @click="reseed()">
          <div i-ri-shuffle-line inline-block align-middle /> {{ t.reseed }}
        </button>
        <button
          btn-gray class="text-sm"
          :disabled="isFirst"
          :class="{ 'op25! pointer-events-none': isFirst }"
          :aria-label="t.resetLabel(def.title)"
          @click="reset()"
        >
          <div i-ri-arrow-go-back-line inline-block align-middle /> {{ t.reset }}
        </button>
        <RouterLink
          btn-gray class="text-sm"
          :to="{ path: `/genart/${series}`, query: { hash } }"
        >
          <div i-ri-arrow-right-up-line inline-block align-middle /> {{ t.open }}
        </RouterLink>
      </div>
    </figcaption>
  </figure>
</template>
