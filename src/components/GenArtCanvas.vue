<script setup lang="ts">
import { getSeries } from '~/logics/genart'

// A static, hash-seeded piece. The buffer is the element's CSS size times
// devicePixelRatio, and the drawing is done in a normalised space, so the
// image is the same artwork at any size. Drawing only happens client-side
// (onMounted / resize), which keeps the component SSR-safe.

const props = defineProps<{
  series: string
  hash: string
  /** Width / height. Square when omitted. */
  ratio?: number
  /** Accessible label. Defaults to the series title, the short hash and the traits. */
  label?: string
}>()

const def = computed(() => getSeries(props.series))
const el = ref<HTMLCanvasElement>()
const aspect = computed(() => props.ratio && props.ratio > 0 ? props.ratio : 1)
const ariaLabel = computed(() => {
  if (props.label)
    return props.label
  const f = def.value.features(props.hash)
  return `${def.value.title} ${props.hash.slice(0, 10)}: ${Object.entries(f).map(([k, v]) => `${k} ${v}`).join(', ')}`
})

let drawn = ''

function draw() {
  const canvas = el.value
  if (!canvas || !canvas.clientWidth)
    return
  const dpr = Math.min(window.devicePixelRatio || 1, 3)
  const px = Math.round(canvas.clientWidth * dpr)
  const pxH = Math.round(px / aspect.value)
  const key = `${props.series}:${props.hash}@${px}x${pxH}`
  if (key === drawn)
    return
  drawn = key
  canvas.width = px
  canvas.height = pxH
  def.value.render(canvas.getContext('2d')!, px, pxH, props.hash)
}

onMounted(draw)
useResizeObserver(el, draw)
watch(() => [props.series, props.hash, props.ratio], draw)
</script>

<template>
  <canvas
    ref="el"
    role="img"
    :aria-label="ariaLabel"
    class="block w-full"
    :class="{ 'aspect-square': !ratio }"
    :style="ratio ? { aspectRatio: String(aspect) } : undefined"
  />
</template>
