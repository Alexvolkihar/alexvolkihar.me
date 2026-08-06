<script setup lang="ts">
interface Blip {
  x: number
  y: number
  angle: number
}

const el = ref<HTMLCanvasElement | null>(null)
const size = reactive(useWindowSize())

const BLIP_COUNT = 24
const SWEEP_SPEED = 0.6
const DECAY_WINDOW = 0.8
const RING_COUNT = 3
const FAN_STEPS = 16

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

function makeBlips(maxRadius: number, cx: number, cy: number): Blip[] {
  return Array.from({ length: BLIP_COUNT }, () => {
    const angle = Math.random() * Math.PI * 2
    const radius = Math.sqrt(Math.random()) * maxRadius
    return {
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
      angle,
    }
  })
}

function normalizeAngle(a: number) {
  const twoPi = Math.PI * 2
  return ((a % twoPi) + twoPi) % twoPi
}

onMounted(() => {
  const canvas = el.value!
  let ctx = initCanvas(canvas, size.width, size.height)
  let cx = size.width / 2
  let cy = size.height / 2
  let maxRadius = Math.min(size.width, size.height) * 0.48
  let blips = makeBlips(maxRadius, cx, cy)

  useEventListener('resize', () => {
    ctx = initCanvas(canvas, size.width, size.height)
    cx = size.width / 2
    cy = size.height / 2
    maxRadius = Math.min(size.width, size.height) * 0.48
    blips = makeBlips(maxRadius, cx, cy)
  })

  useRafFn(() => {
    const t = Date.now() / 1000
    ctx.clearRect(0, 0, size.width, size.height)

    const angle = normalizeAngle(t * SWEEP_SPEED)

    ctx.strokeStyle = 'rgba(136, 136, 136, 0.12)'
    ctx.lineWidth = 1
    for (let i = 1; i <= RING_COUNT; i++) {
      ctx.beginPath()
      ctx.arc(cx, cy, (maxRadius / RING_COUNT) * i, 0, Math.PI * 2)
      ctx.stroke()
    }

    for (let i = 0; i < FAN_STEPS; i++) {
      const a = angle - (i / FAN_STEPS) * DECAY_WINDOW
      const alpha = 0.16 * (1 - i / FAN_STEPS)
      ctx.strokeStyle = `rgba(136, 136, 136, ${alpha})`
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(cx + Math.cos(a) * maxRadius, cy + Math.sin(a) * maxRadius)
      ctx.stroke()
    }

    for (const b of blips) {
      const diff = normalizeAngle(angle - b.angle)
      if (diff > DECAY_WINDOW)
        continue

      const alpha = (1 - diff / DECAY_WINDOW) * 0.5
      ctx.fillStyle = `rgba(136, 136, 136, ${alpha})`
      ctx.beginPath()
      ctx.arc(b.x, b.y, 2, 0, Math.PI * 2)
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
