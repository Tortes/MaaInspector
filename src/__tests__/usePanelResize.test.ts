import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

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

import { usePanelResize } from '@/composables/usePanelResize'

describe('usePanelResize', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorageMock.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  })

  describe('loadWidth', () => {
    it('should return default width when no stored value', () => {
      const { loadWidth } = usePanelResize({
        storageKey: 'test-panel-width',
        defaultWidth: 300,
        minWidth: 200,
        maxWidth: 600
      })
      expect(loadWidth()).toBe(300)
    })

    it('should return stored width when valid', () => {
      localStorageMock.setItem('test-panel-width', '450')
      const { loadWidth } = usePanelResize({
        storageKey: 'test-panel-width',
        defaultWidth: 300,
        minWidth: 200,
        maxWidth: 600
      })
      expect(loadWidth()).toBe(450)
    })

    it('should clamp stored width to min', () => {
      localStorageMock.setItem('test-panel-width', '100')
      const { loadWidth } = usePanelResize({
        storageKey: 'test-panel-width',
        defaultWidth: 300,
        minWidth: 200,
        maxWidth: 600
      })
      expect(loadWidth()).toBe(200)
    })

    it('should clamp stored width to max', () => {
      localStorageMock.setItem('test-panel-width', '800')
      const { loadWidth } = usePanelResize({
        storageKey: 'test-panel-width',
        defaultWidth: 300,
        minWidth: 200,
        maxWidth: 600
      })
      expect(loadWidth()).toBe(600)
    })

    it('should return default when stored value is invalid', () => {
      localStorageMock.setItem('test-panel-width', 'invalid')
      const { loadWidth } = usePanelResize({
        storageKey: 'test-panel-width',
        defaultWidth: 300,
        minWidth: 200,
        maxWidth: 600
      })
      expect(loadWidth()).toBe(300)
    })

    it('should return default when stored value is negative', () => {
      localStorageMock.setItem('test-panel-width', '-50')
      const { loadWidth } = usePanelResize({
        storageKey: 'test-panel-width',
        defaultWidth: 300,
        minWidth: 200,
        maxWidth: 600
      })
      expect(loadWidth()).toBe(300)
    })
  })

  describe('saveWidth', () => {
    it('should save width to localStorage', () => {
      const { saveWidth } = usePanelResize({
        storageKey: 'test-panel-width',
        defaultWidth: 300,
        minWidth: 200,
        maxWidth: 600
      })
      saveWidth(400)
      expect(localStorageMock.setItem).toHaveBeenCalledWith('test-panel-width', '400')
    })

    it('should clamp width before saving', () => {
      const { saveWidth } = usePanelResize({
        storageKey: 'test-panel-width',
        defaultWidth: 300,
        minWidth: 200,
        maxWidth: 600
      })
      saveWidth(100)
      expect(localStorageMock.setItem).toHaveBeenCalledWith('test-panel-width', '200')
    })

    it('should round width before saving', () => {
      const { saveWidth } = usePanelResize({
        storageKey: 'test-panel-width',
        defaultWidth: 300,
        minWidth: 200,
        maxWidth: 600
      })
      saveWidth(350.7)
      expect(localStorageMock.setItem).toHaveBeenCalledWith('test-panel-width', '351')
    })

    it('should not throw on storage failure', () => {
      localStorageMock.setItem.mockImplementation(() => {
        throw new Error('Storage full')
      })
      const { saveWidth } = usePanelResize({
        storageKey: 'test-panel-width',
        defaultWidth: 300,
        minWidth: 200,
        maxWidth: 600
      })
      expect(() => saveWidth(400)).not.toThrow()
    })
  })

  describe('startResize / stopResize', () => {
    it('should set isResizing to true on start', () => {
      const { startResize, isResizing } = usePanelResize({
        storageKey: 'test-panel-width',
        defaultWidth: 300,
        minWidth: 200,
        maxWidth: 600
      })
      const mockEvent = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        clientX: 500
      } as unknown as MouseEvent
      startResize(mockEvent)
      expect(isResizing.value).toBe(true)
    })

    it('should set cursor and userSelect on start', () => {
      const { startResize } = usePanelResize({
        storageKey: 'test-panel-width',
        defaultWidth: 300,
        minWidth: 200,
        maxWidth: 600
      })
      const mockEvent = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        clientX: 500
      } as unknown as MouseEvent
      startResize(mockEvent)
      expect(document.body.style.cursor).toBe('ew-resize')
      expect(document.body.style.userSelect).toBe('none')
    })

    it('should add event listeners on start', () => {
      const addEventListenerSpy = vi.spyOn(document, 'addEventListener')
      const { startResize } = usePanelResize({
        storageKey: 'test-panel-width',
        defaultWidth: 300,
        minWidth: 200,
        maxWidth: 600
      })
      const mockEvent = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        clientX: 500
      } as unknown as MouseEvent
      startResize(mockEvent)
      expect(addEventListenerSpy).toHaveBeenCalledWith('mousemove', expect.any(Function))
      expect(addEventListenerSpy).toHaveBeenCalledWith('mouseup', expect.any(Function))
    })

    it('should set isResizing to false on stop', () => {
      const { startResize, stopResize, isResizing } = usePanelResize({
        storageKey: 'test-panel-width',
        defaultWidth: 300,
        minWidth: 200,
        maxWidth: 600
      })
      const mockEvent = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        clientX: 500
      } as unknown as MouseEvent
      startResize(mockEvent)
      stopResize()
      expect(isResizing.value).toBe(false)
    })

    it('should reset cursor and userSelect on stop', () => {
      const { startResize, stopResize } = usePanelResize({
        storageKey: 'test-panel-width',
        defaultWidth: 300,
        minWidth: 200,
        maxWidth: 600
      })
      const mockEvent = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        clientX: 500
      } as unknown as MouseEvent
      startResize(mockEvent)
      stopResize()
      expect(document.body.style.cursor).toBe('')
      expect(document.body.style.userSelect).toBe('')
    })

    it('should save width on stop', () => {
      const { startResize, stopResize } = usePanelResize({
        storageKey: 'test-panel-width',
        defaultWidth: 300,
        minWidth: 200,
        maxWidth: 600
      })
      const mockEvent = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        clientX: 500
      } as unknown as MouseEvent
      startResize(mockEvent)
      stopResize()
      expect(localStorageMock.setItem).toHaveBeenCalled()
    })

    it('should do nothing on stop if not resizing', () => {
      const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener')
      const { stopResize } = usePanelResize({
        storageKey: 'test-panel-width',
        defaultWidth: 300,
        minWidth: 200,
        maxWidth: 600
      })
      stopResize()
      expect(removeEventListenerSpy).not.toHaveBeenCalled()
    })
  })

  describe('panel width adjustment during resize', () => {
    it('should adjust panel width on mouse move', () => {
      const { startResize, panelWidth } = usePanelResize({
        storageKey: 'test-panel-width',
        defaultWidth: 300,
        minWidth: 200,
        maxWidth: 600
      })
      const mockStartEvent = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        clientX: 500
      } as unknown as MouseEvent
      startResize(mockStartEvent)
      const moveEvent = new MouseEvent('mousemove', { clientX: 450 })
      document.dispatchEvent(moveEvent)
      expect(panelWidth.value).toBe(350)
    })

    it('should clamp panel width during resize', () => {
      const { startResize, panelWidth } = usePanelResize({
        storageKey: 'test-panel-width',
        defaultWidth: 300,
        minWidth: 200,
        maxWidth: 600
      })
      const mockStartEvent = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        clientX: 500
      } as unknown as MouseEvent
      startResize(mockStartEvent)
      const moveEvent = new MouseEvent('mousemove', { clientX: 100 })
      document.dispatchEvent(moveEvent)
      expect(panelWidth.value).toBeGreaterThanOrEqual(200)
    })
  })

  describe('maxWidth calculation', () => {
    it('should use provided maxWidth when available', () => {
      const { saveWidth } = usePanelResize({
        storageKey: 'test-panel-width',
        defaultWidth: 300,
        minWidth: 200,
        maxWidth: 600
      })
      saveWidth(500)
      expect(localStorageMock.setItem).toHaveBeenCalledWith('test-panel-width', '500')
    })

    it('should fallback to window.innerWidth when maxWidth not provided', () => {
      const { saveWidth } = usePanelResize({
        storageKey: 'test-panel-width-2',
        defaultWidth: 300,
        minWidth: 200
      })
      saveWidth(500)
      expect(localStorageMock.setItem).toHaveBeenCalledWith('test-panel-width-2', '500')
    })
  })
})
