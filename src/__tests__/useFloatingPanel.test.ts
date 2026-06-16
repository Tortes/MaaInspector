import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useFloatingPanel } from '@/composables/useFloatingPanel'

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value }),
    removeItem: vi.fn((key: string) => { delete store[key] }),
    clear: vi.fn(() => { store = {} })
  }
})()

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
})

const setViewport = (width: number, height: number) => {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: width
  })
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    value: height
  })
}

const createPanel = () => useFloatingPanel({
  storageKey: 'test-floating-panel',
  defaultWidth: 600,
  defaultHeight: 420,
  minWidth: 360,
  minHeight: 260,
  edgeGap: 20
})

describe('useFloatingPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorageMock.clear()
    setViewport(1200, 800)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  })

  afterEach(() => {
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  })

  it('centers a default layout when no stored layout exists', () => {
    const panel = createPanel()

    panel.loadLayout()

    expect(panel.rect.value).toEqual({
      left: 300,
      top: 190,
      width: 600,
      height: 420
    })
  })

  it('loads and clamps a stored layout to the viewport', () => {
    localStorageMock.setItem('test-floating-panel', JSON.stringify({
      left: 1000,
      top: 700,
      width: 900,
      height: 700
    }))
    const panel = createPanel()

    panel.loadLayout()

    expect(panel.rect.value).toEqual({
      left: 280,
      top: 80,
      width: 900,
      height: 700
    })
  })

  it('moves the panel by dragging the title bar', () => {
    const panel = createPanel()
    panel.loadLayout()

    panel.startMove(new MouseEvent('mousedown', { clientX: 320, clientY: 200 }))
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 360, clientY: 260 }))
    document.dispatchEvent(new MouseEvent('mouseup'))

    expect(panel.rect.value.left).toBe(340)
    expect(panel.rect.value.top).toBe(250)
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'test-floating-panel',
      JSON.stringify({ left: 340, top: 250, width: 600, height: 420 })
    )
  })

  it('resizes the panel from the bottom-right handle', () => {
    const panel = createPanel()
    panel.loadLayout()

    panel.startResize(new MouseEvent('mousedown', { clientX: 900, clientY: 610 }))
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 980, clientY: 670 }))
    document.dispatchEvent(new MouseEvent('mouseup'))

    expect(panel.rect.value.width).toBe(680)
    expect(panel.rect.value.height).toBe(480)
  })

  it('keeps the panel above minimum size while resizing', () => {
    const panel = createPanel()
    panel.loadLayout()

    panel.startResize(new MouseEvent('mousedown', { clientX: 900, clientY: 610 }))
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 100, clientY: 100 }))
    document.dispatchEvent(new MouseEvent('mouseup'))

    expect(panel.rect.value.width).toBe(360)
    expect(panel.rect.value.height).toBe(260)
  })
})
