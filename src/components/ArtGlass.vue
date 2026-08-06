<script setup lang="ts">
interface Panel {
  x: number
  y: number
  w: number
  h: number
  vx: number
  vy: number
  rotation: number
  vr: number
}

const el = ref<HTMLCanvasElement | null>(null)
const size = reactive(useWindowSize())

const COUNT = 5
const BLUR = 24

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

function makePanel(width: number, height: number): Panel {
  return {
    x: Math.random() * width,
    y: Math.random() * height,
    w: 120 + Math.random() * 160,
    h: 80 + Math.random() * 120,
    vx: (Math.random() - 0.5) * 0.15,
    vy: (Math.random() - 0.5) * 0.15,
    rotation: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.0006,
  }
}

function drawRoundedRect(ctx: CanvasRenderingContext2D, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(-w / 2 + r, -h / 2)
  ctx.arcTo(w / 2, -h / 2, w / 2, h / 2, r)
  ctx.arcTo(w / 2, h / 2, -w / 2, h / 2, r)
  ctx.arcTo(-w / 2, h / 2, -w / 2, -h / 2, r)
  ctx.arcTo(-w / 2, -h / 2, w / 2, -h / 2, r)
  ctx.closePath()
}

onMounted(() => {
  const canvas = el.value!
  let ctx = initCanvas(canvas, size.width, size.height)
  let panels = Array.from({ length: COUNT }, () => makePanel(size.width, size.height))

  useEventListener('resize', () => {
    ctx = initCanvas(canvas, size.width, size.height)
    panels = Array.from({ length: COUNT }, () => makePanel(size.width, size.height))
  })

  useRafFn(() => {
    ctx.clearRect(0, 0, size.width, size.height)

    for (const p of panels) {
      p.x += p.vx
      p.y += p.vy
      p.rotation += p.vr

      if (p.x < -p.w)
        p.x = size.width + p.w
      if (p.x > size.width + p.w)
        p.x = -p.w
      if (p.y < -p.h)
        p.y = size.height + p.h
      if (p.y > size.height + p.h)
        p.y = -p.h

      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rotation)

      ctx.filter = `blur(${BLUR}px)`
      ctx.fillStyle = 'rgba(136, 136, 136, 0.08)'
      drawRoundedRect(ctx, p.w, p.h, 28)
      ctx.fill()

      ctx.filter = 'none'
      ctx.strokeStyle = 'rgba(136, 136, 136, 0.18)'
      ctx.lineWidth = 1
      drawRoundedRect(ctx, p.w, p.h, 28)
      ctx.stroke()

      ctx.restore()
    }
  })
})
</script>

<template>
  <div class="fixed top-0 bottom-0 left-0 right-0 pointer-events-none print:hidden" style="z-index: -1">
    <canvas ref="el" :width="size.width" :height="size.height" />
  </div>
</template>
