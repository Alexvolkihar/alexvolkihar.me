<script setup lang="ts">
interface Seed {
  angle: number
  radius: number
  speed: number
  phase: number
}

const el = ref<HTMLCanvasElement | null>(null)
const size = reactive(useWindowSize())

const SEGMENTS = 8
const SEED_COUNT = 14
const ROTATION_SPEED = 0.05
const WOBBLE = 20

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

function makeSeeds(maxRadius: number): Seed[] {
  const wedgeAngle = (Math.PI * 2) / SEGMENTS
  return Array.from({ length: SEED_COUNT }, () => ({
    angle: Math.random() * wedgeAngle,
    radius: Math.random() * maxRadius,
    speed: 0.3 + Math.random() * 0.6,
    phase: Math.random() * Math.PI * 2,
  }))
}

onMounted(() => {
  const canvas = el.value!
  let ctx = initCanvas(canvas, size.width, size.height)
  let maxRadius = Math.min(size.width, size.height) * 0.5
  let seeds = makeSeeds(maxRadius)

  useEventListener('resize', () => {
    ctx = initCanvas(canvas, size.width, size.height)
    maxRadius = Math.min(size.width, size.height) * 0.5
    seeds = makeSeeds(maxRadius)
  })

  useRafFn(() => {
    const t = Date.now() / 1000
    ctx.clearRect(0, 0, size.width, size.height)

    const wedgeAngle = (Math.PI * 2) / SEGMENTS
    const rotation = t * ROTATION_SPEED

    ctx.save()
    ctx.translate(size.width / 2, size.height / 2)

    for (let i = 0; i < SEGMENTS; i++) {
      ctx.save()
      ctx.rotate(rotation + i * wedgeAngle)
      if (i % 2 === 1)
        ctx.scale(1, -1)

      ctx.fillStyle = 'rgba(136, 136, 136, 0.25)'
      for (const seed of seeds) {
        const r = seed.radius + Math.sin(t * seed.speed + seed.phase) * WOBBLE
        const x = Math.cos(seed.angle) * r
        const y = Math.sin(seed.angle) * r
        ctx.beginPath()
        ctx.arc(x, y, 2, 0, Math.PI * 2)
        ctx.fill()
      }

      ctx.restore()
    }

    ctx.restore()
  })
})
</script>

<template>
  <div class="fixed top-0 bottom-0 left-0 right-0 pointer-events-none print:hidden" style="z-index: -1">
    <canvas ref="el" :width="size.width" :height="size.height" />
  </div>
</template>
