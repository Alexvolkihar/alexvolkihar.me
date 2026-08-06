<script setup lang="ts">
interface Curve {
  a: number
  b: number
  delta: number
  freq: number
  cx: number
  cy: number
  rx: number
  ry: number
}

const el = ref<HTMLCanvasElement | null>(null)
const size = reactive(useWindowSize())

const RATIOS = [
  { a: 3, b: 2, delta: Math.PI / 2, freq: 0.00025 },
  { a: 5, b: 4, delta: Math.PI / 3, freq: 0.00018 },
  { a: 4, b: 3, delta: Math.PI / 5, freq: 0.0002 },
]
const SAMPLES = 240

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

function makeCurves(width: number, height: number): Curve[] {
  const radius = Math.min(width, height) * 0.2
  return RATIOS.map((ratio, i) => ({
    ...ratio,
    cx: width * (0.25 + i * 0.25),
    cy: height * (0.3 + (i % 2) * 0.35),
    rx: radius,
    ry: radius,
  }))
}

function point(c: Curve, t: number) {
  return {
    x: c.cx + Math.sin(c.a * t + c.delta) * c.rx,
    y: c.cy + Math.sin(c.b * t) * c.ry,
  }
}

onMounted(() => {
  const canvas = el.value!
  let ctx = initCanvas(canvas, size.width, size.height)
  let curves = makeCurves(size.width, size.height)

  useEventListener('resize', () => {
    ctx = initCanvas(canvas, size.width, size.height)
    curves = makeCurves(size.width, size.height)
  })

  useRafFn(() => {
    const now = Date.now()
    ctx.clearRect(0, 0, size.width, size.height)

    for (const c of curves) {
      ctx.strokeStyle = '#88888822'
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let i = 0; i <= SAMPLES; i++) {
        const t = (i / SAMPLES) * Math.PI * 2
        const p = point(c, t)
        if (i === 0)
          ctx.moveTo(p.x, p.y)
        else
          ctx.lineTo(p.x, p.y)
      }
      ctx.stroke()

      const head = point(c, (now * c.freq) % (Math.PI * 2))
      ctx.fillStyle = '#888888aa'
      ctx.beginPath()
      ctx.arc(head.x, head.y, 2.2, 0, Math.PI * 2)
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
