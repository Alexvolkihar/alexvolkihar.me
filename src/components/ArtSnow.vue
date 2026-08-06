<script setup lang="ts">
interface Flake {
  x: number
  y: number
  radius: number
  speed: number
  swayAmp: number
  phase: number
}

const el = ref<HTMLCanvasElement | null>(null)
const size = reactive(useWindowSize())

const COUNT = 70

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

function makeFlake(width: number, height: number, y?: number): Flake {
  return {
    x: Math.random() * width,
    y: y ?? Math.random() * height,
    radius: 1 + Math.random() * 2.2,
    speed: 0.25 + Math.random() * 0.5,
    swayAmp: 0.3 + Math.random() * 0.6,
    phase: Math.random() * Math.PI * 2,
  }
}

onMounted(() => {
  const canvas = el.value!
  let ctx = initCanvas(canvas, size.width, size.height)
  let flakes = Array.from({ length: COUNT }, () => makeFlake(size.width, size.height))

  useEventListener('resize', () => {
    ctx = initCanvas(canvas, size.width, size.height)
    flakes = Array.from({ length: COUNT }, () => makeFlake(size.width, size.height))
  })

  useRafFn(() => {
    ctx.clearRect(0, 0, size.width, size.height)
    ctx.fillStyle = 'rgba(136, 136, 136, 0.35)'

    for (const f of flakes) {
      f.y += f.speed
      f.phase += 0.02
      f.x += Math.sin(f.phase) * f.swayAmp

      if (f.y - f.radius > size.height)
        Object.assign(f, makeFlake(size.width, size.height, -f.radius))

      ctx.beginPath()
      ctx.arc(f.x, f.y, f.radius, 0, Math.PI * 2)
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
