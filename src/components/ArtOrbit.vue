<script setup lang="ts">
interface Particle {
  angle: number
  radius: number
  speed: number
  center: number
}

const el = ref<HTMLCanvasElement | null>(null)
const size = reactive(useWindowSize())

const CENTERS_COUNT = 3
const PARTICLES_PER_CENTER = 40

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

function randomCenters(width: number, height: number) {
  return Array.from({ length: CENTERS_COUNT }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
  }))
}

onMounted(() => {
  const canvas = el.value!
  let ctx = initCanvas(canvas, size.width, size.height)
  let centers = randomCenters(size.width, size.height)

  const particles: Particle[] = []
  for (let c = 0; c < CENTERS_COUNT; c++) {
    for (let i = 0; i < PARTICLES_PER_CENTER; i++) {
      particles.push({
        angle: Math.random() * Math.PI * 2,
        radius: 20 + Math.random() * 120,
        speed: (0.1 + Math.random() * 0.4) * (Math.random() < 0.5 ? 1 : -1),
        center: c,
      })
    }
  }

  useEventListener('resize', () => {
    ctx = initCanvas(canvas, size.width, size.height)
    centers = randomCenters(size.width, size.height)
  })

  useRafFn(() => {
    // Fade previous frame by eroding alpha (destination-out) instead of
    // painting grey over it, otherwise the fill accumulates to full opacity
    // within about a second and blacks out the whole background.
    ctx.globalCompositeOperation = 'destination-out'
    ctx.fillStyle = 'rgba(0, 0, 0, 0.06)'
    ctx.fillRect(0, 0, size.width, size.height)
    ctx.globalCompositeOperation = 'source-over'

    ctx.fillStyle = '#88888844'
    for (const p of particles) {
      p.angle += p.speed * 0.02
      const c = centers[p.center]
      const x = c.x + Math.cos(p.angle) * p.radius
      const y = c.y + Math.sin(p.angle) * p.radius * 0.6
      ctx.beginPath()
      ctx.arc(x, y, 1, 0, Math.PI * 2)
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
