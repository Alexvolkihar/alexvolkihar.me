<script setup lang="ts">
interface Point {
  x: number
  y: number
}

interface Trace {
  points: Point[]
  speed: number
}

const el = ref<HTMLCanvasElement | null>(null)
const size = reactive(useWindowSize())

const STEP = 32
const TRACE_COUNT = 10
const MAX_SEGMENTS = 9

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

function makeTrace(width: number, height: number): Trace {
  const cols = Math.floor(width / STEP)
  const rows = Math.floor(height / STEP)
  let x = Math.floor(Math.random() * cols) * STEP
  let y = Math.floor(Math.random() * rows) * STEP
  const points: Point[] = [{ x, y }]
  let horizontal = Math.random() < 0.5

  const segments = 3 + Math.floor(Math.random() * (MAX_SEGMENTS - 3))
  for (let i = 0; i < segments; i++) {
    const length = (1 + Math.floor(Math.random() * 4)) * STEP
    if (horizontal)
      x += Math.random() < 0.5 ? length : -length
    else
      y += Math.random() < 0.5 ? length : -length

    x = Math.min(Math.max(x, 0), cols * STEP)
    y = Math.min(Math.max(y, 0), rows * STEP)
    points.push({ x, y })
    horizontal = !horizontal
  }

  return { points, speed: 0.15 + Math.random() * 0.2 }
}

function pointAt(trace: Trace, tRaw: number): Point {
  const segCount = trace.points.length - 1
  const t = ((tRaw % 1) + 1) % 1
  const scaled = t * segCount
  const i = Math.min(Math.floor(scaled), segCount - 1)
  const localT = scaled - i
  const a = trace.points[i]
  const b = trace.points[i + 1]
  return {
    x: a.x + (b.x - a.x) * localT,
    y: a.y + (b.y - a.y) * localT,
  }
}

onMounted(() => {
  const canvas = el.value!
  let ctx = initCanvas(canvas, size.width, size.height)
  let traces = Array.from({ length: TRACE_COUNT }, () => makeTrace(size.width, size.height))

  useEventListener('resize', () => {
    ctx = initCanvas(canvas, size.width, size.height)
    traces = Array.from({ length: TRACE_COUNT }, () => makeTrace(size.width, size.height))
  })

  useRafFn(() => {
    const t = Date.now() / 1000
    ctx.clearRect(0, 0, size.width, size.height)

    ctx.strokeStyle = 'rgba(136, 136, 136, 0.28)'
    ctx.lineWidth = 1.2
    ctx.fillStyle = 'rgba(136, 136, 136, 0.35)'

    for (const trace of traces) {
      ctx.beginPath()
      ctx.moveTo(trace.points[0].x, trace.points[0].y)
      for (let i = 1; i < trace.points.length; i++)
        ctx.lineTo(trace.points[i].x, trace.points[i].y)
      ctx.stroke()

      for (const p of trace.points) {
        ctx.beginPath()
        ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2)
        ctx.fill()
      }

      const pulse = pointAt(trace, t * trace.speed)
      ctx.beginPath()
      ctx.arc(pulse.x, pulse.y, 2.2, 0, Math.PI * 2)
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
