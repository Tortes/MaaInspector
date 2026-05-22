import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useWorkspaceStore } from '@/stores/workspace'
import type { FlowEditorSnapshot } from '@/utils/flowWorkspaceTypes'

describe('useWorkspaceStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  function createMockSnapshot(): FlowEditorSnapshot {
    return {} as FlowEditorSnapshot
  }

  describe('initial state', () => {
    it('should have empty tabs', () => {
      const store = useWorkspaceStore()
      expect(store.tabs).toEqual([])
    })

    it('should have empty activeTabId', () => {
      const store = useWorkspaceStore()
      expect(store.activeTabId).toBe('')
    })

    it('should have null activeTab', () => {
      const store = useWorkspaceStore()
      expect(store.activeTab).toBeNull()
    })
  })

  describe('addTab', () => {
    it('should add a tab to the store', () => {
      const store = useWorkspaceStore()
      const tab = { id: 'tab-1', title: 'Tab 1', snapshot: createMockSnapshot() }
      store.addTab(tab)
      expect(store.tabs.length).toBe(1)
      expect(store.tabs[0].id).toBe('tab-1')
    })

    it('should set the added tab as active', () => {
      const store = useWorkspaceStore()
      const tab = { id: 'tab-1', title: 'Tab 1', snapshot: createMockSnapshot() }
      store.addTab(tab)
      expect(store.activeTabId).toBe('tab-1')
    })

    it('should add multiple tabs', () => {
      const store = useWorkspaceStore()
      store.addTab({ id: 'tab-1', title: 'Tab 1', snapshot: createMockSnapshot() })
      store.addTab({ id: 'tab-2', title: 'Tab 2', snapshot: createMockSnapshot() })
      expect(store.tabs.length).toBe(2)
    })

    it('should set the last added tab as active', () => {
      const store = useWorkspaceStore()
      store.addTab({ id: 'tab-1', title: 'Tab 1', snapshot: createMockSnapshot() })
      store.addTab({ id: 'tab-2', title: 'Tab 2', snapshot: createMockSnapshot() })
      expect(store.activeTabId).toBe('tab-2')
    })
  })

  describe('removeTab', () => {
    it('should remove a tab by id', () => {
      const store = useWorkspaceStore()
      store.addTab({ id: 'tab-1', title: 'Tab 1', snapshot: createMockSnapshot() })
      store.addTab({ id: 'tab-2', title: 'Tab 2', snapshot: createMockSnapshot() })
      store.removeTab('tab-1')
      expect(store.tabs.length).toBe(1)
      expect(store.tabs.find(t => t.id === 'tab-1')).toBeUndefined()
    })

    it('should do nothing for non-existent tab', () => {
      const store = useWorkspaceStore()
      store.addTab({ id: 'tab-1', title: 'Tab 1', snapshot: createMockSnapshot() })
      store.removeTab('nonexistent')
      expect(store.tabs.length).toBe(1)
    })

    it('should select previous tab when removing active tab', () => {
      const store = useWorkspaceStore()
      store.addTab({ id: 'tab-1', title: 'Tab 1', snapshot: createMockSnapshot() })
      store.addTab({ id: 'tab-2', title: 'Tab 2', snapshot: createMockSnapshot() })
      store.addTab({ id: 'tab-3', title: 'Tab 3', snapshot: createMockSnapshot() })
      store.removeTab('tab-3')
      expect(store.activeTabId).toBe('tab-2')
    })

    it('should select first tab when removing the only tab', () => {
      const store = useWorkspaceStore()
      store.addTab({ id: 'tab-1', title: 'Tab 1', snapshot: createMockSnapshot() })
      store.removeTab('tab-1')
      expect(store.activeTabId).toBe('')
    })

    it('should select first tab when removing first tab', () => {
      const store = useWorkspaceStore()
      store.addTab({ id: 'tab-1', title: 'Tab 1', snapshot: createMockSnapshot() })
      store.addTab({ id: 'tab-2', title: 'Tab 2', snapshot: createMockSnapshot() })
      store.removeTab('tab-1')
      expect(store.activeTabId).toBe('tab-2')
    })

    it('should select previous tab when removing middle tab', () => {
      const store = useWorkspaceStore()
      store.addTab({ id: 'tab-1', title: 'Tab 1', snapshot: createMockSnapshot() })
      store.addTab({ id: 'tab-2', title: 'Tab 2', snapshot: createMockSnapshot() })
      store.addTab({ id: 'tab-3', title: 'Tab 3', snapshot: createMockSnapshot() })
      store.setActiveTabId('tab-2')
      store.removeTab('tab-2')
      expect(store.activeTabId).toBe('tab-1')
    })
  })

  describe('setActiveTabId', () => {
    it('should set the active tab id', () => {
      const store = useWorkspaceStore()
      store.addTab({ id: 'tab-1', title: 'Tab 1', snapshot: createMockSnapshot() })
      store.setActiveTabId('tab-1')
      expect(store.activeTabId).toBe('tab-1')
    })

    it('should set any id even if tab does not exist', () => {
      const store = useWorkspaceStore()
      store.setActiveTabId('nonexistent')
      expect(store.activeTabId).toBe('nonexistent')
    })
  })

  describe('setTabs', () => {
    it('should replace all tabs', () => {
      const store = useWorkspaceStore()
      store.addTab({ id: 'tab-1', title: 'Tab 1', snapshot: createMockSnapshot() })
      const newTabs = [
        { id: 'tab-2', title: 'Tab 2', snapshot: createMockSnapshot() },
        { id: 'tab-3', title: 'Tab 3', snapshot: createMockSnapshot() }
      ]
      store.setTabs(newTabs)
      expect(store.tabs.length).toBe(2)
      expect(store.tabs[0].id).toBe('tab-2')
      expect(store.tabs[1].id).toBe('tab-3')
    })
  })

  describe('activeTab computed', () => {
    it('should return the active tab', () => {
      const store = useWorkspaceStore()
      store.addTab({ id: 'tab-1', title: 'Tab 1', snapshot: createMockSnapshot() })
      store.addTab({ id: 'tab-2', title: 'Tab 2', snapshot: createMockSnapshot() })
      store.setActiveTabId('tab-2')
      expect(store.activeTab?.id).toBe('tab-2')
    })

    it('should return first tab when activeTabId is empty', () => {
      const store = useWorkspaceStore()
      store.addTab({ id: 'tab-1', title: 'Tab 1', snapshot: createMockSnapshot() })
      expect(store.activeTab?.id).toBe('tab-1')
    })

    it('should return null when no tabs exist', () => {
      const store = useWorkspaceStore()
      expect(store.activeTab).toBeNull()
    })

    it('should return first tab when activeTabId does not match any tab', () => {
      const store = useWorkspaceStore()
      store.addTab({ id: 'tab-1', title: 'Tab 1', snapshot: createMockSnapshot() })
      store.setActiveTabId('nonexistent')
      expect(store.activeTab?.id).toBe('tab-1')
    })
  })

  describe('updateTabSnapshot', () => {
    it('should update a tab snapshot', () => {
      const store = useWorkspaceStore()
      const snapshot = createMockSnapshot()
      store.addTab({ id: 'tab-1', title: 'Tab 1', snapshot })
      const newSnapshot = { flowState: { currentFilename: 'test.json' } } as FlowEditorSnapshot
      store.updateTabSnapshot('tab-1', newSnapshot)
      expect(store.tabs[0].snapshot.flowState?.currentFilename).toBe('test.json')
    })

    it('should do nothing for non-existent tab', () => {
      const store = useWorkspaceStore()
      const snapshot = createMockSnapshot()
      store.addTab({ id: 'tab-1', title: 'Tab 1', snapshot })
      expect(() => store.updateTabSnapshot('nonexistent', {} as FlowEditorSnapshot)).not.toThrow()
    })
  })

  describe('updateAllTabs', () => {
    it('should update all tabs using the updater function', () => {
      const store = useWorkspaceStore()
      store.addTab({ id: 'tab-1', title: 'Tab 1', snapshot: createMockSnapshot() })
      store.addTab({ id: 'tab-2', title: 'Tab 2', snapshot: createMockSnapshot() })
      store.updateAllTabs(tab => ({ ...tab, title: tab.title + ' Updated' }))
      expect(store.tabs[0].title).toBe('Tab 1 Updated')
      expect(store.tabs[1].title).toBe('Tab 2 Updated')
    })

    it('should replace tab references', () => {
      const store = useWorkspaceStore()
      store.addTab({ id: 'tab-1', title: 'Tab 1', snapshot: createMockSnapshot() })
      const newTab = { id: 'tab-1-replaced', title: 'Replaced', snapshot: createMockSnapshot() }
      store.updateAllTabs(() => newTab)
      expect(store.tabs[0].id).toBe('tab-1-replaced')
    })
  })
})
