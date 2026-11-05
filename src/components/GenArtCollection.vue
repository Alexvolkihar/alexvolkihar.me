<script setup lang="ts">
import type { Piece } from '~/logics/genart/collection'
import { blurhashToGradientCssObject } from '@unpic/placeholder'
import { getSeries } from '~/logics/genart'
import { formatNumber, pieces } from '~/logics/genart/collection'

// The numbered collection: live pieces re-rendered from data/genart-collection.ts
// plus archived renders from artworks/. The hash is never shown here; a piece
// is addressed by its slug (?piece=<slug>), which opens it in the large view.

const route = useRoute()

const currentSlug = ref<string>()
const current = computed(() => pieces.find(p => p.slug === currentSlug.value))
const currentIndex = computed(() => pieces.findIndex(p => p.slug === currentSlug.value))

// Ratio of the export control in the large view, preset from the entry.
const exportRatio = ref('1:1')

function pieceUrl(p: Piece) {
  return `/genart/collection?piece=${encodeURIComponent(p.slug)}`
}

// The URL is updated in place (no router navigation), so opening a piece
// neither scrolls the page nor adds history entries, and stays shareable.
function syncUrl() {
  const url = current.value ? pieceUrl(current.value) : location.pathname
  history.replaceState(history.state, '', url)
}

function open(p: Piece) {
  currentSlug.value = p.slug
  if (p.kind === 'live')
    exportRatio.value = p.ratio
  syncUrl()
}

function close() {
  currentSlug.value = undefined
  syncUrl()
}

function step(delta: number) {
  if (currentIndex.value < 0)
    return
  const next = pieces[currentIndex.value + delta]
  if (next)
    open(next)
}

function openFromQuery() {
  const slug = route.query.piece
  const p = typeof slug === 'string' ? pieces.find(p => p.slug === slug) : undefined
  if (p)
    open(p)
}

onMounted(openFromQuery)
watch(() => route.query.piece, openFromQuery)

watch(current, (p) => {
  document.documentElement.style.overflow = p ? 'hidden' : ''
})
onBeforeUnmount(() => {
  document.documentElement.style.overflow = ''
})

onKeyStroke('Escape', (e) => {
  if (!current.value)
    return
  close()
  e.preventDefault()
})
onKeyStroke('ArrowRight', (e) => {
  if (!current.value)
    return
  step(1)
  e.preventDefault()
})
onKeyStroke('ArrowLeft', (e) => {
  if (!current.value)
    return
  step(-1)
  e.preventDefault()
})

const label = (p: Piece) => p.seriesTitle ? `${p.seriesTitle} — ${p.name}` : p.name
function meta(p: Piece) {
  const first = p.kind === 'live' ? formatNumber(p.number) : 'Archived render'
  return p.year ? `${first} · ${p.year}` : first
}
function traits(p: Piece) {
  return p.kind === 'live'
    ? Object.entries(getSeries(p.seriesSlug).features(p.hash))
    : []
}
function fileBase(p: Piece) {
  return p.kind === 'live'
    ? `alexvolkihar-${String(p.number).padStart(2, '0')}-${p.slug}`
    : p.slug
}

const source = computed(() => typeof location === 'undefined' ? undefined : `${location.origin}/genart/collection`)

// Large view: as big as the viewport allows, keeping room for the caption.
const viewStyle = computed(() => current.value
  ? { width: `min(92vw, calc(68vh * ${current.value.aspect}))` }
  : undefined)
</script>

