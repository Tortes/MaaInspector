<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, ref } from 'vue'
import { FileJson, Plus, X } from 'lucide-vue-next'
import FlowEditor from './FlowEditor.vue'
import InfoPanel from './Flow/InfoPanel.vue'
import { clearWorkspaceState, loadWorkspaceState, saveWorkspaceState } from '../utils/flowWorkspaceStorage'
import type { FlowAppSettings, FlowEditorSnapshot, FlowWorkspaceState } from '../utils/flowWorkspaceTypes'
import type { EdgeType } from '../utils/flowOptions'
import type { FlowBusinessData, LayoutAlgorithm, LayoutDirection, SpacingKey } from '../utils/flowTypes'
import type { NodeStatus } from '../utils/flowTypes'
import { perfLog, perfMark, perfNow } from '../utils/perfTrace'

const NodeDebugPanel = defineAsyncComponent(() => import('./Flow/NodeDebugPanel.vue'))

type FlowEditorExpose = {
  snapshotState: () => void
  getSnapshot: () => FlowEditorSnapshot
  handleLoadNodesWrapper: (payload: { filename: string; source: string; nodes: Record<string, FlowBusinessData>; fileVersion?: 'V1' | 'V2' }) => Promise<void>
  handleLoadImages: (imageDataMap: Record<string, unknown>, basePath?: string) => void
  handleSaveNodes: (payload: { source: string; filename: string }) => Promise<void>
  handleDeviceConnected: (val: boolean) => void
  handleUpdateCanvasConfig: (payload: { edgeType?: string; spacing?: string; layoutAlgorithm?: string; layoutDirection?: string }) => void
  handleUpdatePipelineVersion: (val: 'V1' | 'V2') => void
  handleLocateNode: (nodeId: string) => void
  handleDebugNodeFromPanel: (nodeId: string) => void
  handleUpdateNodeStatus: (payload: { nodeId: string; status: NodeStatus }) => void
}

type InfoPanelExpose = {
  executeFileSwitch: (filename: string, source?: string) => Promise<void>
  handleSaveNodes: () => Promise<void>
}

interface FlowTab {
  id: string
  title: string
  snapshot: FlowEditorSnapshot
}

interface DebugPanelState {
  visible: boolean
  nodeId: string
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

const initialState = restoreInitialState()
const tabs = ref<FlowTab[]>(initialState.tabs)
const activeTabId = ref(initialState.activeTabId)
const appSettings = ref<FlowAppSettings>(initialState.appSettings)
const editorRefs = ref<Map<string, FlowEditorExpose>>(new Map())
const infoPanelRef = ref<InfoPanelExpose | null>(null)
const debugPanel = ref<DebugPanelState>({ visible: false, nodeId: '' })
let persistTimer: ReturnType<typeof setTimeout> | null = null

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
  schedulePersistWorkspaceState()
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
  schedulePersistWorkspaceState()
}

const closeTab = (tabId: string) => {
  if (tabs.value.length <= 1) return
  const index = tabs.value.findIndex(tab => tab.id === tabId)
  if (index < 0) return
  const wasActive = activeTabId.value === tabId
  tabs.value.splice(index, 1)
  editorRefs.value.delete(tabId)
  if (wasActive) activeTabId.value = tabs.value[Math.max(0, index - 1)]?.id || tabs.value[0].id
  schedulePersistWorkspaceState()
}

const updateTabSnapshot = (tabId: string, snapshot: FlowEditorSnapshot) => {
  const start = perfNow()
  const tab = tabs.value.find(item => item.id === tabId)
  if (!tab) return
  const hadLoadedFile = !!tab.snapshot.flowState?.currentFilename || !!tab.snapshot.selectedResourceFile
  const nextHasLoadedFile = !!snapshot.flowState?.currentFilename || !!snapshot.selectedResourceFile
  if (hadLoadedFile && !nextHasLoadedFile) return
  tab.snapshot = snapshot
  schedulePersistWorkspaceState()
  perfLog('FlowWorkspace.updateTabSnapshot', start, {
    tabId,
    filename: snapshot.flowState?.currentFilename,
    nodeCount: snapshot.flowState?.nodes?.length || 0,
    edgeCount: snapshot.flowState?.edges?.length || 0
  })
}

const updateActiveSnapshot = (snapshot: FlowEditorSnapshot, tabId?: string) => {
  updateTabSnapshot(tabId || activeTabId.value, snapshot)
}

const handleRequestSwitchFile = async (payload: { filename: string; source: string }) => {
  await infoPanelRef.value?.executeFileSwitch?.(payload.filename, payload.source)
}

const openDebugPanel = (payload?: { nodeId?: string }) => {
  debugPanel.value = {
    visible: true,
    nodeId: payload?.nodeId || ''
  }
}

const closeDebugPanel = () => {
  debugPanel.value = { visible: false, nodeId: '' }
}

