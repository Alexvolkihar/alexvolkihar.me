<script setup lang="ts">
interface Drop {
  x: number
  y: number
  len: number
  speed: number
  drift: number
}

const el = ref<HTMLCanvasElement | null>(null)
const size = reactive(useWindowSize())

const COUNT = 90

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

function makeDrop(width: number, height: number): Drop {
  return {
    x: Math.random() * width,
    y: Math.random() * height,
    len: 8 + Math.random() * 16,
    speed: 1.5 + Math.random() * 2.5,
    drift: 0.2 + Math.random() * 0.3,
  }
}

onMounted(() => {
  const canvas = el.value!
  let ctx = initCanvas(canvas, size.width, size.height)
  let drops = Array.from({ length: COUNT }, () => makeDrop(size.width, size.height))

  useEventListener('resize', () => {
    ctx = initCanvas(canvas, size.width, size.height)
    drops = Array.from({ length: COUNT }, () => makeDrop(size.width, size.height))
  })

  useRafFn(() => {
    ctx.clearRect(0, 0, size.width, size.height)
    ctx.strokeStyle = '#88888844'
    ctx.lineWidth = 1

    for (const d of drops) {
      d.y += d.speed
      d.x += d.drift
      if (d.y - d.len > size.height) {
        d.y = -d.len
        d.x = Math.random() * size.width
      }
      if (d.x > size.width)
        d.x = 0

      ctx.beginPath()
      ctx.moveTo(d.x, d.y - d.len)
      ctx.lineTo(d.x, d.y)
      ctx.stroke()
    }
  })
})
</script>

<template>
  <div class="fixed top-0 bottom-0 left-0 right-0 pointer-events-none print:hidden" style="z-index: -1">
    <canvas ref="el" :width="size.width" :height="size.height" />
  </div>
</template>
