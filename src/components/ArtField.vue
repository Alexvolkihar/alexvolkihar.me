<script setup lang="ts">
import { createNoise2D } from 'simplex-noise'

const el = ref<HTMLCanvasElement | null>(null)
const size = reactive(useWindowSize())

const SPACING = 28
const SCALE = 260
const SPEED = 0.00012
const NEEDLE_LENGTH = 6

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
    ctx.strokeStyle = '#88888833'
    ctx.lineWidth = 1

    for (let x = 0; x < size.width + SPACING; x += SPACING) {
      for (let y = 0; y < size.height + SPACING; y += SPACING) {
        const angle = noise2d(x / SCALE, y / SCALE + t) * Math.PI * 2
        const dx = Math.cos(angle) * NEEDLE_LENGTH
        const dy = Math.sin(angle) * NEEDLE_LENGTH
        ctx.beginPath()
        ctx.moveTo(x - dx, y - dy)
        ctx.lineTo(x + dx, y + dy)
        ctx.stroke()
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
