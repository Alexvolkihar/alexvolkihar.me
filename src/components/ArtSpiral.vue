<script setup lang="ts">
interface Point {
  arm: number
  offset: number
  radius: number
}

const el = ref<HTMLCanvasElement | null>(null)
const size = reactive(useWindowSize())

const ARMS = 4
const POINTS_PER_ARM = 45
const MAX_RADIUS_RATIO = 0.42
const ROTATION_SPEED = 0.00012
const TWIST = 3.2

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

function makePoints() {
  const points: Point[] = []
  for (let arm = 0; arm < ARMS; arm++) {
    for (let i = 0; i < POINTS_PER_ARM; i++) {
      points.push({
        arm,
        offset: i / POINTS_PER_ARM,
        radius: i / POINTS_PER_ARM,
      })
    }
  }
  return points
}

onMounted(() => {
  const canvas = el.value!
  let ctx = initCanvas(canvas, size.width, size.height)
  const points = makePoints()

  useEventListener('resize', () => {
    ctx = initCanvas(canvas, size.width, size.height)
  })

  useRafFn(() => {
    const t = Date.now() * ROTATION_SPEED
    const cx = size.width / 2
    const cy = size.height / 2
    const maxRadius = Math.min(size.width, size.height) * MAX_RADIUS_RATIO

    ctx.clearRect(0, 0, size.width, size.height)
    ctx.fillStyle = '#88888855'

    for (const p of points) {
      const armAngle = (p.arm / ARMS) * Math.PI * 2
      const angle = armAngle + p.offset * TWIST + t
      const r = p.radius * maxRadius
      const x = cx + Math.cos(angle) * r
      const y = cy + Math.sin(angle) * r
      const dotSize = 0.6 + (1 - p.radius) * 1.4

      ctx.beginPath()
      ctx.arc(x, y, dotSize, 0, Math.PI * 2)
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
