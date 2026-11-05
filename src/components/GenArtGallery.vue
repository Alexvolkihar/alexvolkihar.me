<script setup lang="ts">
import type { AddResult } from '~/logics/genart/admin'
import { getSeries } from '~/logics/genart'
import { useGenArtAuth } from '~/logics/genart/admin'
import { isValidHash } from '~/logics/genart/random'

const props = defineProps<{ series: string }>()

const def = computed(() => getSeries(props.series))

const route = useRoute()
const router = useRouter()

// Read on the client only (the featured block sits in <ClientOnly>): the
// statically generated HTML never knows the query string.
const featured = computed(() => {
  const h = route.query.hash
  return isValidHash(h) ? h.toLowerCase() : undefined
})

function show(hash: string) {
  router.replace({ query: { ...route.query, hash } })
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function newSeed() {
  // The one legitimate unseeded random: it picks WHICH piece to look at,
  // never how it is drawn.
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  show(`0x${Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')}`)
}

const copied = ref(false)
async function copyLink() {
  await navigator.clipboard.writeText(location.href)
  copied.value = true
  setTimeout(() => copied.value = false, 1500)
}

// Ratio picked in the export control, reused by "Copy for collection".
const exportRatio = ref('1:1')

// Author tool, dev server only: copies a ready-to-paste entry for
// data/genart-collection.ts. Never shipped in the production build.
const isDev = import.meta.env.DEV
const copiedEntry = ref(false)
async function copyForCollection() {
  if (!featured.value)
    return
  const month = new Date().toISOString().slice(0, 7)
  const entry = [
    '  {',
    `    name: 'Untitled',`,
    `    series: '${props.series}',`,
    `    hash: '${featured.value}',`,
    `    ratio: '${exportRatio.value}',`,
    `    date: '${month}',`,
    '  },',
  ].join('\n')
  await navigator.clipboard.writeText(`${entry}\n`)
  copiedEntry.value = true
  setTimeout(() => copiedEntry.value = false, 1500)
}

// Owner only, on the deployed site: commits the featured piece to
// data/genart-collection.ts through /api/collection. Showing the button is
// cosmetic; the server checks the session, origin and input on every call.
const { login: adminLogin, addToCollection } = useGenArtAuth()
const addOpen = ref(false)
const addName = ref('')
const addBusy = ref(false)
const addError = ref('')
const added = ref<AddResult>()

function resetAdd() {
  addOpen.value = false
  addName.value = ''
  addBusy.value = false
  addError.value = ''
  added.value = undefined
}
watch(featured, resetAdd)

async function submitAdd() {
  if (!featured.value || addBusy.value)
    return
  const name = addName.value.trim()
  if (!name) {
    addError.value = 'Give the piece a name.'
    return
  }
  addBusy.value = true
  addError.value = ''
  try {
    added.value = await addToCollection({ name, series: props.series, hash: featured.value, ratio: exportRatio.value })
    addOpen.value = false
  }
  catch (e) {
    addError.value = e instanceof Error ? e.message : 'Something went wrong.'
  }
  finally {
    addBusy.value = false
  }
}

const traits = (hash: string) => Object.entries(def.value.features(hash))
const short = (hash: string) => hash.length > 20 ? `${hash.slice(0, 10)}…${hash.slice(-4)}` : hash
</script>

<template>
  <div class="max-w-300 mx-auto px-4">
    <div class="flex flex-wrap gap-2 justify-center mb-8">
      <RouterLink to="/genart" btn-gray>
        <div i-ri-arrow-left-line /> All series
      </RouterLink>
      <button btn-gray @click="newSeed()">
        <div i-ri-shuffle-line /> New seed
      </button>
      <ClientOnly>
        <button v-if="featured" btn-gray @click="copyLink()">
          <div i-ri-link /> {{ copied ? 'Copied' : 'Copy link' }}
        </button>
        <button v-if="isDev && featured" btn-gray title="Dev only: copy an entry for data/genart-collection.ts" @click="copyForCollection()">
          <div i-ri-bookmark-line /> {{ copiedEntry ? 'Copied' : 'Copy for collection' }}
        </button>
      </ClientOnly>
    </div>

    <ClientOnly>
      <figure v-if="featured" class="max-w-140 mx-auto mb-12 mt-0">
        <GenArtCanvas :series="series" :hash="featured" class="shadow-lg" />
        <figcaption class="mt-3 text-sm">
          <div class="font-mono op50 break-all">
            {{ featured }}
          </div>
          <div class="flex flex-wrap gap-x-3 gap-y-1 mt-1">
            <span v-for="[k, v] of traits(featured)" :key="k">
              <span op50>{{ k }}</span> {{ v }}
            </span>
          </div>
          <GenArtDownload v-model:ratio="exportRatio" :series="series" :hash="featured" />
          <div v-if="adminLogin" class="mt-3 text-sm">
            <div v-if="added" class="flex flex-wrap items-center gap-x-2 gap-y-1">
              <div i-ri-check-line text-green-600 />
              <span>Added as n°{{ String(added.number).padStart(2, '0') }}. It will appear after the next deploy (~1 min).</span>
              <a v-if="added.commitUrl" :href="added.commitUrl" target="_blank" rel="noopener" class="op60 hover:op100">View commit</a>
            </div>
            <form v-else-if="addOpen" class="flex flex-wrap items-center gap-2" @submit.prevent="submitAdd()">
              <input
                v-model="addName"
                type="text"
                maxlength="60"
                required
                placeholder="Name of the piece"
                aria-label="Name of the piece"
                class="bg-transparent border border-base rounded px-1.5 py-0.5 color-base w-56"
                :disabled="addBusy"
              >
              <span class="text-xs op50">ratio {{ exportRatio }}</span>
              <button type="submit" btn-gray :disabled="addBusy">
                <div i-ri-add-line /> {{ addBusy ? 'Adding…' : 'Add' }}
              </button>
              <button type="button" class="text-xs op50 hover:op100" :disabled="addBusy" @click="addOpen = false; addError = ''">
                Cancel
              </button>
            </form>
            <button v-else btn-gray @click="addOpen = true">
              <div i-ri-add-circle-line /> Add to collection
            </button>
            <div v-if="addError" class="text-xs text-red-500 mt-1" role="alert">
              {{ addError }}
            </div>
          </div>
        </figcaption>
      </figure>
    </ClientOnly>

    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      <figure v-for="hash of def.gallery" :key="hash" class="m-0">
        <button
          class="block w-full p-0 border-none bg-transparent cursor-pointer transition-opacity hover:op85"
          :title="`Show ${short(hash)}`"
          @click="show(hash)"
        >
          <GenArtCanvas :series="series" :hash="hash" />
        </button>
        <figcaption class="mt-2 text-xs">
          <div class="font-mono op50">
            {{ short(hash) }}
          </div>
          <div class="flex flex-wrap gap-x-2 op75">
            <span v-for="[k, v] of traits(hash)" :key="k">
              <span op60>{{ k }}</span> {{ v }}
            </span>
          </div>
        </figcaption>
      </figure>
    </div>
  </div>
</template>
