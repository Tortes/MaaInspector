import { ref, onScopeDispose } from 'vue'

export interface UseSseStreamOptions<T> {
  subscribe: (callback: (data: T) => void) => Promise<() => void> | (() => void)
  throttleMs?: number
  maxEvents?: number
  onEvent?: (event: T) => void
  onError?: (error: Error) => void
}

export function useSseStream<T>(options: UseSseStreamOptions<T>) {
  const {
    subscribe,
    throttleMs = 0,
    maxEvents = 200,
    onEvent,
    onError
  } = options

  const isRunning = ref(false)
  const eventBuffer = ref<T[]>([])
  let unsubscribe: (() => void) | null = null
  let throttleTimer: ReturnType<typeof setTimeout> | null = null
  let pendingEvents: T[] = []

  const flushBuffer = () => {
    if (pendingEvents.length === 0) return
    const events = pendingEvents
    pendingEvents = []
    eventBuffer.value = ([...events, ...eventBuffer.value] as T[]).slice(0, maxEvents)
    events.forEach(evt => onEvent?.(evt))
  }

  const handleIncoming = (data: T) => {
    try {
      if (throttleMs > 0) {
        pendingEvents.push(data)
        if (!throttleTimer) {
          throttleTimer = setTimeout(() => {
            throttleTimer = null
            flushBuffer()
          }, throttleMs)
        }
      } else {
        eventBuffer.value = ([data, ...eventBuffer.value] as T[]).slice(0, maxEvents)
        onEvent?.(data)
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      onError?.(error)
      console.error('[useSseStream] 事件处理失败', error)
    }
  }

  const start = async () => {
    if (isRunning.value) return
    try {
      const result = subscribe(handleIncoming)
      unsubscribe = result instanceof Promise ? await result : result
      isRunning.value = true
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      onError?.(error)
      console.error('[useSseStream] 订阅失败', error)
    }
  }

  const stop = () => {
    if (throttleTimer) {
      clearTimeout(throttleTimer)
      throttleTimer = null
      flushBuffer()
    }
    if (unsubscribe) {
      unsubscribe()
      unsubscribe = null
    }
    pendingEvents = []
    isRunning.value = false
  }

  const clear = () => {
    eventBuffer.value = []
    pendingEvents = []
    if (throttleTimer) {
      clearTimeout(throttleTimer)
      throttleTimer = null
    }
  }

  onScopeDispose(() => {
    stop()
  })

  return {
    isRunning,
    eventBuffer,
    start,
    stop,
    clear
  }
}