const handleLoadNodes = async (payload: { filename: string; source: string; nodes: Record<string, FlowBusinessData>; fileVersion?: 'V1' | 'V2' }) => {
  const start = perfNow()
  perfMark('FlowWorkspace.handleLoadNodes.start', {
    tabId: activeTabId.value,
    filename: payload.filename,
    nodeCount: Object.keys(payload.nodes).length
  })
  const targetTabId = activeTabId.value
  const targetEditor = editorRefs.value.get(targetTabId)
  if (!targetEditor) return
  await targetEditor.handleLoadNodesWrapper(payload)
  if (targetTabId !== activeTabId.value) return
  const snapshot = targetEditor.getSnapshot()
  if (snapshot) updateTabSnapshot(targetTabId, snapshot)
  perfLog('FlowWorkspace.handleLoadNodes.total', start, { targetTabId, filename: payload.filename })
}

const handleLoadImages = (payload: Record<string, unknown>, basePath?: string) => {
  const start = perfNow()
  console.log('[DEBUG FlowWorkspace] handleLoadImages payload keys:', Object.keys(payload || {}), 'basePath:', basePath, 'activeEditorRef exists:', !!activeEditorRef.value)
  activeEditorRef.value?.handleLoadImages(payload, basePath)
  perfLog('FlowWorkspace.handleLoadImages', start, { imageEntryCount: Object.keys(payload || {}).length })
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
  appSettings.value = {
    ...appSettings.value,
    ...(payload.edgeType ? { edgeType: payload.edgeType } : {}),
    ...(payload.spacing ? { spacing: payload.spacing } : {}),
    ...(payload.layoutAlgorithm ? { layoutAlgorithm: payload.layoutAlgorithm } : {}),
    ...(payload.layoutDirection ? { layoutDirection: payload.layoutDirection } : {})
  }
  tabs.value = tabs.value.map(tab => ({
    ...tab,
    snapshot: applyDefaultConfigToBlankSnapshot(tab.snapshot, appSettings.value)
  }))
  schedulePersistWorkspaceState()
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
  appSettings.value = {
    ...appSettings.value,
    pipelineVersion: val
  }
  tabs.value = tabs.value.map(tab => ({
    ...tab,
    snapshot: applyDefaultConfigToBlankSnapshot(tab.snapshot, appSettings.value)
  }))
  schedulePersistWorkspaceState()
  if (!isBlankSnapshot(activeSnapshot.value)) {
    updateTabSnapshot(activeTabId.value, {
      ...activeSnapshot.value,
      pipelineVersion: val
    })
  }
  activeEditorRef.value?.handleUpdatePipelineVersion(val)
}

const handleUpdateRestoreWorkspace = (value: boolean) => {
  appSettings.value = {
    ...appSettings.value,
    restoreWorkspaceOnStart: value
  }
  if (value) {
    saveWorkspaceState(getWorkspaceState())
  } else {
    clearWorkspaceState()
  }
}

const handleUpdateLowMemory = (value: boolean) => {
  appSettings.value = {
    ...appSettings.value,
    lowMemoryMode: value
  }
  schedulePersistWorkspaceState()
}

const getWorkspaceState = (): FlowWorkspaceState => ({
  tabs: tabs.value,
  activeTabId: activeTabId.value,
  appSettings: appSettings.value
})

const persistWorkspaceState = () => {
  if (!appSettings.value.restoreWorkspaceOnStart) return
  const start = perfNow()
  saveWorkspaceState(getWorkspaceState())
  perfLog('FlowWorkspace.persistWorkspaceState', start, { tabCount: tabs.value.length, activeTabId: activeTabId.value })
}

const schedulePersistWorkspaceState = () => {
  if (!appSettings.value.restoreWorkspaceOnStart) return
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    persistTimer = null
    persistWorkspaceState()
  }, 300)
}

onBeforeUnmount(() => {
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
  // Snapshot all editor instances before unmounting
  editorRefs.value.forEach((editor, tabId) => {
    if (editor) {
      updateTabSnapshot(tabId, editor.getSnapshot())
    }
  })
  persistWorkspaceState()
})
</script>

