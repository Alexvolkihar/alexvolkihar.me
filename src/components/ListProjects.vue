<script setup lang="ts">
import { RouterLink } from 'vue-router'

defineProps<{ projects: Record<string, any[]> }>()

function slug(name: string) {
  return name.toLowerCase().replace(/[\s\\/]+/g, '-')
}

function hasLink(item: { link?: string }) {
  return !!item.link && item.link !== '#'
}

// A link to a page of this site goes through the router (same tab).
function isInternal(item: { link?: string }) {
  return hasLink(item) && item.link!.startsWith('/') && !item.link!.startsWith('//')
}

function cardTag(item: { link?: string }) {
  if (isInternal(item))
    return RouterLink
  return hasLink(item) ? 'a' : 'div'
}

// Only the attributes that apply: an explicit `href: undefined` would
// override the href RouterLink computes from `to`.
function linkAttrs(item: { link?: string }) {
  if (isInternal(item))
    return { to: item.link }
  if (hasLink(item))
    return { href: item.link, target: '_blank' }
  return {}
}
</script>

<template>
  <div class="max-w-300 mx-auto">
    <p text-center mt--6 mb5 op50 text-lg italic>
      Projects that I created or maintaining.
    </p>
    <p flex="~ gap-4 justify-center wrap" text-xs op50 mb-2>
      <span inline-flex items-center gap-1><span i-ri-git-repository-line />Public: open source on GitHub</span>
      <span inline-flex items-center gap-1><span i-ri-lock-line />Private: source not published</span>
    </p>
    <div class="prose pb5 mx-auto mt10 text-center">
      <div flex="~ gap-2 justify-center">
        <a
          href="https://github.com/alexvolkihar"
          target="_blank"
          class="group btn-blue inline-block"
        >
          <div
            i-ph-github-logo-duotone
            group-hover="i-ph-github-logo-fill text-blue"
          />
          GitHub
        </a>
        <!-- <a
          href="https://releases.antfu.me"
          target="_blank"
          class="group btn-amber inline-block"
        >
          <div
            i-ph-rocket-launch-duotone
            group-hover="i-ph-rocket-launch-fill text-amber"
          />
          Recent Releases
        </a>
        <a
          href="https://yak.antfu.me"
          target="_blank"
          class="group btn-lime inline-block"
        >
          <div
            i-ph-cow-duotone
            group-hover="i-ph-cow-duotone-fill text-lime"
          />
          Yak Map
        </a> -->
      </div>
      <hr>
    </div>
    <div
      v-for="key, cidx in Object.keys(projects)" :key="key" slide-enter
      :style="{ '--enter-stage': cidx + 1 }"
    >
      <div
        :id="slug(key)"
        select-none relative h18 mt5 pointer-events-none slide-enter
        :style="{
          '--enter-stage': cidx - 2,
          '--enter-step': '60ms',
        }"
      >
        <span text-5em color-transparent absolute left--1rem top-0rem font-bold leading-1em text-stroke-1.5 text-stroke-hex-aaa op35 dark:op20>{{ key }}</span>
      </div>
      <div
        class="project-grid py-2 max-w-500 w-max mx-auto"
        grid="~ cols-1 md:cols-2 gap-4 lg:cols-3"
      >
        <div v-for="item, idx in projects[key]" :key="idx" class="relative">
          <component
            :is="cardTag(item)"
            class="item relative flex items-center h-full"
            :class="[hasLink(item) ? 'is-link' : 'cursor-default', { 'pr-10!': item.repo }]"
            v-bind="linkAttrs(item)"
            :title="item.name"
          >
            <div v-if="item.icon" class="pt-2 pr-5">
              <Slidev v-if="item.icon === 'slidev'" class="text-4xl opacity-50" />
              <VueUse v-else-if="item.icon === 'vueuse'" class="text-4xl opacity-50" />
              <VueReactivity v-else-if="item.icon === 'vue-reactivity'" class="text-4xl opacity-50" />
              <VueDemi v-else-if="item.icon === 'vue-demi'" class="text-4xl opacity-50" />
              <Unocss v-else-if="item.icon === 'unocss'" class="text-4xl opacity-50" />
              <Vitest v-else-if="item.icon === 'vitest'" class="text-4xl opacity-50" />
              <Elk v-else-if="item.icon === 'elk'" class="text-4xl opacity-50" />
              <AnthonyFu v-else-if="item.icon === 'af'" class="text-4xl opacity-50" />
              <div v-else class="text-3xl opacity-50" :class="item.icon || 'i-carbon-unknown'" />
            </div>
            <div class="flex-auto">
              <div class="text-normal flex items-center gap-2">
                {{ item.name }}
                <span
                  v-if="item.visibility"
                  class="inline-flex items-center gap-0.5 text-xs op60 font-normal"
                  :title="item.visibility === 'private' ? 'Private repository' : 'Public repository'"
                >
                  <span :class="item.visibility === 'private' ? 'i-ri-lock-line' : 'i-ri-git-repository-line'" />
                  {{ item.visibility === 'private' ? 'Private' : 'Public' }}
                </span>
              </div>
              <div class="desc text-sm opacity-50 font-normal" v-html="item.desc" />
            </div>
          </component>
          <a
            v-if="item.repo"
            :href="item.repo"
            target="_blank"
            rel="noopener"
            class="absolute top-2 right-2 p-1 rounded op40 hover:op100 hover:bg-gray/10 border-none! color-base"
            :title="`${item.name} on GitHub`"
            :aria-label="`${item.name} source code on GitHub`"
          >
            <div i-ri-github-line text-base />
          </a>
        </div>
      </div>
    </div>
    <div class="prose pb5 mx-auto mt10 text-center">
      <div block mt-5>
        <a href="/stars-rank" target="_blank" op50>All projects sort by Stars</a>
      </div>
      <!-- <hr>
      <SponsorButtons /> -->
    </div>
  </div>
  <div>
    <div class="table-of-contents">
      <div class="table-of-contents-anchor">
        <div class="i-ri-menu-2-fill" />
      </div>
      <ul>
        <li v-for="key of Object.keys(projects)" :key="key">
          <a :href="`#${slug(key)}`">{{ key }}</a>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.project-grid .item {
  background: transparent;
  font-size: 1.1rem;
  width: 350px;
  max-width: 100%;
  padding: 0.5rem 0.875rem 0.875rem;
  border-radius: 6px;
}

/* Same resting look as the global `a.item` rule, without the hover lift. */
.project-grid div.item {
  opacity: 0.6;
}

.project-grid .item.is-link:hover {
  background: #88888811;
}
</style>
