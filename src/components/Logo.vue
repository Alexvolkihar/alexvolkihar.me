<template>
  <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <title>Alexis Mabanza @ alexvolkihar.ovh</title>
    <path
      class="path1"
      d="M20 58C17 48 24 32 33 27C42 32 49 48 46 58C44 50 42 44 40 44C36 44 30 44 26 46C32 50 38 51 44 50C46.5 42 48.5 35 51.5 35C53.5 35 53 52 54 58C55 51 57 35 60 35C62.5 35 62 52 63 58C64 51 66 35 69 35C71.5 35 71 52 72 58C72.5 61 74 61 77 52"
      stroke="black" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
    />
  </svg>
</template>

<style scoped>
@media (prefers-reduced-motion) {
  .path1 {
    animation: none !important;
    stroke-dasharray: unset !important;
  }
}
@media print {
  .path1 {
    animation: none !important;
    stroke-dasharray: unset !important;
  }
}
@keyframes grow {
  0% {
    stroke-dashoffset: 1px;
    stroke-dasharray: 0 350px;
    opacity: 0;
  }
  10% {
    opacity: 1;
  }
  40% {
    stroke-dasharray: 350px 0;
  }
  85% {
    stroke-dasharray: 350px 0;
  }
  95%,
  to {
    stroke-dasharray: 0 350px;
  }
}
.path1 {
  stroke-dashoffset: 1px;
  stroke-dasharray: 350px 0;
  animation: grow 10s ease forwards infinite;
  transform-origin: center;
  stroke: #303030;
  animation-delay: 0s;
}
.dark .path1 {
  stroke: #fdfdfd;
}
</style>
