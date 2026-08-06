<script setup lang="ts">
interface Bubble {
  x: number
  y: number
  radius: number
  speed: number
  drift: number
  phase: number
}

const el = ref<HTMLCanvasElement | null>(null)
const size = reactive(useWindowSize())

const COUNT = 34

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

function makeBubble(width: number, height: number, y?: number): Bubble {
  return {
    x: Math.random() * width,
    y: y ?? Math.random() * height,
    radius: 4 + Math.random() * 14,
    speed: 0.15 + Math.random() * 0.35,
    drift: Math.random() * Math.PI * 2,
    phase: Math.random() * Math.PI * 2,
  }
}

onMounted(() => {
  const canvas = el.value!
  let ctx = initCanvas(canvas, size.width, size.height)
  let bubbles = Array.from({ length: COUNT }, () => makeBubble(size.width, size.height))

  useEventListener('resize', () => {
    ctx = initCanvas(canvas, size.width, size.height)
    bubbles = Array.from({ length: COUNT }, () => makeBubble(size.width, size.height))
  })

  useRafFn(() => {
    ctx.clearRect(0, 0, size.width, size.height)
    ctx.strokeStyle = '#88888855'
    ctx.lineWidth = 1

    for (const b of bubbles) {
      b.y -= b.speed
      b.phase += 0.02
      b.x += Math.sin(b.phase) * 0.3

      if (b.y + b.radius < 0)
        Object.assign(b, makeBubble(size.width, size.height, size.height + b.radius))

      ctx.beginPath()
      ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2)
      ctx.stroke()
    }
  })
})
</script>

<template>
  <div class="fixed top-0 bottom-0 left-0 right-0 pointer-events-none print:hidden" style="z-index: -1">
    <canvas ref="el" :width="size.width" :height="size.height" />
  </div>
</template>
