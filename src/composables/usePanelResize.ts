import { ref } from 'vue'

export interface UsePanelResizeOptions {
  storageKey: string
  defaultWidth: number
  minWidth: number
  maxWidth?: number
  sideGap?: number
}

export interface UsePanelResizeReturn {
  panelWidth: ReturnType<typeof ref<number>>
  isResizing: ReturnType<typeof ref<boolean>>
  startResize: (e: MouseEvent) => void
  stopResize: () => void
  loadWidth: () => number
  saveWidth: (width: number) => void
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

export function usePanelResize(options: UsePanelResizeOptions): UsePanelResizeReturn {
  const {
    storageKey,
    defaultWidth,
    minWidth,
    maxWidth: maxOverride,
    sideGap = 24
  } = options

  const panelWidth = ref(defaultWidth)
  const isResizing = ref(false)
  const resizeStart = ref({ x: 0, width: defaultWidth })

  const getMaxWidth = () => {
    if (maxOverride !== undefined) return maxOverride
    if (typeof window === 'undefined') return defaultWidth
    return Math.max(minWidth, window.innerWidth - sideGap)
  }

  const clampWidth = (value: number) =>
    clamp(value, minWidth, getMaxWidth())

  const loadWidth = () => {
    if (typeof window === 'undefined') return defaultWidth
    const stored = Number(window.localStorage.getItem(storageKey))
    return Number.isFinite(stored) && stored > 0 ? clampWidth(stored) : defaultWidth
  }

  const saveWidth = (width: number) => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(storageKey, String(Math.round(clampWidth(width))))
    } catch (_) {
      // ignore storage failures
    }
  }

  const onResize = (e: MouseEvent) => {
    if (!isResizing.value) return
    panelWidth.value = clampWidth(resizeStart.value.width + resizeStart.value.x - e.clientX)
  }

  const stopResize = () => {
    if (!isResizing.value) return
    isResizing.value = false
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    document.removeEventListener('mousemove', onResize)
    document.removeEventListener('mouseup', stopResize)
    saveWidth(panelWidth.value)
  }

  const startResize = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    isResizing.value = true
    resizeStart.value = { x: e.clientX, width: panelWidth.value }
    document.body.style.cursor = 'ew-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onResize)
    document.addEventListener('mouseup', stopResize)
  }

  return {
    panelWidth,
    isResizing,
    startResize,
    stopResize,
    loadWidth,
    saveWidth
  }
}