<template>
  <div class="max-w-300 mx-auto px-4">
    <div class="flex flex-wrap gap-2 justify-center mb-8">
      <RouterLink to="/genart" btn-gray>
        <div i-ri-arrow-left-line /> All series
      </RouterLink>
    </div>

    <!-- Row-major grid so the catalogue reads n°01, n°02, n°03 across; each
         piece keeps its own ratio and they share a bottom line per row. -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-12 items-end">
      <figure v-for="p of pieces" :key="p.slug" class="m-0">
        <button
          class="block w-full p-0 border-none bg-transparent cursor-zoom-in transition-opacity hover:op85"
          :title="`View ${p.name}`"
          @click="open(p)"
        >
          <GenArtCanvas
            v-if="p.kind === 'live'"
            :series="p.seriesSlug"
            :hash="p.hash"
            :ratio="p.aspect"
            :label="label(p)"
          />
          <img
            v-else
            :src="p.url"
            :alt="label(p)"
            :width="p.width"
            :height="p.height"
            :style="p.blurhash ? blurhashToGradientCssObject(p.blurhash) as any : undefined"
            loading="lazy"
            class="no-preview block w-full h-auto m-0!"
          >
        </button>
        <figcaption class="mt-2 text-sm">
          <div>
            <RouterLink v-if="p.seriesSlug" :to="`/genart/${p.seriesSlug}`" class="op60 hover:op100">
              {{ p.seriesTitle }}
            </RouterLink>
            <span v-if="p.seriesSlug" op40> — </span>
            <a :href="pieceUrl(p)" class="font-medium" @click.prevent="open(p)">{{ p.name }}</a>
          </div>
          <div class="text-xs op50 mt-0.5">
            {{ meta(p) }}
          </div>
          <div v-if="p.note" class="text-xs op60 mt-0.5">
            {{ p.note }}
          </div>
        </figcaption>
      </figure>
    </div>
  </div>

  <ClientOnly>
    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="current"
          class="fixed inset-0 z-500 backdrop-blur-7 flex flex-col items-center justify-center gap-3 p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          :aria-label="label(current)"
          @click.self="close()"
        >
          <div class="absolute inset-0 bg-black:60 -z-1" @click="close()" />

          <button class="absolute top-3 right-3 p-2 text-white op70 hover:op100" title="Close (Esc)" @click="close()">
            <div i-ri-close-line text-2xl />
          </button>
          <button
            v-if="currentIndex > 0"
            class="absolute left-2 top-1/2 -translate-y-1/2 p-2 text-white op60 hover:op100 lt-sm:hidden"
            title="Previous (←)"
            @click="step(-1)"
          >
            <div i-ri-arrow-left-s-line text-3xl />
          </button>
          <button
            v-if="currentIndex < pieces.length - 1"
            class="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-white op60 hover:op100 lt-sm:hidden"
            title="Next (→)"
            @click="step(1)"
          >
            <div i-ri-arrow-right-s-line text-3xl />
          </button>

          <div :key="current.slug" class="shrink-0" :style="viewStyle">
            <GenArtCanvas
              v-if="current.kind === 'live'"
              :series="current.seriesSlug"
              :hash="current.hash"
              :ratio="current.aspect"
              :label="label(current)"
              class="shadow-2xl"
            />
            <img
              v-else
              :src="current.url"
              :alt="label(current)"
              :width="current.width"
              :height="current.height"
              class="no-preview block w-full h-auto shadow-2xl"
            >
          </div>

          <div class="shrink-0 bg-base color-base border border-base rounded-lg px-4 py-3 shadow-xl text-sm" :style="viewStyle">
            <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <div class="text-base">
                <span v-if="current.seriesTitle" op60>{{ current.seriesTitle }} — </span>
                <span font-medium>{{ current.name }}</span>
              </div>
              <div class="text-xs op50">
                {{ meta(current) }}
              </div>
              <div class="flex-auto" />
              <RouterLink v-if="current.seriesSlug" :to="`/genart/${current.seriesSlug}`" class="text-xs op60 hover:op100">
                Series page →
              </RouterLink>
            </div>
            <div v-if="current.note" class="text-xs op60 mt-1">
              {{ current.note }}
            </div>
            <div v-if="current.kind === 'live'" class="flex flex-wrap gap-x-2 text-xs op50 mt-1">
              <span v-for="[k, v] of traits(current)" :key="k">
                <span op60>{{ k }}</span> {{ v }}
              </span>
            </div>
            <GenArtDownload
              v-if="current.kind === 'live'"
              v-model:ratio="exportRatio"
              :series="current.seriesSlug"
              :hash="current.hash"
              :title="current.name"
              :file-base="fileBase(current)"
              :year="current.year"
              :source="source"
            />
          </div>
        </div>
      </Transition>
    </Teleport>
  </ClientOnly>
</template>
