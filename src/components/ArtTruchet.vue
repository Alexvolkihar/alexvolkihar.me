<script setup lang="ts">
const el = ref<HTMLCanvasElement | null>(null)
const size = reactive(useWindowSize())

const CELL = 44

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

function draw(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.clearRect(0, 0, width, height)
  ctx.strokeStyle = '#88888833'
  ctx.lineWidth = 1.5

  const cols = Math.ceil(width / CELL) + 1
  const rows = Math.ceil(height / CELL) + 1
  const r = CELL / 2

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = col * CELL
      const y = row * CELL
      const flipped = Math.random() < 0.5

      ctx.beginPath()
      if (!flipped) {
        ctx.arc(x, y, r, 0, Math.PI / 2)
        ctx.moveTo(x + CELL, y + CELL)
        ctx.arc(x + CELL, y + CELL, r, Math.PI, Math.PI * 1.5)
      }
      else {
        ctx.arc(x + CELL, y, r, Math.PI / 2, Math.PI)
        ctx.moveTo(x, y + CELL)
        ctx.arc(x, y + CELL, r, Math.PI * 1.5, Math.PI * 2)
      }
      ctx.stroke()
    }
  }
}

onMounted(() => {
  const canvas = el.value!
  let ctx = initCanvas(canvas, size.width, size.height)
  draw(ctx, size.width, size.height)

  useEventListener('resize', () => {
    ctx = initCanvas(canvas, size.width, size.height)
    draw(ctx, size.width, size.height)
  })
})
</script>

<template>
  <div class="fixed top-0 bottom-0 left-0 right-0 pointer-events-none print:hidden" style="z-index: -1">
    <canvas ref="el" :width="size.width" :height="size.height" />
  </div>
</template>
