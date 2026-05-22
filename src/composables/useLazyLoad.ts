import { ref, onMounted, onUnmounted, type Ref } from 'vue'

interface LazyLoadOptions {
  threshold?: number
  rootMargin?: string
}

export function useLazyLoad(
  elementRef: Ref<HTMLElement | null>,
  options: LazyLoadOptions = {}
) {
  const isVisible = ref(false)
  const hasBeenVisible = ref(false)
  let observer: IntersectionObserver | null = null

  const { threshold = 0.1, rootMargin = '50px' } = options

  onMounted(() => {
    if (!elementRef.value) return

    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          isVisible.value = entry.isIntersecting
          if (entry.isIntersecting) {
            hasBeenVisible.value = true
          }
        })
      },
      { threshold, rootMargin }
    )

    observer.observe(elementRef.value)
  })

  onUnmounted(() => {
    if (observer) {
      observer.disconnect()
      observer = null
    }
  })

  return { isVisible, hasBeenVisible }
}
