<script setup lang="ts">
import { useGenArtAuth } from '~/logics/genart/admin'

// Owner sign-in for adding pieces to the collection (deployed site only).
// Only one GitHub account is accepted by the server; this link is just a door.
const { login, signInUrl, signOut } = useGenArtAuth()
</script>

<template>
  <p class="prose m-auto mt-12 text-sm op50">
    Artworks © Alexvolkihar, licensed
    <a href="https://creativecommons.org/licenses/by-nc-nd/4.0/" target="_blank" rel="noopener">CC BY-NC-ND 4.0</a>.
    Code under the repository licence (MIT).
    <ClientOnly>
      <span v-if="login" class="text-xs whitespace-nowrap">
        · Signed in as {{ login }} ·
        <button class="op80 hover:op100 underline-dotted underline" @click="signOut()">Sign out</button>
      </span>
      <a
        v-else
        :href="signInUrl()"
        class="inline-flex items-center align-middle ml-1 op30! hover:op80! border-none!"
        title="Owner sign-in"
        aria-label="Owner sign-in"
        rel="nofollow"
      ><span i-ri-lock-line text-xs /></a>
    </ClientOnly>
  </p>
</template>
