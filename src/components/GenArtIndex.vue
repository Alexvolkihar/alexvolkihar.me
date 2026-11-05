<script setup lang="ts">
import { allSeries } from '~/logics/genart'
</script>

<template>
  <div class="max-w-300 mx-auto px-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
    <RouterLink
      v-for="s of allSeries"
      :key="s.slug"
      :to="`/genart/${s.slug}`"
      class="group block no-underline! color-base"
    >
      <GenArtCanvas :series="s.slug" :hash="s.gallery[0]" class="transition-transform duration-300 group-hover:scale-101.5" />
      <div class="mt-3">
        <div class="text-lg font-medium">
          {{ s.title }}
        </div>
        <div class="text-sm op60 mt-1">
          {{ s.summary }}
        </div>
        <div class="text-xs op40 mt-1">
          {{ Object.keys(s.traits).length }} traits · {{ s.gallery.length }} selected pieces
        </div>
      </div>
    </RouterLink>
  </div>
</template>
