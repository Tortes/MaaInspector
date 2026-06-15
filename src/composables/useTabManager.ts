import { ref, computed } from 'vue'
import type { Pinia } from 'pinia'
import { useAppConfigStore } from '@/stores/appConfig'
import type { TabResourceInfo } from '@/utils/flowWorkspaceTypes'

interface FlowTab {
  id: string
  title: string
  resourceFile: string
}

type FlowEditorExpose = {
  loadResourceFile: (fileId: string) => Promise<void>
  handleLoadNodesWrapper: (payload: { filename: string; source: string; nodes: Record<string, unknown>; fileVersion?: 'V1' | 'V2' }) => Promise<void>
  handleLoadImages: (imageDataMap: Record<string, unknown>, basePath?: string) => void
  handleSaveNodes: (payload: { source: string; filename: string }) => Promise<void>
  handleDeviceConnected: (val: boolean) => void
  handleUpdateCanvasConfig: (payload: { edgeType?: string; spacing?: string; layoutAlgorithm?: string; layoutDirection?: string }) => void
  handleUpdatePipelineVersion: (val: 'V1' | 'V2') => void
  handleLocateNode: (nodeId: string) => void
  handleDebugNodeFromPanel: (nodeId: string) => void
  handleUpdateNodeStatus: (payload: { nodeId: string; status: unknown }) => void
}

const createInitialTab = (): FlowTab => ({
  id: `flow-${crypto.randomUUID()}`,
  title: '流程 1',
  resourceFile: ''
})

export const useTabManager = (pinia?: Pinia) => {
  const store = useAppConfigStore(pinia)
  const editorRefs = ref<Map<string, FlowEditorExpose>>(new Map())

  const activeEditorRef = ref<FlowEditorExpose | null>(null)

  const makeTabTitle = (tab: FlowTab, index: number) => tab.title || `流程 ${index + 1}`

  const selectTab = (tabId: string) => {
    store.selectTab(tabId)
  }

  const addTab = () => {
    const tab = createInitialTab()
    store.addTab({ id: tab.id, title: tab.title, resourceFile: tab.resourceFile })
  }

  const closeTab = (tabId: string) => {
    store.closeTab(tabId)
  }

  const updateTabResourceFile = (tabId: string, resourceFile: string, title?: string) => {
    store.updateTabResourceFile(tabId, resourceFile, title)
  }

  const restoreTabsFromResource = (tabInfos: TabResourceInfo[]) => {
    const activeTabId = tabInfos.some(tab => tab.id === store.tabs.activeTabId)
      ? store.tabs.activeTabId
      : tabInfos[0]?.id || ''
    store.setTabs(tabInfos, activeTabId)
  }

  const resetToInitialState = () => {
    store.setTabs([], '')
  }

  const ensureWorkspaceTab = () => {
    return store.ensureWorkspaceTab()
  }

  return {
    tabs: computed(() => store.tabs),
    activeTabId: computed(() => store.tabs.activeTabId),
    appSettings: computed(() => store.canvas),
    editorRefs,
    activeTab: computed(() => store.tabs),
    activeEditorRef,
    useLowMemoryMode: computed(() => store.canvas.lowMemoryMode),
    makeTabTitle,
    selectTab,
    addTab,
    closeTab,
    updateTabResourceFile,
    restoreTabsFromResource,
    resetToInitialState,
    ensureWorkspaceTab,
    handleUpdateCanvasConfig: store.updateCanvasSettings,
    handleUpdatePipelineVersion: (val: 'V1' | 'V2') => store.updateCanvasSettings({ pipelineVersion: val }),
    handleUpdateLowMemory: (value: boolean) => store.updateCanvasSettings({ lowMemoryMode: value }),
    getWorkspaceState: () => ({
      tabs: store.tabs.items.map(t => ({ id: t.id, title: t.title, resourceFile: t.resourceFile })),
      activeTabId: store.tabs.activeTabId,
      appSettings: store.canvas
    })
  }
}
