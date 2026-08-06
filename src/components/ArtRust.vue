<script setup lang="ts">
import { createNoise2D } from 'simplex-noise'

const el = ref<HTMLCanvasElement | null>(null)
const size = reactive(useWindowSize())

const SPACING = 16
const SCALE = 60
const DRIFT = 0.00003
const THRESHOLD = 0.35

const noise2d = createNoise2D()

function initCanvas(canvas: HTMLCanvasElement, width: number, height: number) {
  const ctx = canvas.getContext('2d')!
  const dpr = window.devicePixelRatio || 1
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`
  canvas.width = dpr * width
  canvas.height = dpr * height
  ctx.scale(dpr, dpr)
  return ctx
}

onMounted(() => {
  const canvas = el.value!
  let ctx = initCanvas(canvas, size.width, size.height)

  useEventListener('resize', () => {
    ctx = initCanvas(canvas, size.width, size.height)
  })

  useRafFn(() => {
    const t = Date.now() * DRIFT
    ctx.clearRect(0, 0, size.width, size.height)

    for (let x = 0; x < size.width; x += SPACING) {
      for (let y = 0; y < size.height; y += SPACING) {
        const n = (noise2d(x / SCALE + t, y / SCALE) + 1) / 2
        if (n < THRESHOLD)
          continue

        const norm = (n - THRESHOLD) / (1 - THRESHOLD)
        const alpha = norm * 0.22
        const radius = 1 + norm * 4

        ctx.fillStyle = `rgba(136, 96, 72, ${alpha})`
        ctx.beginPath()
        ctx.arc(x, y, radius, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  })
})
</script>

<template>
  <div class="fixed top-0 bottom-0 left-0 right-0 pointer-events-none print:hidden" style="z-index: -1">
    <canvas ref="el" :width="size.width" :height="size.height" />
  </div>
</template>