<template>
  <div class="w-full h-full flex flex-col bg-slate-100 overflow-hidden">
    <div class="shrink-0 border-b border-slate-200 bg-white px-2 py-1.5">
      <div class="flex items-end gap-1 overflow-x-auto overflow-y-hidden">
        <button
          v-for="(tab, index) in tabs"
          :key="tab.id"
          type="button"
          class="group h-9 min-w-0 max-w-[220px] px-3 flex items-center gap-2 border border-b-0 text-xs font-medium transition-colors"
          :class="activeTab?.id === tab.id
            ? 'bg-slate-50 border-slate-200 text-slate-900 rounded-t-lg shadow-sm'
            : 'bg-white border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50 rounded-t-lg'"
          @click="selectTab(tab.id)"
        >
          <FileJson :size="14" class="shrink-0" />
          <span class="truncate">{{ makeTabTitle(tab, index) }}</span>
          <span
            v-if="tab.snapshot.flowState?.dataSnapshot !== tab.snapshot.flowState?.originalDataSnapshot"
            class="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0"
          />
          <span
            v-if="tabs.length > 1"
            class="ml-auto p-0.5 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-700"
            title="关闭标签页"
            @click.stop="closeTab(tab.id)"
          >
            <X :size="13" />
          </span>
        </button>
        <button
          type="button"
          class="h-9 w-9 rounded-t-lg border border-b-0 border-transparent bg-white text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors shrink-0"
          title="新建流程标签页"
          @click="addTab"
        >
          <Plus :size="16" class="mx-auto" />
        </button>
      </div>
    </div>

    <div class="relative flex-1 min-h-0">
      <!-- 低消耗模式: 单实例 + key 强制重建 -->
      <FlowEditor
        v-if="useLowMemoryMode"
        :key="activeTab.id"
        :ref="(el: any) => { if (el) editorRefs.set(activeTabId, el as FlowEditorExpose); else editorRefs.delete(activeTabId) }"
        :tab-id="activeTab.id"
        :snapshot="activeTab.snapshot"
        :default-edge-type="appSettings.edgeType"
        :default-spacing="appSettings.spacing"
        :default-layout-algorithm="appSettings.layoutAlgorithm"
        :default-layout-direction="appSettings.layoutDirection"
        :default-pipeline-version="appSettings.pipelineVersion"
        :debug-panel-visible="debugPanel.visible"
        @snapshot-change="updateActiveSnapshot"
        @request-switch-file="handleRequestSwitchFile"
        @open-debug-panel="openDebugPanel"
        @close-debug-panel="closeDebugPanel"
      />
      
      <!-- 快速模式: 多实例 + v-show 切换 -->
      <div v-else class="absolute inset-0">
        <FlowEditor
          v-for="tab in tabs"
          :key="tab.id"
          :ref="(el: any) => { if (el) editorRefs.set(tab.id, el as FlowEditorExpose); else editorRefs.delete(tab.id) }"
          v-show="tab.id === activeTabId"
          :tab-id="tab.id"
          :snapshot="tab.snapshot"
          :default-edge-type="appSettings.edgeType"
          :default-spacing="appSettings.spacing"
          :default-layout-algorithm="appSettings.layoutAlgorithm"
          :default-layout-direction="appSettings.layoutDirection"
          :default-pipeline-version="appSettings.pipelineVersion"
          :debug-panel-visible="debugPanel.visible"
          @snapshot-change="updateActiveSnapshot"
          @request-switch-file="handleRequestSwitchFile"
          @open-debug-panel="openDebugPanel"
          @close-debug-panel="closeDebugPanel"
        />
      </div>

      <div class="absolute top-3 right-3 z-50 pointer-events-none">
        <InfoPanel
          ref="infoPanelRef"
          :node-count="activeTab.snapshot.flowState?.nodes?.length || 0"
          :edge-count="activeTab.snapshot.flowState?.edges?.length || 0"
          :is-dirty="activeTab.snapshot.flowState?.dataSnapshot !== activeTab.snapshot.flowState?.originalDataSnapshot"
          :current-filename="activeTab.snapshot.flowState?.currentFilename || ''"
          :selected-resource-file="activeTab.snapshot.selectedResourceFile || ''"
          :zoom="activeTab.snapshot.viewport?.zoom || 1"
          :edge-type="appSettings.edgeType"
          :spacing="appSettings.spacing"
          :layout-algorithm="appSettings.layoutAlgorithm"
          :layout-direction="appSettings.layoutDirection"
          :pipeline-version="appSettings.pipelineVersion"
          :restore-workspace-on-start="appSettings.restoreWorkspaceOnStart"
          @update:selected-resource-file="updateActiveSelectedResourceFile"
          @load-nodes="handleLoadNodes"
          @load-images="handleLoadImages"
          @save-nodes="(payload) => activeEditorRef?.handleSaveNodes(payload)"
          @device-connected="(val) => activeEditorRef?.handleDeviceConnected(val)"
          @update-canvas-config="handleUpdateCanvasConfig"
          @update-pipeline-version="handleUpdatePipelineVersion"
          @update-restore-workspace="handleUpdateRestoreWorkspace"
          @update-low-memory="handleUpdateLowMemory"
          @open-debug-panel="openDebugPanel"
        />
      </div>

      <NodeDebugPanel
        :visible="debugPanel.visible"
        :nodes="activeTab.snapshot.flowState?.nodes || []"
        :current-filename="activeTab.snapshot.flowState?.currentFilename || ''"
        :current-source="activeTab.snapshot.flowState?.currentSource || ''"
        :initial-node-id="debugPanel.nodeId"
        @close="closeDebugPanel"
        @locate-node="(nodeId) => activeEditorRef?.handleLocateNode(nodeId)"
        @debug-node="(nodeId) => activeEditorRef?.handleDebugNodeFromPanel(nodeId)"
        @update-node-status="(payload) => activeEditorRef?.handleUpdateNodeStatus(payload)"
      />
    </div>
  </div>
</template>
