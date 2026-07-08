<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { isDark } from '~/logics'

const props = defineProps<{
  code: string
}>()

const root = ref<HTMLElement | null>(null)
let stopped: (() => void) | undefined
let renderId = 0

async function renderDiagram() {
  if (!root.value)
    return

  const { default: mermaid } = await import('mermaid')
  mermaid.initialize({
    startOnLoad: false,
    theme: isDark.value ? 'dark' : 'default',
  })

  const id = `mmd-${++renderId}`
  const { svg } = await mermaid.render(id, props.code)
  root.value.innerHTML = svg
}

onMounted(() => {
  renderDiagram()
  stopped = watch(
    () => isDark.value,
    () => renderDiagram(),
  )
})

onBeforeUnmount(() => {
  stopped?.()
})
</script>

<template>
  <div ref="root" class="mermaid-diagram" />
</template>

<style scoped>
.mermaid-diagram :deep(svg) {
  max-width: 100%;
  height: auto;
}
</style>

