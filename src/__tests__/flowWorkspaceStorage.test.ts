import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { loadWorkspaceState, saveWorkspaceState, clearWorkspaceState } from '@/utils/flowWorkspaceStorage'
import type { FlowWorkspaceState } from '@/utils/flowWorkspaceTypes'

describe('flowWorkspaceStorage', () => {
  const STORAGE_KEY = 'maainspector.flow.workspace.v1'

  const mockState: FlowWorkspaceState = {
    tabs: [
      {
        id: 'tab-1',
        title: 'Test Tab',
          snapshot: {
            flowState: {
              nodes: [
                {
                  id: 'node-1',
                  position: { x: 0, y: 0 },
                  type: 'default',
                  data: {
                    id: 'node-1',
                    type: 'default',
                    _images: [{ path: 'img1.png', base64: 'data:image/png;base64,abc123' }],
                    _del_images: [{ path: 'img2.png', base64: 'data:image/png;base64,def456' }],
                    _temp_images: [{ path: 'img3.png', base64: 'data:image/png;base64,ghi789' }]
                  }
                }
              ],
              edges: [],
              currentEdgeType: 'default',
              currentSpacing: 'normal',
              currentAlgorithm: 'layered',
              currentDirection: 'TB',
              currentFilename: '',
              currentSource: '',
              originalDataSnapshot: '',
              dataSnapshot: '',
              selectedNodeId: null,
              imageState: { nodeImageStates: [] }
            }
          }
      }
    ],
    activeTabId: 'tab-1',
    appSettings: {
      edgeType: 'default',
      spacing: 'normal',
      layoutAlgorithm: 'layered',
      layoutDirection: 'TB',
      pipelineVersion: 'V2',
      restoreWorkspaceOnStart: true,
      lowMemoryMode: false
    }
  }

  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  describe('loadWorkspaceState', () => {
    it('should return null when localStorage is empty', () => {
      expect(loadWorkspaceState()).toBeNull()
    })

    it('should load and parse state from localStorage', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(mockState))
      const result = loadWorkspaceState()
      expect(result).toEqual(mockState)
    })

    it('should return null when key does not exist', () => {
      localStorage.setItem('other-key', '{}')
      expect(loadWorkspaceState()).toBeNull()
    })

    it('should return null on invalid JSON', () => {
      localStorage.setItem(STORAGE_KEY, 'not-json')
      expect(loadWorkspaceState()).toBeNull()
    })
  })

  describe('saveWorkspaceState', () => {
    it('should save state to localStorage', () => {
      saveWorkspaceState(mockState)
      const raw = localStorage.getItem(STORAGE_KEY)
      expect(raw).not.toBeNull()
      const parsed = JSON.parse(raw!)
      expect(parsed.activeTabId).toBe('tab-1')
      expect(parsed.tabs).toHaveLength(1)
    })

    it('should strip base64 from _images', () => {
      saveWorkspaceState(mockState)
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
      const images = parsed.tabs[0].snapshot.flowState.nodes[0].data._images
      expect(images).toHaveLength(1)
      expect(images[0]).not.toHaveProperty('base64')
      expect(images[0]).toHaveProperty('path', 'img1.png')
    })

    it('should strip base64 from _del_images', () => {
      saveWorkspaceState(mockState)
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
      const delImages = parsed.tabs[0].snapshot.flowState.nodes[0].data._del_images
      expect(delImages).toHaveLength(1)
      expect(delImages[0]).not.toHaveProperty('base64')
    })

    it('should strip base64 from _temp_images', () => {
      saveWorkspaceState(mockState)
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
      const tempImages = parsed.tabs[0].snapshot.flowState.nodes[0].data._temp_images
      expect(tempImages).toHaveLength(1)
      expect(tempImages[0]).not.toHaveProperty('base64')
    })

    it('should handle nodes without data', () => {
      const stateWithoutData: FlowWorkspaceState = {
        ...mockState,
        tabs: [{
          ...mockState.tabs[0],
          snapshot: {
            flowState: {
              nodes: [{ id: 'node-no-data', position: { x: 0, y: 0 } }],
              edges: [],
              currentEdgeType: 'default',
              currentSpacing: 'normal',
              currentAlgorithm: 'layered',
              currentDirection: 'TB',
              currentFilename: '',
              currentSource: '',
              originalDataSnapshot: '',
              dataSnapshot: '',
              selectedNodeId: null,
              imageState: { nodeImageStates: [] }
            }
          }
        }]
      }
      saveWorkspaceState(stateWithoutData)
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
      expect(parsed.tabs[0].snapshot.flowState.nodes[0].id).toBe('node-no-data')
    })

    it('should handle tabs without flowState', () => {
      const stateWithoutFlowState: FlowWorkspaceState = {
        ...mockState,
        tabs: [{
          ...mockState.tabs[0],
          snapshot: {}
        }]
      }
      saveWorkspaceState(stateWithoutFlowState)
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
      expect(parsed.tabs[0].snapshot.flowState).toBeUndefined()
    })

    it('should handle empty images arrays', () => {
      const stateWithEmptyImages: FlowWorkspaceState = {
        ...mockState,
        tabs: [{
          ...mockState.tabs[0],
          snapshot: {
            flowState: {
              nodes: [{
                id: 'node-1',
                position: { x: 0, y: 0 },
                type: 'default',
                data: {
                  id: 'node-1',
                  type: 'default',
                  _images: [],
                  _del_images: [],
                  _temp_images: []
                }
              }],
              edges: [],
              currentEdgeType: 'default',
              currentSpacing: 'normal',
              currentAlgorithm: 'layered',
              currentDirection: 'TB',
              currentFilename: '',
              currentSource: '',
              originalDataSnapshot: '',
              dataSnapshot: '',
              selectedNodeId: null,
              imageState: { nodeImageStates: [] }
            }
          }
        }]
      }
      saveWorkspaceState(stateWithEmptyImages)
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
      expect(parsed.tabs[0].snapshot.flowState.nodes[0].data._images).toEqual([])
    })
  })

  describe('clearWorkspaceState', () => {
    it('should remove workspace state from localStorage', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(mockState))
      clearWorkspaceState()
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    })

    it('should not affect other keys', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(mockState))
      localStorage.setItem('other-key', 'value')
      clearWorkspaceState()
      expect(localStorage.getItem('other-key')).toBe('value')
    })

    it('should not throw when key does not exist', () => {
      expect(() => clearWorkspaceState()).not.toThrow()
    })
  })

  describe('silent failure on localStorage errors', () => {
    beforeEach(() => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('localStorage unavailable')
      })
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('localStorage unavailable')
      })
      vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
        throw new Error('localStorage unavailable')
      })
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('loadWorkspaceState should return null on error', () => {
      expect(loadWorkspaceState()).toBeNull()
    })

    it('saveWorkspaceState should not throw on error', () => {
      expect(() => saveWorkspaceState(mockState)).not.toThrow()
    })

    it('clearWorkspaceState should not throw on error', () => {
      expect(() => clearWorkspaceState()).not.toThrow()
    })
  })
})
