<script setup lang="ts">
import { useRoute } from 'vue-router/auto'
import { englishOnly, showFrenchPosts, showJapanesePosts } from '../logics'

const inactiveStyle = 'opacity-20 hover:opacity-50'
const activeStyle = 'opacity-100 underline'

const route = useRoute()
</script>

<template>
  <div class="prose m-auto mb-8 select-none animate-none! op100!">
    <div flex="~ items-center gap4 wrap" mb2>
      <button flex="~ gap1" items-center op30 text-sm @click="englishOnly = !englishOnly">
        <div :i="englishOnly ? 'carbon-checkbox-checked' : 'carbon-checkbox'" />
        English Only
      </button>
      <button
        v-if="route.path === '/posts'"
        flex="~ gap1"
        items-center
        op30
        text-sm
        @click="showFrenchPosts = !showFrenchPosts"
      >
        <div :i="showFrenchPosts ? 'carbon-checkbox-checked' : 'carbon-checkbox'" />
        Français
      </button>
      <button
        v-if="route.path === '/posts'"
        flex="~ gap1"
        items-center
        op30
        text-sm
        @click="showJapanesePosts = !showJapanesePosts"
      >
        <div :i="showJapanesePosts ? 'carbon-checkbox-checked' : 'carbon-checkbox'" />
        日本語
      </button>
    </div>

    <div mb-0 flex="~ col gap-1 sm:row sm:gap-3 wrap" text-3xl>
      <RouterLink to="/posts" class="!border-none" :class="route.path === '/posts' ? activeStyle : inactiveStyle">
        Blog
      </RouterLink>
      <RouterLink to="/talks" class="!border-none" :class="route.path === '/talks' ? activeStyle : inactiveStyle">
        Talks
      </RouterLink>
      <RouterLink to="/podcasts" class="!border-none" :class="route.path === '/podcasts' ? activeStyle : inactiveStyle">
        Podcasts
      </RouterLink>
      <RouterLink to="/streams" class="!border-none" :class="route.path === '/streams' ? activeStyle : inactiveStyle">
        Streams
      </RouterLink>
      <RouterLink to="/notes" class="!border-none" :class="route.path === '/notes' ? activeStyle : inactiveStyle">
        Notes
      </RouterLink>
    </div>
  </div>
</template>
