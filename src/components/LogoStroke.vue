<template>
  <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <title>Alexis Mabanza @ alexvolkihar.ovh</title>
    <path
      d="M46.1438 41.1245C47.1438 32.6245 40.841 29.2545 33.341 38.0027C21.341 52 37.341 63 43.8251 46.6245C45.781 43.1245 46.1438 38.0027 46.1438 38.0027C45.5227 43.2757 44.3251 45.6045 44.3251 49.6245C46.5 42 48.5 35 51.5 35C53.5 35 53 52 54 58C55 51 57 35 60 35C62.5 35 62 52 63 58C64 51 66 35 69 35C71.5 35 71 52 72 58C72.5 61 74 61 77 52"
      stroke="black"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
</template>

<style scoped>
@media (prefers-reduced-motion) {
  path {
    animation: none !important;
    stroke-dasharray: unset !important;
  }
}
@media print {
  path {
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
    transform: translate(0, 1%);
  }
  20% {
    transform: translate(0, 0);
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
path {
  stroke-dashoffset: 1px;
  stroke-dasharray: 350px 0;
  animation: grow 10s ease forwards infinite;
  transform-origin: center;
  stroke: #303030;
  animation-delay: 0s;
}
.dark path {
  stroke: #fdfdfd;
}
</style>
