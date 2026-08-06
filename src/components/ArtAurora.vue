<script setup lang="ts">
interface Band {
  yRatio: number
  amplitude: number
  wavelength: number
  speed: number
  phase: number
  thickness: number
}

const el = ref<HTMLCanvasElement | null>(null)
const size = reactive(useWindowSize())

const BANDS: Band[] = [
  { yRatio: 0.25, amplitude: 40, wavelength: 260, speed: 0.4, phase: 0, thickness: 60 },
  { yRatio: 0.45, amplitude: 55, wavelength: 320, speed: -0.3, phase: 1.4, thickness: 80 },
  { yRatio: 0.68, amplitude: 35, wavelength: 200, speed: 0.25, phase: 3.1, thickness: 50 },
]
const STEP = 16

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

function drawBand(ctx: CanvasRenderingContext2D, band: Band, width: number, height: number, t: number) {
  const yBase = height * band.yRatio

  ctx.beginPath()
  ctx.moveTo(0, yBase + Math.sin(t * band.speed + band.phase) * band.amplitude)
  for (let x = 0; x <= width; x += STEP) {
    const y = yBase + Math.sin(x / band.wavelength + t * band.speed + band.phase) * band.amplitude
    ctx.lineTo(x, y)
  }
  for (let x = width; x >= 0; x -= STEP) {
    const y = yBase + band.thickness + Math.sin(x / band.wavelength + t * band.speed + band.phase + 0.6) * band.amplitude
    ctx.lineTo(x, y)
  }
  ctx.closePath()
  ctx.fill()
}

onMounted(() => {
  const canvas = el.value!
  let ctx = initCanvas(canvas, size.width, size.height)

  useEventListener('resize', () => {
    ctx = initCanvas(canvas, size.width, size.height)
  })

  useRafFn(() => {
    const t = Date.now() / 1000
    ctx.clearRect(0, 0, size.width, size.height)
    ctx.fillStyle = 'rgba(136, 136, 136, 0.07)'

    for (const band of BANDS)
      drawBand(ctx, band, size.width, size.height, t)
  })
})
</script>

<template>
  <div class="fixed top-0 bottom-0 left-0 right-0 pointer-events-none print:hidden" style="z-index: -1">
    <canvas ref="el" :width="size.width" :height="size.height" />
  </div>
</template>
