<script setup lang="ts">
const el = ref<HTMLCanvasElement | null>(null)
const size = reactive(useWindowSize())

const SPACING = 34
const SPEED = 0.0016
const WAVELENGTH = 220

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
    const t = Date.now() * SPEED
    ctx.clearRect(0, 0, size.width, size.height)
    ctx.fillStyle = '#88888844'

    for (let x = 0; x < size.width + SPACING; x += SPACING) {
      for (let y = 0; y < size.height + SPACING; y += SPACING) {
        const dist = Math.hypot(x - size.width / 2, y - size.height / 2)
        const phase = dist / WAVELENGTH - t
        const wave = (Math.sin(phase * Math.PI * 2) + 1) / 2
        const r = 0.5 + wave * 2
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fill()
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
