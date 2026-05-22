import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useTabManager } from '@/composables/useTabManager'
import type { FlowEditorSnapshot, FlowWorkspaceState } from '@/utils/flowWorkspaceTypes'

vi.mock('@/utils/flowWorkspaceStorage', () => ({
  loadWorkspaceState: vi.fn(),
  saveWorkspaceState: vi.fn(),
  clearWorkspaceState: vi.fn()
}))

import { loadWorkspaceState, saveWorkspaceState, clearWorkspaceState } from '@/utils/flowWorkspaceStorage'

describe('useTabManager', () => {
  const mockLoadWorkspaceState = vi.mocked(loadWorkspaceState)
  const mockSaveWorkspaceState = vi.mocked(saveWorkspaceState)
  const mockClearWorkspaceState = vi.mocked(clearWorkspaceState)

  beforeEach(() => {
    vi.clearAllMocks()
    mockLoadWorkspaceState.mockReturnValue(null)
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  function createTabManager() {
    return useTabManager()
  }

  describe('addTab', () => {
    it('should add a new tab and select it', () => {
      const manager = createTabManager()
      const initialTabs = manager.tabs.value.length
      manager.addTab()
      expect(manager.tabs.value.length).toBe(initialTabs + 1)
      const newTab = manager.tabs.value[manager.tabs.value.length - 1]
      expect(manager.activeTabId.value).toBe(newTab.id)
    })

    it('should create tab with empty snapshot', () => {
      const manager = createTabManager()
      manager.addTab()
      const newTab = manager.tabs.value[manager.tabs.value.length - 1]
      expect(newTab.snapshot.flowState?.currentFilename).toBeFalsy()
      expect(newTab.snapshot.selectedResourceFile).toBeFalsy()
    })
  })

  describe('closeTab', () => {
    it('should close a tab and select previous one', () => {
      const manager = createTabManager()
      manager.addTab()
      manager.addTab()
      const tabToClose = manager.tabs.value[1]
      manager.closeTab(tabToClose.id)
      expect(manager.tabs.value.length).toBe(2)
      expect(manager.tabs.value.find(t => t.id === tabToClose.id)).toBeUndefined()
    })

    it('should not close the last tab', () => {
      const manager = createTabManager()
      const lastTab = manager.tabs.value[0]
      manager.closeTab(lastTab.id)
      expect(manager.tabs.value.length).toBe(1)
      expect(manager.tabs.value[0].id).toBe(lastTab.id)
    })

    it('should do nothing for non-existent tab', () => {
      const manager = createTabManager()
      manager.closeTab('nonexistent')
      expect(manager.tabs.value.length).toBe(1)
    })

    it('should select next tab when closing first tab', () => {
      const manager = createTabManager()
      manager.addTab()
      manager.addTab()
      const firstTab = manager.tabs.value[0]
      manager.selectTab(firstTab.id)
      manager.closeTab(firstTab.id)
      expect(manager.activeTabId.value).toBe(manager.tabs.value[0].id)
    })
  })

  describe('selectTab', () => {
    it('should change active tab', () => {
      const manager = createTabManager()
      manager.addTab()
      const newTabId = manager.tabs.value[1].id
      manager.selectTab(newTabId)
      expect(manager.activeTabId.value).toBe(newTabId)
    })

    it('should do nothing when selecting current tab', () => {
      const manager = createTabManager()
      const currentId = manager.activeTabId.value
      manager.selectTab(currentId)
      expect(manager.activeTabId.value).toBe(currentId)
    })

    it('should snapshot current editor before switching when lowMemoryMode is enabled', () => {
      mockLoadWorkspaceState.mockReturnValue({
        tabs: [
          { id: 'tab-1', title: 'Tab 1', snapshot: {} as FlowEditorSnapshot },
          { id: 'tab-2', title: 'Tab 2', snapshot: {} as FlowEditorSnapshot }
        ],
        activeTabId: 'tab-1',
        appSettings: { restoreWorkspaceOnStart: true, lowMemoryMode: true, pipelineVersion: 'V1' }
      } as any)
      const manager = createTabManager()
      const mockEditor = {
        getSnapshot: vi.fn().mockReturnValue({ flowState: { currentFilename: 'test.json' } } as FlowEditorSnapshot),
        snapshotState: vi.fn(),
        handleLoadNodesWrapper: vi.fn(),
        handleLoadImages: vi.fn(),
        handleSaveNodes: vi.fn(),
        handleDeviceConnected: vi.fn(),
        handleUpdateCanvasConfig: vi.fn(),
        handleUpdatePipelineVersion: vi.fn(),
        handleLocateNode: vi.fn(),
        handleDebugNodeFromPanel: vi.fn(),
        handleUpdateNodeStatus: vi.fn()
      }
      manager.editorRefs.value.set('tab-1', mockEditor)
      manager.selectTab('tab-2')
      expect(mockEditor.getSnapshot).toHaveBeenCalled()
    })
  })

  describe('updateTabSnapshot', () => {
    it('should update tab snapshot', () => {
      const manager = createTabManager()
      const tabId = manager.tabs.value[0].id
      const newSnapshot = {
        flowState: { currentFilename: 'test.json' }
      } as FlowEditorSnapshot
      manager.updateTabSnapshot(tabId, newSnapshot)
      expect(manager.tabs.value[0].snapshot.flowState?.currentFilename).toBe('test.json')
    })

    it('should not overwrite loaded file with blank snapshot', () => {
      const manager = createTabManager()
      const tabId = manager.tabs.value[0].id
      manager.updateTabSnapshot(tabId, {
        flowState: { currentFilename: 'loaded.json' }
      } as FlowEditorSnapshot)
      manager.updateTabSnapshot(tabId, {
        flowState: undefined
      } as FlowEditorSnapshot)
      expect(manager.tabs.value[0].snapshot.flowState?.currentFilename).toBe('loaded.json')
    })

    it('should do nothing for non-existent tab', () => {
      const manager = createTabManager()
      expect(() => manager.updateTabSnapshot('nonexistent', {} as FlowEditorSnapshot)).not.toThrow()
    })
  })

  describe('handleUpdateCanvasConfig', () => {
    it('should update app settings', () => {
      const manager = createTabManager()
      manager.handleUpdateCanvasConfig({
        edgeType: 'default',
        spacing: 'compact',
        layoutAlgorithm: 'stress',
        layoutDirection: 'LR'
      })
      expect(manager.appSettings.value.edgeType).toBe('default')
      expect(manager.appSettings.value.spacing).toBe('compact')
      expect(manager.appSettings.value.layoutAlgorithm).toBe('stress')
      expect(manager.appSettings.value.layoutDirection).toBe('LR')
    })

    it('should update active tab flowState', () => {
      const manager = createTabManager()
      const tabId = manager.tabs.value[0].id
      manager.updateTabSnapshot(tabId, {
        flowState: {
          currentEdgeType: 'smoothstep',
          currentSpacing: 'normal',
          currentAlgorithm: 'layered',
          currentDirection: 'TB'
        }
      } as FlowEditorSnapshot)
      manager.handleUpdateCanvasConfig({
        edgeType: 'default',
        spacing: 'compact'
      })
      const snapshot = manager.tabs.value.find(t => t.id === tabId)?.snapshot
      expect(snapshot?.flowState?.currentEdgeType).toBe('default')
      expect(snapshot?.flowState?.currentSpacing).toBe('compact')
    })

    it('should call editor handleUpdateCanvasConfig', () => {
      const manager = createTabManager()
      const mockEditor = {
        handleUpdateCanvasConfig: vi.fn(),
        snapshotState: vi.fn(),
        getSnapshot: vi.fn(),
        handleLoadNodesWrapper: vi.fn(),
        handleLoadImages: vi.fn(),
        handleSaveNodes: vi.fn(),
        handleDeviceConnected: vi.fn(),
        handleUpdatePipelineVersion: vi.fn(),
        handleLocateNode: vi.fn(),
        handleDebugNodeFromPanel: vi.fn(),
        handleUpdateNodeStatus: vi.fn()
      }
      manager.editorRefs.value.set(manager.activeTabId.value, mockEditor as any)
      manager.handleUpdateCanvasConfig({ edgeType: 'default' })
      expect(mockEditor.handleUpdateCanvasConfig).toHaveBeenCalledWith({ edgeType: 'default' })
    })
  })

  describe('workspace state restoration', () => {
    it('should restore tabs from stored state when restoreWorkspaceOnStart is true', () => {
      const storedState: FlowWorkspaceState = {
        tabs: [
          { id: 'tab-1', title: 'Restored Tab', snapshot: {} as FlowEditorSnapshot },
          { id: 'tab-2', title: 'Another Tab', snapshot: {} as FlowEditorSnapshot }
        ],
        activeTabId: 'tab-2',
        appSettings: { restoreWorkspaceOnStart: true, pipelineVersion: 'V1', edgeType: 'smoothstep', spacing: 'normal', layoutAlgorithm: 'layered', layoutDirection: 'TB', lowMemoryMode: false }
      }
      mockLoadWorkspaceState.mockReturnValue(storedState)
      const manager = createTabManager()
      expect(manager.tabs.value.length).toBe(2)
      expect(manager.activeTabId.value).toBe('tab-2')
      expect(manager.appSettings.value.restoreWorkspaceOnStart).toBe(true)
    })

    it('should not restore when restoreWorkspaceOnStart is false', () => {
      const storedState: FlowWorkspaceState = {
        tabs: [
          { id: 'tab-1', title: 'Restored Tab', snapshot: {} as FlowEditorSnapshot }
        ],
        activeTabId: 'tab-1',
        appSettings: { restoreWorkspaceOnStart: false, pipelineVersion: 'V1', edgeType: 'smoothstep', spacing: 'normal', layoutAlgorithm: 'layered', layoutDirection: 'TB', lowMemoryMode: false }
      }
      mockLoadWorkspaceState.mockReturnValue(storedState)
      const manager = createTabManager()
      expect(manager.tabs.value.length).toBe(1)
      expect(manager.tabs.value[0].id).not.toBe('tab-1')
    })

    it('should create initial tab when no stored state', () => {
      mockLoadWorkspaceState.mockReturnValue(null)
      const manager = createTabManager()
      expect(manager.tabs.value.length).toBe(1)
      expect(manager.tabs.value[0].title).toBe('流程 1')
    })
  })

  describe('handleUpdateRestoreWorkspace', () => {
    it('should save state when enabling restore', () => {
      const manager = createTabManager()
      manager.handleUpdateRestoreWorkspace(true)
      expect(manager.appSettings.value.restoreWorkspaceOnStart).toBe(true)
      expect(mockSaveWorkspaceState).toHaveBeenCalled()
    })

    it('should clear state when disabling restore', () => {
      const manager = createTabManager()
      manager.handleUpdateRestoreWorkspace(false)
      expect(manager.appSettings.value.restoreWorkspaceOnStart).toBe(false)
      expect(mockClearWorkspaceState).toHaveBeenCalled()
    })
  })

  describe('handleUpdatePipelineVersion', () => {
    it('should update pipeline version in app settings', () => {
      const manager = createTabManager()
      manager.handleUpdatePipelineVersion('V2')
      expect(manager.appSettings.value.pipelineVersion).toBe('V2')
    })

    it('should call editor handleUpdatePipelineVersion', () => {
      const manager = createTabManager()
      const mockEditor = {
        handleUpdatePipelineVersion: vi.fn()
      }
      manager.editorRefs.value.set(manager.activeTabId.value, mockEditor as any)
      manager.handleUpdatePipelineVersion('V2')
      expect(mockEditor.handleUpdatePipelineVersion).toHaveBeenCalledWith('V2')
    })
  })

  describe('makeTabTitle', () => {
    it('should use currentFilename when available', () => {
      const manager = createTabManager()
      const tab = manager.tabs.value[0]
      tab.snapshot.flowState = { currentFilename: 'my-pipeline.json' } as any
      expect(manager.makeTabTitle(tab, 0)).toBe('my-pipeline.json')
    })

    it('should fallback to tab title when no filename', () => {
      const manager = createTabManager()
      const tab = manager.tabs.value[0]
      tab.title = 'Custom Title'
      expect(manager.makeTabTitle(tab, 0)).toBe('Custom Title')
    })

    it('should fallback to indexed title when no filename or title', () => {
      const manager = createTabManager()
      const tab = manager.tabs.value[0]
      tab.title = ''
      expect(manager.makeTabTitle(tab, 2)).toBe('流程 3')
    })
  })

  describe('getWorkspaceState', () => {
    it('should return current workspace state', () => {
      const manager = createTabManager()
      manager.addTab()
      manager.appSettings.value.lowMemoryMode = true
      const state = manager.getWorkspaceState()
      expect(state.tabs.length).toBe(2)
      expect(state.activeTabId).toBe(manager.activeTabId.value)
      expect(state.appSettings.lowMemoryMode).toBe(true)
    })
  })

  describe('snapshotAllEditors', () => {
    it('should snapshot all editors', () => {
      const manager = createTabManager()
      manager.addTab()
      const mockEditor1 = {
        getSnapshot: vi.fn().mockReturnValue({ flowState: { currentFilename: 'file1.json' } } as FlowEditorSnapshot),
        snapshotState: vi.fn(),
        handleLoadNodesWrapper: vi.fn(),
        handleLoadImages: vi.fn(),
        handleSaveNodes: vi.fn(),
        handleDeviceConnected: vi.fn(),
        handleUpdateCanvasConfig: vi.fn(),
        handleUpdatePipelineVersion: vi.fn(),
        handleLocateNode: vi.fn(),
        handleDebugNodeFromPanel: vi.fn(),
        handleUpdateNodeStatus: vi.fn()
      }
      const mockEditor2 = {
        getSnapshot: vi.fn().mockReturnValue({ flowState: { currentFilename: 'file2.json' } } as FlowEditorSnapshot),
        snapshotState: vi.fn(),
        handleLoadNodesWrapper: vi.fn(),
        handleLoadImages: vi.fn(),
        handleSaveNodes: vi.fn(),
        handleDeviceConnected: vi.fn(),
        handleUpdateCanvasConfig: vi.fn(),
        handleUpdatePipelineVersion: vi.fn(),
        handleLocateNode: vi.fn(),
        handleDebugNodeFromPanel: vi.fn(),
        handleUpdateNodeStatus: vi.fn()
      }
      manager.editorRefs.value.set(manager.tabs.value[0].id, mockEditor1)
      manager.editorRefs.value.set(manager.tabs.value[1].id, mockEditor2)
      manager.snapshotAllEditors()
      expect(mockEditor1.getSnapshot).toHaveBeenCalled()
      expect(mockEditor2.getSnapshot).toHaveBeenCalled()
    })
  })
})
