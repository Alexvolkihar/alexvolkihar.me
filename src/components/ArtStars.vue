<script setup lang="ts">
interface Star {
  x: number
  y: number
  radius: number
  baseAlpha: number
  speed: number
  phase: number
}

const el = ref<HTMLCanvasElement | null>(null)
const size = reactive(useWindowSize())

const COUNT = 140

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

function makeStar(width: number, height: number): Star {
  return {
    x: Math.random() * width,
    y: Math.random() * height,
    radius: 0.6 + Math.random() * 1.2,
    baseAlpha: 0.2 + Math.random() * 0.5,
    speed: 0.6 + Math.random() * 1.4,
    phase: Math.random() * Math.PI * 2,
  }
}

onMounted(() => {
  const canvas = el.value!
  let ctx = initCanvas(canvas, size.width, size.height)
  let stars = Array.from({ length: COUNT }, () => makeStar(size.width, size.height))

  useEventListener('resize', () => {
    ctx = initCanvas(canvas, size.width, size.height)
    stars = Array.from({ length: COUNT }, () => makeStar(size.width, size.height))
  })

  useRafFn(() => {
    const t = Date.now() / 1000
    ctx.clearRect(0, 0, size.width, size.height)
    ctx.fillStyle = '#888888'

    for (const s of stars) {
      const twinkle = (Math.sin(t * s.speed + s.phase) + 1) / 2
      ctx.globalAlpha = s.baseAlpha * (0.4 + twinkle * 0.6)
      ctx.beginPath()
      ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  })
})
</script>

<template>
  <div class="fixed top-0 bottom-0 left-0 right-0 pointer-events-none print:hidden" style="z-index: -1">
    <canvas ref="el" :width="size.width" :height="size.height" />
  </div>
</template>
