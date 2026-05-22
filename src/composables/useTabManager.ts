import { computed, ref } from 'vue'
import { clearWorkspaceState, loadWorkspaceState, saveWorkspaceState } from '@/utils/flowWorkspaceStorage'
import type { FlowAppSettings, FlowEditorSnapshot, FlowWorkspaceState } from '@/utils/flowWorkspaceTypes'
import type { EdgeType } from '@/utils/flowOptions'
import type { LayoutAlgorithm, LayoutDirection, SpacingKey } from '@/utils/flowTypes'

interface FlowTab {
  id: string
  title: string
  snapshot: FlowEditorSnapshot
}

type FlowEditorExpose = {
  snapshotState: () => void
  getSnapshot: () => FlowEditorSnapshot
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

const DEFAULT_APP_SETTINGS: FlowAppSettings = {
  edgeType: 'smoothstep',
  spacing: 'normal',
  layoutAlgorithm: 'layered',
  layoutDirection: 'TB',
  pipelineVersion: 'V1',
  restoreWorkspaceOnStart: true,
  lowMemoryMode: false
}

const createEmptySnapshot = (settings: FlowAppSettings): FlowEditorSnapshot => ({
  pipelineVersion: settings.pipelineVersion,
  loadedFileVersion: '',
  isDeviceConnected: false,
  selectedResourceFile: '',
  defaultFlowConfig: {
    edgeType: settings.edgeType,
    spacing: settings.spacing,
    layoutAlgorithm: settings.layoutAlgorithm,
    layoutDirection: settings.layoutDirection
  }
})

const createInitialTab = (settings: FlowAppSettings): FlowTab => ({
  id: `flow-${Date.now()}`,
  title: '流程 1',
  snapshot: createEmptySnapshot(settings)
})

const isBlankSnapshot = (snapshot: FlowEditorSnapshot) =>
  !snapshot.flowState?.currentFilename && !snapshot.selectedResourceFile

const applyDefaultConfigToBlankSnapshot = (
  snapshot: FlowEditorSnapshot,
  settings: FlowAppSettings
): FlowEditorSnapshot => {
  if (!isBlankSnapshot(snapshot)) return snapshot
  return {
    ...snapshot,
    pipelineVersion: settings.pipelineVersion,
    defaultFlowConfig: {
      edgeType: settings.edgeType,
      spacing: settings.spacing,
      layoutAlgorithm: settings.layoutAlgorithm,
      layoutDirection: settings.layoutDirection
    },
    flowState: snapshot.flowState
      ? {
          ...snapshot.flowState,
          currentEdgeType: settings.edgeType,
          currentSpacing: settings.spacing,
          currentAlgorithm: settings.layoutAlgorithm,
          currentDirection: settings.layoutDirection
        }
      : undefined
  }
}

const restoreInitialState = () => {
  const stored = loadWorkspaceState()
  const appSettings = {
    ...DEFAULT_APP_SETTINGS,
    ...(stored?.appSettings || {})
  }
  const shouldRestore = appSettings.restoreWorkspaceOnStart && stored?.tabs?.length
  const restoredTabs = shouldRestore ? stored.tabs : [createInitialTab(appSettings)]
  const activeId = shouldRestore && restoredTabs.some(tab => tab.id === stored.activeTabId)
    ? stored.activeTabId
    : restoredTabs[0].id

  return { appSettings, tabs: restoredTabs, activeTabId: activeId }
}

export const useTabManager = () => {
  const initialState = restoreInitialState()
  const tabs = ref<FlowTab[]>(initialState.tabs)
  const activeTabId = ref(initialState.activeTabId)
  const appSettings = ref<FlowAppSettings>(initialState.appSettings)
  const editorRefs = ref<Map<string, FlowEditorExpose>>(new Map())

  const activeTab = computed(() => tabs.value.find(tab => tab.id === activeTabId.value) || tabs.value[0])
  const activeSnapshot = computed(() => activeTab.value.snapshot)
  const activeEditorRef = computed(() => editorRefs.value.get(activeTabId.value) || null)
  const useLowMemoryMode = computed(() => appSettings.value.lowMemoryMode)

  const makeTabTitle = (tab: FlowTab, index: number) => tab.snapshot.flowState?.currentFilename || tab.title || `流程 ${index + 1}`

  const snapshotCurrentEditor = () => {
    if (useLowMemoryMode.value) {
      const editor = editorRefs.value.get(activeTabId.value)
      if (!editor) return
      updateTabSnapshot(activeTabId.value, editor.getSnapshot())
    }
  }

  const selectTab = (tabId: string) => {
    if (tabId === activeTabId.value) return
    snapshotCurrentEditor()
    activeTabId.value = tabId
  }

  const addTab = () => {
    const nextIndex = tabs.value.length + 1
    const nextTab = {
      id: `flow-${Date.now()}-${nextIndex}`,
      title: `流程 ${nextIndex}`,
      snapshot: createEmptySnapshot(appSettings.value)
    }
    tabs.value.push(nextTab)
    activeTabId.value = nextTab.id
  }

  const closeTab = (tabId: string) => {
    if (tabs.value.length <= 1) return
    const index = tabs.value.findIndex(tab => tab.id === tabId)
    if (index < 0) return
    const wasActive = activeTabId.value === tabId
    tabs.value.splice(index, 1)
    editorRefs.value.delete(tabId)
    if (wasActive) activeTabId.value = tabs.value[Math.max(0, index - 1)]?.id || tabs.value[0].id
  }

  const updateTabSnapshot = (tabId: string, snapshot: FlowEditorSnapshot) => {
    const tab = tabs.value.find(item => item.id === tabId)
    if (!tab) return
    const hadLoadedFile = !!tab.snapshot.flowState?.currentFilename || !!tab.snapshot.selectedResourceFile
    const nextHasLoadedFile = !!snapshot.flowState?.currentFilename || !!snapshot.selectedResourceFile
    if (hadLoadedFile && !nextHasLoadedFile) return
    tab.snapshot = snapshot
  }

  const updateActiveSnapshot = (snapshot: FlowEditorSnapshot, tabId?: string) => {
    updateTabSnapshot(tabId || activeTabId.value, snapshot)
  }

  const updateActiveSelectedResourceFile = (value: string) => {
    updateTabSnapshot(activeTabId.value, {
      ...activeSnapshot.value,
      selectedResourceFile: value
    })
  }

  const handleUpdateCanvasConfig = (payload: {
    edgeType?: EdgeType
    spacing?: SpacingKey
    layoutAlgorithm?: LayoutAlgorithm
    layoutDirection?: LayoutDirection
  }) => {
    if (payload.edgeType) appSettings.value.edgeType = payload.edgeType
    if (payload.spacing) appSettings.value.spacing = payload.spacing
    if (payload.layoutAlgorithm) appSettings.value.layoutAlgorithm = payload.layoutAlgorithm
    if (payload.layoutDirection) appSettings.value.layoutDirection = payload.layoutDirection

    tabs.value = tabs.value.map(tab => ({
      ...tab,
      snapshot: applyDefaultConfigToBlankSnapshot(tab.snapshot, appSettings.value)
    }))
    const currentSnapshot = activeSnapshot.value
    const currentFlowState = currentSnapshot.flowState
    if (currentFlowState) {
      updateTabSnapshot(activeTabId.value, {
        ...currentSnapshot,
        flowState: {
          ...currentFlowState,
          ...(payload.edgeType ? { currentEdgeType: payload.edgeType } : {}),
          ...(payload.spacing ? { currentSpacing: payload.spacing } : {}),
          ...(payload.layoutAlgorithm ? { currentAlgorithm: payload.layoutAlgorithm } : {}),
          ...(payload.layoutDirection ? { currentDirection: payload.layoutDirection } : {})
        }
      })
    }
    activeEditorRef.value?.handleUpdateCanvasConfig(payload)
  }

  const handleUpdatePipelineVersion = (val: 'V1' | 'V2') => {
    appSettings.value.pipelineVersion = val
    tabs.value = tabs.value.map(tab => ({
      ...tab,
      snapshot: applyDefaultConfigToBlankSnapshot(tab.snapshot, appSettings.value)
    }))
    if (!isBlankSnapshot(activeSnapshot.value)) {
      updateTabSnapshot(activeTabId.value, {
        ...activeSnapshot.value,
        pipelineVersion: val
      })
    }
    activeEditorRef.value?.handleUpdatePipelineVersion(val)
  }

  const handleUpdateRestoreWorkspace = (value: boolean) => {
    appSettings.value.restoreWorkspaceOnStart = value
    if (value) {
      saveWorkspaceState(getWorkspaceState())
    } else {
      clearWorkspaceState()
    }
  }

  const handleUpdateLowMemory = (value: boolean) => {
    appSettings.value.lowMemoryMode = value
  }

  const getWorkspaceState = (): FlowWorkspaceState => ({
    tabs: tabs.value,
    activeTabId: activeTabId.value,
    appSettings: appSettings.value
  })

  const snapshotAllEditors = () => {
    editorRefs.value.forEach((editor, tabId) => {
      if (editor) {
        updateTabSnapshot(tabId, editor.getSnapshot())
      }
    })
  }

  return {
    tabs,
    activeTabId,
    appSettings,
    editorRefs,
    activeTab,
    activeSnapshot,
    activeEditorRef,
    useLowMemoryMode,
    makeTabTitle,
    selectTab,
    addTab,
    closeTab,
    updateTabSnapshot,
    updateActiveSnapshot,
    updateActiveSelectedResourceFile,
    handleUpdateCanvasConfig,
    handleUpdatePipelineVersion,
    handleUpdateRestoreWorkspace,
    handleUpdateLowMemory,
    getWorkspaceState,
    snapshotAllEditors,
    snapshotCurrentEditor
  }
}
