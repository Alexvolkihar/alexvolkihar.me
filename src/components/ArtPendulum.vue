<script setup lang="ts">
interface Pendulum {
  pivotX: number
  period: number
}

const el = ref<HTMLCanvasElement | null>(null)
const size = reactive(useWindowSize())

const COUNT = 24
const PIVOT_Y_RATIO = 0.12
const ARM_LENGTH_RATIO = 0.55
const AMPLITUDE = 0.4
const PERIOD_MIN = 3.6
const PERIOD_MAX = 4.8

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

function makePendulums(width: number): Pendulum[] {
  return Array.from({ length: COUNT }, (_, i) => ({
    pivotX: width * ((i + 1) / (COUNT + 1)),
    period: PERIOD_MIN + (PERIOD_MAX - PERIOD_MIN) * (i / (COUNT - 1)),
  }))
}

onMounted(() => {
  const canvas = el.value!
  let ctx = initCanvas(canvas, size.width, size.height)
  let pendulums = makePendulums(size.width)

  useEventListener('resize', () => {
    ctx = initCanvas(canvas, size.width, size.height)
    pendulums = makePendulums(size.width)
  })

  useRafFn(() => {
    const t = Date.now() / 1000
    ctx.clearRect(0, 0, size.width, size.height)

    const pivotY = size.height * PIVOT_Y_RATIO
    const armLength = size.height * ARM_LENGTH_RATIO

    ctx.strokeStyle = 'rgba(136, 136, 136, 0.18)'
    ctx.fillStyle = 'rgba(136, 136, 136, 0.3)'
    ctx.lineWidth = 1

    for (const p of pendulums) {
      const theta = Math.sin((Math.PI * 2 * t) / p.period) * AMPLITUDE
      const bobX = p.pivotX + Math.sin(theta) * armLength
      const bobY = pivotY + Math.cos(theta) * armLength

      ctx.beginPath()
      ctx.moveTo(p.pivotX, pivotY)
      ctx.lineTo(bobX, bobY)
      ctx.stroke()

      ctx.beginPath()
      ctx.arc(bobX, bobY, 3, 0, Math.PI * 2)
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
