<script setup lang="ts">
interface Droplet {
  x: number
  lane: number
  speed: number
}

const el = ref<HTMLCanvasElement | null>(null)
const size = reactive(useWindowSize())

const LANES = 4
const DROPLETS_PER_LANE = 14
const AMPLITUDE = 50
const WAVELENGTH = 320
const STEP = 12

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

function riverY(x: number, baseY: number, phase: number) {
  return baseY
    + Math.sin(x / WAVELENGTH + phase) * AMPLITUDE
    + Math.sin(x / (WAVELENGTH * 0.37) + phase * 1.6) * AMPLITUDE * 0.3
}

function makeDroplets(width: number) {
  const droplets: Droplet[] = []
  for (let lane = 0; lane < LANES; lane++) {
    for (let i = 0; i < DROPLETS_PER_LANE; i++) {
      droplets.push({
        x: Math.random() * width,
        lane,
        speed: 0.4 + Math.random() * 0.5,
      })
    }
  }
  return droplets
}

onMounted(() => {
  const canvas = el.value!
  let ctx = initCanvas(canvas, size.width, size.height)
  let droplets = makeDroplets(size.width)

  useEventListener('resize', () => {
    ctx = initCanvas(canvas, size.width, size.height)
    droplets = makeDroplets(size.width)
  })

  useRafFn(() => {
    ctx.clearRect(0, 0, size.width, size.height)

    const laneYs = Array.from({ length: LANES }, (_, i) => size.height * ((i + 1) / (LANES + 1)))
    const phase = Date.now() * 0.0002

    ctx.strokeStyle = 'rgba(136, 136, 136, 0.1)'
    ctx.lineWidth = 1
    for (let lane = 0; lane < LANES; lane++) {
      ctx.beginPath()
      for (let x = 0; x <= size.width; x += STEP) {
        const y = riverY(x, laneYs[lane], phase + lane)
        if (x === 0)
          ctx.moveTo(x, y)
        else
          ctx.lineTo(x, y)
      }
      ctx.stroke()
    }

    ctx.fillStyle = 'rgba(136, 136, 136, 0.35)'
    for (const d of droplets) {
      d.x += d.speed
      if (d.x > size.width)
        d.x = 0
      const y = riverY(d.x, laneYs[d.lane], phase + d.lane)
      ctx.beginPath()
      ctx.arc(d.x, y, 1.4, 0, Math.PI * 2)
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
