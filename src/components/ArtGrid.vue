<script setup lang="ts">
const el = ref<HTMLCanvasElement | null>(null)
const size = reactive(useWindowSize())

const CELL = 30
const PADDING = 4
const THRESHOLD = 0.35

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

onMounted(() => {
  const canvas = el.value!
  let ctx = initCanvas(canvas, size.width, size.height)

  useEventListener('resize', () => {
    ctx = initCanvas(canvas, size.width, size.height)
  })

  useRafFn(() => {
    const t = Date.now() / 1000
    ctx.clearRect(0, 0, size.width, size.height)

    const cols = Math.ceil(size.width / CELL)
    const rows = Math.ceil(size.height / CELL)

    // Faint outline on every cell so the grid itself always reads clearly.
    ctx.strokeStyle = 'rgba(136, 136, 136, 0.12)'
    ctx.lineWidth = 1
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        ctx.strokeRect(col * CELL + PADDING, row * CELL + PADDING, CELL - PADDING * 2, CELL - PADDING * 2)
      }
    }

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const phase = (col * 0.7 + row * 1.3) % (Math.PI * 2)
        const flicker = (Math.sin(t * 1.1 + phase) + 1) / 2
        if (flicker < THRESHOLD)
          continue

        const norm = (flicker - THRESHOLD) / (1 - THRESHOLD)
        const alpha = norm ** 0.5 * 0.85
        ctx.fillStyle = `rgba(136, 136, 136, ${alpha})`
        ctx.fillRect(col * CELL + PADDING, row * CELL + PADDING, CELL - PADDING * 2, CELL - PADDING * 2)
      }
    }
  })
})
</script>

<template>
  <div class="fixed top-0 bottom-0 left-0 right-0 pointer-events-none print:hidden" style="z-index: -1">
    <canvas ref="el" :width="size.width" :height="size.height" />
  </div>
</template>
