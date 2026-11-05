<script setup lang="ts">
import { getSeries } from '~/logics/genart'
import { RATIOS } from '~/logics/genart/export'
import { addPngText, drawSignature } from '~/logics/genart/sign'

// Exports one piece at any resolution, aspect ratio and file format. Every
// series draws in a normalised space, so the export is the same artwork as
// the preview, only sharper; non-square ratios let the series extend or
// centre itself on its own background. Exports are signed with the monogram
// and, for PNG, carry title/author/licence text chunks.

const props = defineProps<{
  series: string
  hash: string
  /** PNG Title. Defaults to "<Series> <short hash>". */
  title?: string
  /** File name without the size and extension. Defaults to "<series>-<hash>". */
  fileBase?: string
  /** Copyright year. Defaults to the current year. */
  year?: number
  /** PNG Source. Defaults to the current page URL. */
  source?: string
}>()

// Optional v-model:ratio, so a parent can preset the ratio or read the one picked.
const ratio = defineModel<string>('ratio', { default: '1:1' })

const SIZES = [
  { label: 'Full HD', value: 1920 },
  { label: 'QHD', value: 2560 },
  { label: '4K', value: 3840 },
  { label: '8K', value: 7680 },
  { label: 'Custom', value: 0 },
] as const

const FORMATS = [
  { label: 'PNG', mime: 'image/png', ext: 'png' },
  { label: 'JPEG', mime: 'image/jpeg', ext: 'jpg' },
  { label: 'WebP', mime: 'image/webp', ext: 'webp' },
] as const

const MIN_SIDE = 256
const MAX_SIDE = 16384
// Above this many pixels most browsers refuse to allocate the canvas.
const MAX_AREA = 140_000_000

const sizePreset = ref<number>(3840)
const customSide = ref(5000)
const format = ref<string>('PNG')

const longSide = computed(() => {
  const v = sizePreset.value || Math.round(customSide.value || 0)
  return Math.min(MAX_SIDE, Math.max(MIN_SIDE, v))
})

const dims = computed(() => {
  const r = RATIOS.find(r => r.label === ratio.value) ?? RATIOS[0]
  const long = longSide.value
  if (r.w >= r.h)
    return { w: long, h: Math.round(long * r.h / r.w) }
  return { w: Math.round(long * r.w / r.h), h: long }
})

const tooLarge = computed(() => dims.value.w * dims.value.h > MAX_AREA)
const busy = ref(false)
const error = ref('')

function toBlob(canvas: HTMLCanvasElement, mime: string): Promise<Blob | null> {
  return new Promise(resolve => canvas.toBlob(resolve, mime, 0.95))
}

async function download() {
  if (busy.value || tooLarge.value)
    return
  busy.value = true
  error.value = ''
  // let the "Rendering…" state paint before the synchronous render blocks
  await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)))
  try {
    const { w, h } = dims.value
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx)
      throw new Error('canvas')
    const def = getSeries(props.series)
    def.render(ctx, w, h, props.hash)
    drawSignature(ctx, w, h)

    const fmt = FORMATS.find(f => f.label === format.value) ?? FORMATS[0]
    let blob = await toBlob(canvas, fmt.mime)
    if (!blob)
      throw new Error('encode')
    if (blob.type === 'image/png') {
      blob = await addPngText(blob, {
        Title: props.title ?? `${def.title} ${props.hash.slice(0, 10)}`,
        Author: 'Alexvolkihar',
        Copyright: `© ${props.year ?? new Date().getFullYear()} Alexvolkihar — CC BY-NC-ND 4.0`,
        Source: props.source ?? location.href,
      })
    }
    // Browsers that cannot encode a format (e.g. WebP on Safari) fall back to PNG.
    const ext = FORMATS.find(f => f.mime === blob.type)?.ext ?? 'png'
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${props.fileBase ?? `${props.series}-${props.hash}`}-${w}x${h}.${ext}`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
    canvas.width = canvas.height = 0
  }
  catch {
    error.value = 'This size is too large for this browser. Try a smaller one.'
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-2 text-sm mt-4">
    <label class="flex items-center gap-1">
      <span op50>Size</span>
      <select v-model.number="sizePreset" class="genart-select">
        <option v-for="s of SIZES" :key="s.label" :value="s.value">{{ s.label }}</option>
      </select>
    </label>
    <label v-if="!sizePreset" class="flex items-center gap-1">
      <span op50>Long side</span>
      <input
        v-model.number="customSide"
        type="number"
        :min="MIN_SIDE"
        :max="MAX_SIDE"
        step="100"
        class="genart-select w-22"
      >
    </label>
    <label class="flex items-center gap-1">
      <span op50>Ratio</span>
      <select v-model="ratio" class="genart-select">
        <option v-for="r of RATIOS" :key="r.label" :value="r.label">{{ r.label }}</option>
      </select>
    </label>
    <label class="flex items-center gap-1">
      <span op50>Format</span>
      <select v-model="format" class="genart-select">
        <option v-for="f of FORMATS" :key="f.label" :value="f.label">{{ f.label }}</option>
      </select>
    </label>
    <button btn-gray :disabled="busy || tooLarge" @click="download()">
      <div i-ri-download-2-line /> {{ busy ? 'Rendering…' : 'Download' }}
    </button>
    <span class="font-mono text-xs op50">{{ dims.w }} × {{ dims.h }} px</span>
    <span v-if="tooLarge" class="text-xs text-red-500">Too large: lower the size.</span>
    <span v-else-if="error" class="text-xs text-red-500">{{ error }}</span>
  </div>
</template>

<style scoped>
.genart-select {
  --at-apply: 'bg-transparent border border-base rounded px-1.5 py-0.5 color-base';
}
.genart-select option {
  --at-apply: 'bg-base';
}
</style>
