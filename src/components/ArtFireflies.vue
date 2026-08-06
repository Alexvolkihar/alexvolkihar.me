<script setup lang="ts">
interface Firefly {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  phase: number
  speed: number
}

const el = ref<HTMLCanvasElement | null>(null)
const size = reactive(useWindowSize())

const COUNT = 24
const ACCEL = 0.02
const MAX_SPEED = 0.35

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

function makeFirefly(width: number, height: number): Firefly {
  return {
    x: Math.random() * width,
    y: Math.random() * height,
    vx: 0,
    vy: 0,
    radius: 6 + Math.random() * 8,
    phase: Math.random() * Math.PI * 2,
    speed: 0.8 + Math.random() * 1.2,
  }
}

onMounted(() => {
  const canvas = el.value!
  let ctx = initCanvas(canvas, size.width, size.height)
  let flies = Array.from({ length: COUNT }, () => makeFirefly(size.width, size.height))

  useEventListener('resize', () => {
    ctx = initCanvas(canvas, size.width, size.height)
    flies = Array.from({ length: COUNT }, () => makeFirefly(size.width, size.height))
  })

  useRafFn(() => {
    const t = Date.now() / 1000
    ctx.clearRect(0, 0, size.width, size.height)

    for (const f of flies) {
      f.vx += (Math.random() - 0.5) * ACCEL
      f.vy += (Math.random() - 0.5) * ACCEL
      const speed = Math.hypot(f.vx, f.vy)
      if (speed > MAX_SPEED) {
        f.vx = (f.vx / speed) * MAX_SPEED
        f.vy = (f.vy / speed) * MAX_SPEED
      }

      f.x += f.vx
      f.y += f.vy

      if (f.x < -20)
        f.x = size.width + 20
      if (f.x > size.width + 20)
        f.x = -20
      if (f.y < -20)
        f.y = size.height + 20
      if (f.y > size.height + 20)
        f.y = -20

      const glow = (Math.sin(t * f.speed + f.phase) + 1) / 2
      const alpha = 0.08 + glow * 0.22

      const gradient = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.radius)
      gradient.addColorStop(0, `rgba(136, 136, 136, ${alpha})`)
      gradient.addColorStop(1, 'rgba(136, 136, 136, 0)')

      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.arc(f.x, f.y, f.radius, 0, Math.PI * 2)
      ctx.fill()
    }
  })
})
</script>

<template>
  <div class="fixed top-0 bottom-0 left-0 right-0 pointer-events-none print:hidden" style="z-index: -1">
    <canvas ref="el" :width="size.width" :height="size.height" />
  </div>
</template>
