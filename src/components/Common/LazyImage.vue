<script setup lang="ts">
import { ref, computed } from 'vue'
import { useLazyLoad } from '../../composables/useLazyLoad'

const props = defineProps<{
  src?: string
  alt?: string
  className?: string
}>()

const containerRef = ref<HTMLElement | null>(null)
const { hasBeenVisible } = useLazyLoad(containerRef, { rootMargin: '100px' })

const shouldLoad = computed(() => props.src && hasBeenVisible.value)
</script>

<template>
  <div
    ref="containerRef"
    class="lazy-image-container"
  >
    <img
      v-if="shouldLoad"
      :src="src"
      :alt="alt"
      :class="className"
    >
    <slot
      v-else
      name="placeholder"
    >
      <div class="lazy-placeholder" />
    </slot>
  </div>
</template>

<style scoped>
.lazy-image-container {
  width: 100%;
  height: 100%;
  position: relative;
}

.lazy-placeholder {
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
</style>
