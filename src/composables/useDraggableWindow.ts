import { ref, onUnmounted } from 'vue'

export interface UseDraggableWindowOptions {
  initialPosition?: { x: number; y: number }
  bounds?: { minX: number; minY: number; maxX: number; maxY: number }
  persistKey?: string
}

interface Position {
  x: number
  y: number
}

const loadPosition = (key: string, fallback: Position): Position => {
  if (typeof window === 'undefined') return fallback
  try {
    const stored = window.localStorage.getItem(key)
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<Position>
      if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
        return { x: parsed.x, y: parsed.y }
      }
    }
  } catch {
    // ignore
  }
  return fallback
}

const savePosition = (key: string, position: Position) => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(position))
  } catch {
    // ignore
  }
}

const clampPosition = (pos: Position, bounds: { minX: number; minY: number; maxX: number; maxY: number }): Position => {
  return {
    x: Math.max(bounds.minX, Math.min(bounds.maxX, pos.x)),
    y: Math.max(bounds.minY, Math.min(bounds.maxY, pos.y)),
  }
}

export function useDraggableWindow(options: UseDraggableWindowOptions = {}) {
  const defaultPosition = options.initialPosition ?? { x: 100, y: 100 }
  const position = ref<Position>(
    options.persistKey
      ? loadPosition(options.persistKey, defaultPosition)
      : { ...defaultPosition }
  )

  const isDragging = ref(false)
  const dragOffset = ref<Position>({ x: 0, y: 0 })

  const getDefaultBounds = () => ({
    minX: 0,
    minY: 0,
    maxX: typeof window !== 'undefined' ? window.innerWidth : 1920,
    maxY: typeof window !== 'undefined' ? window.innerHeight : 1080,
  })

  const startDrag = (e: MouseEvent) => {
    const target = e.target as HTMLElement | null
    if (target && (target.closest('input') || target.closest('button') || target.closest('textarea') || target.closest('select'))) {
      return
    }
    isDragging.value = true
    dragOffset.value = {
      x: e.clientX - position.value.x,
      y: e.clientY - position.value.y,
    }
    document.addEventListener('mousemove', onDrag)
    document.addEventListener('mouseup', stopDrag)
  }

  const onDrag = (e: MouseEvent) => {
    if (!isDragging.value) return
    const bounds = options.bounds ?? getDefaultBounds()
    const newPos = {
      x: e.clientX - dragOffset.value.x,
      y: e.clientY - dragOffset.value.y,
    }
    position.value = clampPosition(newPos, bounds)
  }

  const stopDrag = () => {
    if (!isDragging.value) return
    isDragging.value = false
    document.removeEventListener('mousemove', onDrag)
    document.removeEventListener('mouseup', stopDrag)
    if (options.persistKey) {
      savePosition(options.persistKey, position.value)
    }
  }

  const setPosition = (newPos: Position) => {
    const bounds = options.bounds ?? getDefaultBounds()
    position.value = clampPosition(newPos, bounds)
    if (options.persistKey) {
      savePosition(options.persistKey, position.value)
    }
  }

  const resetPosition = () => {
    position.value = { ...defaultPosition }
    if (options.persistKey) {
      savePosition(options.persistKey, position.value)
    }
  }

  onUnmounted(() => {
    document.removeEventListener('mousemove', onDrag)
    document.removeEventListener('mouseup', stopDrag)
  })

  return {
    position,
    isDragging,
    startDrag,
    stopDrag,
    setPosition,
    resetPosition,
  }
}
