<script setup lang="ts">
import { useRoute } from 'vue-router/auto'
import { englishOnly, showFrenchPosts, showJapanesePosts, toggleLanguagePosts } from '../logics'

const inactiveStyle = 'opacity-20 hover:opacity-50'
const activeStyle = 'opacity-100 underline'

const route = useRoute()

// Same rule as ListPosts: show the build-time state until mounted, then the visitor's, so the
// boxes update after hydration instead of keeping the static HTML's state.
const mounted = useMounted()
const englishBox = computed(() => mounted.value && englishOnly.value)
const frenchBox = computed(() => !mounted.value || (showFrenchPosts.value && !englishOnly.value))
const japaneseBox = computed(() => !mounted.value || (showJapanesePosts.value && !englishOnly.value))
</script>

<template>
  <div class="prose m-auto mb-8 select-none animate-none! op100!">
    <div flex="~ items-center gap4 wrap" mb2>
      <button flex="~ gap1" items-center op30 text-sm @click="englishOnly = !englishOnly">
        <div :i="englishBox ? 'carbon-checkbox-checked' : 'carbon-checkbox'" />
        English Only
      </button>
      <button
        v-if="route.path === '/posts'"
        flex="~ gap1"
        items-center
        op30
        text-sm
        @click="toggleLanguagePosts('fr')"
      >
        <div :i="frenchBox ? 'carbon-checkbox-checked' : 'carbon-checkbox'" />
        Français
      </button>
      <button
        v-if="route.path === '/posts'"
        flex="~ gap1"
        items-center
        op30
        text-sm
        @click="toggleLanguagePosts('ja')"
      >
        <div :i="japaneseBox ? 'carbon-checkbox-checked' : 'carbon-checkbox'" />
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
