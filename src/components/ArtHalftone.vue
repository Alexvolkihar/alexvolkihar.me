<script setup lang="ts">
import { createNoise2D } from 'simplex-noise'

const el = ref<HTMLCanvasElement | null>(null)
const size = reactive(useWindowSize())

const SPACING = 26
const SCALE = 200
const SPEED = 0.00015
const MAX_RADIUS = 3.2

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
    const t = Date.now() * SPEED
    ctx.clearRect(0, 0, size.width, size.height)
    ctx.fillStyle = 'rgba(136, 136, 136, 0.22)'

    for (let x = 0; x < size.width + SPACING; x += SPACING) {
      for (let y = 0; y < size.height + SPACING; y += SPACING) {
        const n = (noise2d(x / SCALE, y / SCALE + t) + 1) / 2
        const radius = n * MAX_RADIUS
        if (radius < 0.3)
          continue

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
