import { computed, ref } from 'vue'

export interface FloatingPanelRect {
  left: number
  top: number
  width: number
  height: number
}

export interface UseFloatingPanelOptions {
  storageKey: string
  defaultWidth: number
  defaultHeight: number
  minWidth: number
  minHeight: number
  edgeGap?: number
}

type InteractionMode = 'move' | 'resize'

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

export function useFloatingPanel(options: UseFloatingPanelOptions) {
  const {
    storageKey,
    defaultWidth,
    defaultHeight,
    minWidth,
    minHeight,
    edgeGap = 24
  } = options

  const rect = ref<FloatingPanelRect>({
    left: edgeGap,
    top: edgeGap,
    width: defaultWidth,
    height: defaultHeight
  })
  const isInteracting = ref(false)
  const interactionMode = ref<InteractionMode | null>(null)
  const interactionStart = ref({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    width: defaultWidth,
    height: defaultHeight
  })

  const getViewport = () => {
    if (typeof window === 'undefined') {
      return {
        width: defaultWidth + edgeGap * 2,
        height: defaultHeight + edgeGap * 2
      }
    }

    return {
      width: window.innerWidth,
      height: window.innerHeight
    }
  }

  const getSizeBounds = () => {
    const viewport = getViewport()
    const maxWidth = Math.max(320, viewport.width - edgeGap * 2)
    const maxHeight = Math.max(260, viewport.height - edgeGap * 2)

    return {
      minWidth: Math.min(minWidth, maxWidth),
      minHeight: Math.min(minHeight, maxHeight),
      maxWidth,
      maxHeight
    }
  }

  const clampRect = (next: FloatingPanelRect): FloatingPanelRect => {
    const viewport = getViewport()
    const bounds = getSizeBounds()
    const width = clamp(next.width, bounds.minWidth, bounds.maxWidth)
    const height = clamp(next.height, bounds.minHeight, bounds.maxHeight)
    const maxLeft = Math.max(edgeGap, viewport.width - edgeGap - width)
    const maxTop = Math.max(edgeGap, viewport.height - edgeGap - height)

    return {
      left: clamp(next.left, edgeGap, maxLeft),
      top: clamp(next.top, edgeGap, maxTop),
      width,
      height
    }
  }

  const createDefaultRect = () => {
    const viewport = getViewport()
    const bounds = getSizeBounds()
    const width = clamp(defaultWidth, bounds.minWidth, bounds.maxWidth)
    const height = clamp(defaultHeight, bounds.minHeight, bounds.maxHeight)

    return clampRect({
      left: Math.round((viewport.width - width) / 2),
      top: Math.max(edgeGap, Math.round((viewport.height - height) / 2)),
      width,
      height
    })
  }

  const parseStoredRect = (raw: string | null): FloatingPanelRect | null => {
    if (!raw) return null

    try {
      const parsed = JSON.parse(raw) as Partial<FloatingPanelRect>
      const values = [parsed.left, parsed.top, parsed.width, parsed.height]
      if (values.every(value => typeof value === 'number' && Number.isFinite(value))) {
        return parsed as FloatingPanelRect
      }
    } catch (_) {
      // ignore corrupted layout data
    }

    return null
  }

  const loadLayout = () => {
    if (typeof window === 'undefined') {
      rect.value = createDefaultRect()
      return rect.value
    }

    const stored = parseStoredRect(window.localStorage.getItem(storageKey))
    rect.value = stored ? clampRect(stored) : createDefaultRect()
    return rect.value
  }

  const saveLayout = () => {
    if (typeof window === 'undefined') return

    try {
      window.localStorage.setItem(storageKey, JSON.stringify({
        left: Math.round(rect.value.left),
        top: Math.round(rect.value.top),
        width: Math.round(rect.value.width),
        height: Math.round(rect.value.height)
      }))
    } catch (_) {
      // ignore storage failures
    }
  }

  const ensureInViewport = () => {
    rect.value = clampRect(rect.value)
  }

  const stopInteraction = () => {
    if (!isInteracting.value) return

    isInteracting.value = false
    interactionMode.value = null
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', stopInteraction)
    saveLayout()
  }

  const beginInteraction = (e: MouseEvent, mode: InteractionMode, cursor: string) => {
    e.preventDefault()
    e.stopPropagation()
    isInteracting.value = true
    interactionMode.value = mode
    interactionStart.value = {
      x: e.clientX,
      y: e.clientY,
      left: rect.value.left,
      top: rect.value.top,
      width: rect.value.width,
      height: rect.value.height
    }
    document.body.style.cursor = cursor
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', stopInteraction)
  }

  function handleMouseMove(e: MouseEvent) {
    if (!isInteracting.value || !interactionMode.value) return

    const dx = e.clientX - interactionStart.value.x
    const dy = e.clientY - interactionStart.value.y

    if (interactionMode.value === 'move') {
      rect.value = clampRect({
        ...rect.value,
        left: interactionStart.value.left + dx,
        top: interactionStart.value.top + dy
      })
      return
    }

    rect.value = clampRect({
      ...rect.value,
      width: interactionStart.value.width + dx,
      height: interactionStart.value.height + dy
    })
  }

  const startMove = (e: MouseEvent) => {
    beginInteraction(e, 'move', 'move')
  }

  const startResize = (e: MouseEvent) => {
    beginInteraction(e, 'resize', 'nwse-resize')
  }

  const panelStyle = computed(() => ({
    left: `${rect.value.left}px`,
    top: `${rect.value.top}px`,
    width: `${rect.value.width}px`,
    height: `${rect.value.height}px`
  }))

  rect.value = createDefaultRect()

  return {
    rect,
    panelStyle,
    isInteracting,
    interactionMode,
    loadLayout,
    saveLayout,
    ensureInViewport,
    startMove,
    startResize,
    stopInteraction
  }
}
