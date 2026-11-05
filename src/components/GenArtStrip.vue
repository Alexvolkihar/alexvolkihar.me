<script setup lang="ts">
import { allSeries } from '~/logics/genart'

// A compact row of thumbnails, one per series (its first gallery piece),
// each linking to the series page. Drawn only once it comes into view.

const props = defineProps<{
  /** UI language. Defaults to the `lang` of the page frontmatter, then English. */
  lang?: string
}>()

const UI = {
  en: { nav: 'Generative art series', first: (t: string) => `${t}, first piece of the series` },
  fr: { nav: 'Séries d\'art génératif', first: (t: string) => `${t}, première œuvre de la série` },
  ja: { nav: 'ジェネラティブアートのシリーズ', first: (t: string) => `${t}：シリーズ最初の作品` },
}
const route = useRoute()
const t = computed(() => {
  const lang = props.lang ?? (route.meta as { frontmatter?: { lang?: string } }).frontmatter?.lang
  return UI[lang as keyof typeof UI] ?? UI.en
})

const root = ref<HTMLElement>()
const visible = ref(false)
const { stop } = useIntersectionObserver(root, (entries) => {
  if (entries.some(e => e.isIntersecting)) {
    visible.value = true
    stop()
  }
}, { rootMargin: '200px 0px' })
</script>

<template>
  <nav ref="root" :aria-label="t.nav" class="my-8">
    <!-- div + roles rather than ul/li: the prose list bullets would sit on the thumbnails -->
    <div role="list" class="grid grid-cols-4 sm:grid-cols-7 gap-2">
      <div v-for="s of allSeries" :key="s.slug" role="listitem">
        <RouterLink
          :to="`/genart/${s.slug}`"
          class="group block border-none! no-underline! color-base"
          :title="s.title"
        >
          <div class="aspect-square bg-gray/5 overflow-hidden">
            <GenArtCanvas
              v-if="visible"
              :series="s.slug"
              :hash="s.gallery[0]"
              :label="t.first(s.title)"
              class="transition-opacity group-hover:op85"
            />
          </div>
          <div class="text-xs op60 group-hover:op100 mt-1 truncate">
            {{ s.title }}
          </div>
        </RouterLink>
      </div>
    </div>
  </nav>
</template>
