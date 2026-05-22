import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { FlowEditorSnapshot } from '@/utils/flowWorkspaceTypes'

export interface FlowTab {
  id: string
  title: string
  snapshot: FlowEditorSnapshot
}

export const useWorkspaceStore = defineStore('workspace', () => {
  const tabs = ref<FlowTab[]>([])
  const activeTabId = ref<string>('')

  const activeTab = computed(() =>
    tabs.value.find(tab => tab.id === activeTabId.value) || tabs.value[0] || null
  )

  function setTabs(newTabs: FlowTab[]) {
    tabs.value = newTabs
  }

  function setActiveTabId(id: string) {
    activeTabId.value = id
  }

  function addTab(tab: FlowTab) {
    tabs.value.push(tab)
    activeTabId.value = tab.id
  }

  function removeTab(id: string) {
    const idx = tabs.value.findIndex(tab => tab.id === id)
    if (idx < 0) return
    tabs.value.splice(idx, 1)
    if (activeTabId.value === id) {
      activeTabId.value = tabs.value[Math.max(0, idx - 1)]?.id || tabs.value[0]?.id || ''
    }
  }

  function updateTabSnapshot(id: string, snapshot: FlowEditorSnapshot) {
    const tab = tabs.value.find(t => t.id === id)
    if (tab) tab.snapshot = snapshot
  }

  function updateAllTabs(updater: (tab: FlowTab) => FlowTab) {
    tabs.value = tabs.value.map(updater)
  }

  return {
    tabs,
    activeTabId,
    activeTab,
    setTabs,
    setActiveTabId,
    addTab,
    removeTab,
    updateTabSnapshot,
    updateAllTabs
  }
})
