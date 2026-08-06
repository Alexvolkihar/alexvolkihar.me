<script setup lang="ts">
interface Point {
  x: number
  y: number
  vx: number
  vy: number
}

const el = ref<HTMLCanvasElement | null>(null)
const size = reactive(useWindowSize())

const COUNT = 70
const LINK_DIST = 120
const SPEED = 0.15

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

function makePoints(width: number, height: number) {
  return Array.from({ length: COUNT }, (): Point => ({
    x: Math.random() * width,
    y: Math.random() * height,
    vx: (Math.random() - 0.5) * SPEED,
    vy: (Math.random() - 0.5) * SPEED,
  }))
}

onMounted(() => {
  const canvas = el.value!
  let ctx = initCanvas(canvas, size.width, size.height)
  let points = makePoints(size.width, size.height)

  useEventListener('resize', () => {
    ctx = initCanvas(canvas, size.width, size.height)
    points = makePoints(size.width, size.height)
  })

  useRafFn(() => {
    ctx.clearRect(0, 0, size.width, size.height)

    for (const p of points) {
      p.x += p.vx
      p.y += p.vy
      if (p.x < 0 || p.x > size.width)
        p.vx *= -1
      if (p.y < 0 || p.y > size.height)
        p.vy *= -1
    }

    ctx.strokeStyle = '#888888'
    ctx.lineWidth = 1
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const a = points[i]
        const b = points[j]
        const d = Math.hypot(a.x - b.x, a.y - b.y)
        if (d < LINK_DIST) {
          ctx.globalAlpha = (1 - d / LINK_DIST) * 0.25
          ctx.beginPath()
          ctx.moveTo(a.x, a.y)
          ctx.lineTo(b.x, b.y)
          ctx.stroke()
        }
      }
    }

    ctx.globalAlpha = 0.5
    ctx.fillStyle = '#888888'
    for (const p of points) {
      ctx.beginPath()
      ctx.arc(p.x, p.y, 1.4, 0, Math.PI * 2)
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
