import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { nextTick, unref } from 'vue'
import { useTabManager } from '@/composables/useTabManager'
import { useAppConfigStore } from '@/stores/appConfig'

describe('useTabManager', () => {
  let pinia: Pinia
  let store: ReturnType<typeof useAppConfigStore>
  let manager: ReturnType<typeof useTabManager>

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    store = useAppConfigStore(pinia)
    manager = useTabManager(pinia)
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('addTab', () => {
    it('should add a new tab and select it', async () => {
      const initialLen = store.tabs.items.length
      await manager.addTab()
      await nextTick()
      expect(store.tabs.items.length).toBe(initialLen + 1)
      const newTab = store.tabs.items[store.tabs.items.length - 1]
      expect(store.tabs.activeTabId).toBe(newTab.id)
      expect(unref(manager.activeTabId)).toBe(newTab.id)
    })

    it('should create tab with empty resourceFile', async () => {
      await manager.addTab()
      const newTab = store.tabs.items[store.tabs.items.length - 1]
      expect(newTab.resourceFile).toBe('')
    })
  })

  describe('closeTab', () => {
    it('should close a tab and select previous one', async () => {
      await manager.addTab()
      await manager.addTab()
      await nextTick()
      expect(store.tabs.items.length).toBe(2)
      const tabToClose = store.tabs.items[1]
      await manager.closeTab(tabToClose.id)
      await nextTick()
      expect(store.tabs.items.length).toBe(1)
      expect(store.tabs.items.find(t => t.id === tabToClose.id)).toBeUndefined()
    })

    it('should not close the last tab', async () => {
      await manager.addTab()
      expect(store.tabs.items.length).toBe(1)
      const soleTab = store.tabs.items[0]
      await manager.closeTab(soleTab.id)
      await nextTick()
      expect(store.tabs.items.length).toBe(1)
    })

    it('should do nothing for non-existent tab', async () => {
      const initialLen = store.tabs.items.length
      await manager.closeTab('nonexistent')
      await nextTick()
      expect(store.tabs.items.length).toBe(initialLen)
    })

    it('should select previous tab when closing active tab', async () => {
      await manager.addTab()
      await manager.addTab()
      await nextTick()
      await manager.addTab()
      const secondTab = store.tabs.items[1]
      manager.selectTab(secondTab.id)
      await nextTick()
      await manager.closeTab(secondTab.id)
      await nextTick()
      expect(unref(manager.activeTabId)).toBe(store.tabs.items[0].id)
    })
  })

  describe('selectTab', () => {
    it('should change active tab', () => {
      manager.addTab()
      manager.addTab()
      const newTabId = manager.tabs.value.items[1].id
      manager.selectTab(newTabId)
      expect(unref(manager.activeTabId)).toBe(newTabId)
    })

    it('should do nothing when selecting current tab', () => {
      const currentId = unref(manager.activeTabId)
      manager.selectTab(currentId)
      expect(unref(manager.activeTabId)).toBe(currentId)
    })
  })

  describe('updateTabResourceFile', () => {
    it('should update tab resource file', () => {
      manager.addTab()
      const tabId = manager.tabs.value.items[0].id
      manager.updateTabResourceFile(tabId, 'source1|test.json', 'test.json')
      expect(manager.tabs.value.items[0].resourceFile).toBe('source1|test.json')
      expect(manager.tabs.value.items[0].title).toBe('test.json')
    })

    it('should do nothing for non-existent tab', () => {
      expect(() => manager.updateTabResourceFile('nonexistent', 'source1|test.json')).not.toThrow()
    })
  })

  describe('restoreTabsFromResource', () => {
    it('should restore tabs from resource info', () => {
      const tabsToRestore = [
        { id: 'tab-1', title: 'pipeline.json', resourceFile: 'source1|pipeline.json' },
        { id: 'tab-2', title: 'tasks.json', resourceFile: 'source1|tasks.json' }
      ]
      manager.restoreTabsFromResource(tabsToRestore)
      expect(store.tabs.items.length).toBe(2)
      expect(store.tabs.items[0].title).toBe('pipeline.json')
      expect(store.tabs.items[1].title).toBe('tasks.json')
      expect(store.tabs.activeTabId).toBe('tab-1')
      expect(unref(manager.activeTabId)).toBe('tab-1')
    })
  })

  describe('resetToInitialState', () => {
    it('should reset to no tabs', async () => {
      await manager.addTab()
      await manager.addTab()
      await nextTick()
      expect(store.tabs.items.length).toBe(2)
      manager.resetToInitialState()
      await nextTick()
      expect(store.tabs.items.length).toBe(0)
      expect(store.tabs.activeTabId).toBe('')
    })
  })

  describe('handleUpdateCanvasConfig', () => {
    it('should update app settings', () => {
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
  })

  describe('handleUpdatePipelineVersion', () => {
    it('should update pipeline version in app settings', () => {
      manager.handleUpdatePipelineVersion('V2')
      expect(manager.appSettings.value.pipelineVersion).toBe('V2')
    })
  })

  describe('makeTabTitle', () => {
    it('should use tab title when available', () => {
      manager.addTab()
      const tab = manager.tabs.value.items[0]
      if (tab) tab.title = 'my-pipeline.json'
      expect(manager.makeTabTitle(tab, 0)).toBe('my-pipeline.json')
    })

    it('should fallback to indexed title when no title', () => {
      manager.addTab()
      const tab = manager.tabs.value.items[0]
      if (tab) tab.title = ''
      expect(manager.makeTabTitle(tab, 2)).toBe('流程 3')
    })
  })

  describe('getWorkspaceState', () => {
    it('should return current workspace state', () => {
      manager.addTab()
      manager.handleUpdateLowMemory(true)
      const state = manager.getWorkspaceState()
      expect(state.tabs.length).toBe(1)
      expect(state.activeTabId).toBe(unref(manager.activeTabId))
      expect(state.appSettings.lowMemoryMode).toBe(true)
    })
  })
})
