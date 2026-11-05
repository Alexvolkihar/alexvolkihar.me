<script setup lang="ts">
import { getSeries } from '~/logics/genart'

// The rarity table of a series, rendered from its definition so the page and
// the code can never disagree.

const props = defineProps<{ series: string }>()

const rows = computed(() => Object.entries(getSeries(props.series).traits))
</script>

<template>
  <table>
    <thead>
      <tr>
        <th>Trait</th>
        <th>Values (weight)</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="[name, values] of rows" :key="name">
        <td>{{ name }}</td>
        <td>{{ values.map(([v, w]) => `${v} ${w}`).join(' · ') }}</td>
      </tr>
    </tbody>
  </table>
</template>
