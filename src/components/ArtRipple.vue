<script setup lang="ts">
interface Ripple {
  x: number
  y: number
  radius: number
  alpha: number
}

const el = ref<HTMLCanvasElement | null>(null)
const size = reactive(useWindowSize())

const MAX_RADIUS = 160
const GROWTH = 0.6
const SPAWN_INTERVAL = 900

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
  const ripples: Ripple[] = []
  let lastSpawn = 0

  useEventListener('resize', () => {
    ctx = initCanvas(canvas, size.width, size.height)
  })

  useRafFn(() => {
    const now = Date.now()
    if (now - lastSpawn > SPAWN_INTERVAL) {
      lastSpawn = now
      ripples.push({
        x: Math.random() * size.width,
        y: Math.random() * size.height,
        radius: 0,
        alpha: 0.35,
      })
    }

    ctx.clearRect(0, 0, size.width, size.height)
    ctx.lineWidth = 1

    for (let i = ripples.length - 1; i >= 0; i--) {
      const r = ripples[i]
      r.radius += GROWTH
      r.alpha = 0.35 * (1 - r.radius / MAX_RADIUS)

      if (r.radius > MAX_RADIUS) {
        ripples.splice(i, 1)
        continue
      }

      ctx.strokeStyle = `rgba(136, 136, 136, ${Math.max(r.alpha, 0)})`
      ctx.beginPath()
      ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2)
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
