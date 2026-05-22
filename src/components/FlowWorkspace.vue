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
import { useWorkspaceStore } from '../stores/workspace'
import { useSettingsStore } from '../stores/settings'
import type { FlowTab } from '../stores/workspace'

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
  triggerLoadFromCache: (config: { filename: string; source: string; tabId: string }) => void
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

const workspaceStore = useWorkspaceStore()
const settingsStore = useSettingsStore()

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
workspaceStore.setTabs(initialState.tabs)
workspaceStore.setActiveTabId(initialState.activeTabId)
settingsStore.updateSettings(initialState.appSettings)

const editorRefs = ref<Map<string, FlowEditorExpose>>(new Map())
const infoPanelRef = ref<InfoPanelExpose | null>(null)
const debugPanel = ref<DebugPanelState>({ visible: false, nodeId: '' })
let persistTimer: ReturnType<typeof setTimeout> | null = null

const activeSnapshot = computed(() => workspaceStore.activeTab?.snapshot)
const activeEditorRef = computed(() => editorRefs.value.get(workspaceStore.activeTabId) || null)

const makeTabTitle = (tab: FlowTab, index: number) => tab.snapshot.flowState?.currentFilename || tab.title || `流程 ${index + 1}`

const snapshotCurrentEditor = () => {
  if (settingsStore.lowMemoryMode) {
    const editor = editorRefs.value.get(workspaceStore.activeTabId)
    if (!editor) return
    updateTabSnapshot(workspaceStore.activeTabId, editor.getSnapshot())
  }
}

const selectTab = (tabId: string) => {
  if (tabId === workspaceStore.activeTabId) return
  snapshotCurrentEditor()
  workspaceStore.setActiveTabId(tabId)
  schedulePersistWorkspaceState()
  
  const targetTab = workspaceStore.tabs.find(t => t.id === tabId)
  if (!targetTab?.snapshot?.flowState?.currentFilename) return
  
  const infoPanel = infoPanelRef.value
  if (infoPanel?.triggerLoadFromCache) {
    infoPanel.triggerLoadFromCache({
      filename: targetTab.snapshot.flowState.currentFilename,
      source: targetTab.snapshot.flowState.currentSource,
      tabId
    })
  }
}

const addTab = () => {
  const nextIndex = workspaceStore.tabs.length + 1
  const nextTab = {
    id: `flow-${Date.now()}-${nextIndex}`,
    title: `流程 ${nextIndex}`,
    snapshot: createEmptySnapshot({
      edgeType: settingsStore.edgeType,
      spacing: settingsStore.spacing,
      layoutAlgorithm: settingsStore.layoutAlgorithm,
      layoutDirection: settingsStore.layoutDirection,
      pipelineVersion: settingsStore.pipelineVersion,
      restoreWorkspaceOnStart: settingsStore.restoreWorkspaceOnStart,
      lowMemoryMode: settingsStore.lowMemoryMode
    })
  }
  workspaceStore.addTab(nextTab)
  schedulePersistWorkspaceState()
}

const closeTab = (tabId: string) => {
  if (workspaceStore.tabs.length <= 1) return
  const index = workspaceStore.tabs.findIndex(tab => tab.id === tabId)
  if (index < 0) return
  editorRefs.value.delete(tabId)
  workspaceStore.removeTab(tabId)
  schedulePersistWorkspaceState()
}

const updateTabSnapshot = (tabId: string, snapshot: FlowEditorSnapshot) => {
  const start = perfNow()
  const tab = workspaceStore.tabs.find(item => item.id === tabId)
  if (!tab) return
  const hadLoadedFile = !!tab.snapshot.flowState?.currentFilename || !!tab.snapshot.selectedResourceFile
  const nextHasLoadedFile = !!snapshot.flowState?.currentFilename || !!snapshot.selectedResourceFile
  if (hadLoadedFile && !nextHasLoadedFile) return
  workspaceStore.updateTabSnapshot(tabId, snapshot)
  schedulePersistWorkspaceState()
  perfLog('FlowWorkspace.updateTabSnapshot', start, {
    tabId,
    filename: snapshot.flowState?.currentFilename,
    nodeCount: snapshot.flowState?.nodes?.length || 0,
    edgeCount: snapshot.flowState?.edges?.length || 0
  })
}

const updateActiveSnapshot = (snapshot: FlowEditorSnapshot, tabId?: string) => {
  updateTabSnapshot(tabId || workspaceStore.activeTabId, snapshot)
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
    tabId: workspaceStore.activeTabId,
    filename: payload.filename,
    nodeCount: Object.keys(payload.nodes).length
  })
  const targetTabId = workspaceStore.activeTabId
  const targetEditor = editorRefs.value.get(targetTabId)
  if (!targetEditor) return
  await targetEditor.handleLoadNodesWrapper(payload)
  if (targetTabId !== workspaceStore.activeTabId) return
  const snapshot = targetEditor.getSnapshot()
  if (snapshot) updateTabSnapshot(targetTabId, snapshot)
  perfLog('FlowWorkspace.handleLoadNodes.total', start, { targetTabId, filename: payload.filename })
}

const handleLoadImages = (payload: Record<string, unknown>, basePath?: string) => {
  const start = perfNow()

  activeEditorRef.value?.handleLoadImages(payload, basePath)
  perfLog('FlowWorkspace.handleLoadImages', start, { imageEntryCount: Object.keys(payload || {}).length })
}

const updateActiveSelectedResourceFile = (value: string) => {
  const currentSnapshot = activeSnapshot.value
  if (!currentSnapshot) return
  updateTabSnapshot(workspaceStore.activeTabId, {
    ...currentSnapshot,
    selectedResourceFile: value
  })
}

const getAppSettings = (): FlowAppSettings => ({
  edgeType: settingsStore.edgeType,
  spacing: settingsStore.spacing,
  layoutAlgorithm: settingsStore.layoutAlgorithm,
  layoutDirection: settingsStore.layoutDirection,
  pipelineVersion: settingsStore.pipelineVersion,
  restoreWorkspaceOnStart: settingsStore.restoreWorkspaceOnStart,
  lowMemoryMode: settingsStore.lowMemoryMode
})

const handleUpdateCanvasConfig = (payload: {
  edgeType?: EdgeType
  spacing?: SpacingKey
  layoutAlgorithm?: LayoutAlgorithm
  layoutDirection?: LayoutDirection
}) => {
  settingsStore.updateSettings({
    edgeType: payload.edgeType,
    spacing: payload.spacing,
    layoutAlgorithm: payload.layoutAlgorithm,
    layoutDirection: payload.layoutDirection
  })
  const currentSettings = getAppSettings()
  workspaceStore.updateAllTabs(tab => ({
    ...tab,
    snapshot: applyDefaultConfigToBlankSnapshot(tab.snapshot, currentSettings)
  }))
  schedulePersistWorkspaceState()
  const currentSnapshot = activeSnapshot.value
  const currentFlowState = currentSnapshot?.flowState
  if (currentFlowState) {
    updateTabSnapshot(workspaceStore.activeTabId, {
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
  settingsStore.updateSettings({ pipelineVersion: val })
  const currentSettings = getAppSettings()
  workspaceStore.updateAllTabs(tab => ({
    ...tab,
    snapshot: applyDefaultConfigToBlankSnapshot(tab.snapshot, currentSettings)
  }))
  schedulePersistWorkspaceState()
  const currentSnapshot = activeSnapshot.value
  if (currentSnapshot && !isBlankSnapshot(currentSnapshot)) {
    updateTabSnapshot(workspaceStore.activeTabId, {
      ...currentSnapshot,
      pipelineVersion: val
    })
  }
  activeEditorRef.value?.handleUpdatePipelineVersion(val)
}

const handleUpdateRestoreWorkspace = (value: boolean) => {
  settingsStore.updateSettings({ restoreWorkspaceOnStart: value })
  if (value) {
    saveWorkspaceState(getWorkspaceState())
  } else {
    clearWorkspaceState()
  }
}

const handleUpdateLowMemory = (value: boolean) => {
  settingsStore.updateSettings({ lowMemoryMode: value })
  schedulePersistWorkspaceState()
}

const getWorkspaceState = (): FlowWorkspaceState => ({
  tabs: workspaceStore.tabs,
  activeTabId: workspaceStore.activeTabId,
  appSettings: getAppSettings()
})

const persistWorkspaceState = () => {
  if (!settingsStore.restoreWorkspaceOnStart) return
  const start = perfNow()
  saveWorkspaceState(getWorkspaceState())
  perfLog('FlowWorkspace.persistWorkspaceState', start, { tabCount: workspaceStore.tabs.length, activeTabId: workspaceStore.activeTabId })
}

const schedulePersistWorkspaceState = () => {
  if (!settingsStore.restoreWorkspaceOnStart) return
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
          v-for="(tab, index) in workspaceStore.tabs"
          :key="tab.id"
          type="button"
          class="group h-9 min-w-0 max-w-[220px] px-3 flex items-center gap-2 border border-b-0 text-xs font-medium transition-colors"
          :class="workspaceStore.activeTab?.id === tab.id
            ? 'bg-slate-50 border-slate-200 text-slate-900 rounded-t-lg shadow-sm'
            : 'bg-white border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50 rounded-t-lg'"
          @click="selectTab(tab.id)"
        >
          <FileJson
            :size="14"
            class="shrink-0"
          />
          <span class="truncate">{{ makeTabTitle(tab, index) }}</span>
          <span
            v-if="tab.snapshot.flowState?.dataSnapshot !== tab.snapshot.flowState?.originalDataSnapshot"
            class="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0"
          />
          <span
            v-if="workspaceStore.tabs.length > 1"
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
          <Plus
            :size="16"
            class="mx-auto"
          />
        </button>
      </div>
    </div>

    <div class="relative flex-1 min-h-0">
      <!-- 低消耗模式: 单实例 + key 强制重建 -->
      <FlowEditor
        v-if="settingsStore.lowMemoryMode"
        :key="workspaceStore.activeTab!.id"
        :ref="(el: any) => { if (el) editorRefs.set(workspaceStore.activeTabId, el as FlowEditorExpose); else editorRefs.delete(workspaceStore.activeTabId) }"
        :tab-id="workspaceStore.activeTab!.id"
        :snapshot="workspaceStore.activeTab!.snapshot"
        :default-edge-type="settingsStore.edgeType"
        :default-spacing="settingsStore.spacing"
        :default-layout-algorithm="settingsStore.layoutAlgorithm"
        :default-layout-direction="settingsStore.layoutDirection"
        :default-pipeline-version="settingsStore.pipelineVersion"
        :debug-panel-visible="debugPanel.visible"
        @snapshot-change="updateActiveSnapshot"
        @request-switch-file="handleRequestSwitchFile"
        @open-debug-panel="openDebugPanel"
        @close-debug-panel="closeDebugPanel"
      />

      <!-- 快速模式: 多实例 + v-show 切换 -->
      <div
        v-else
        class="absolute inset-0"
      >
        <FlowEditor
          v-for="tab in workspaceStore.tabs"
          v-show="tab.id === workspaceStore.activeTabId"
          :key="tab.id"
          :ref="(el: any) => { if (el) editorRefs.set(tab.id, el as FlowEditorExpose); else editorRefs.delete(tab.id) }"
          :tab-id="tab.id"
          :snapshot="tab.snapshot"
          :default-edge-type="settingsStore.edgeType"
          :default-spacing="settingsStore.spacing"
          :default-layout-algorithm="settingsStore.layoutAlgorithm"
          :default-layout-direction="settingsStore.layoutDirection"
          :default-pipeline-version="settingsStore.pipelineVersion"
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
          :tabs="workspaceStore.tabs"
          :node-count="workspaceStore.activeTab!.snapshot.flowState?.nodes?.length || 0"
          :edge-count="workspaceStore.activeTab!.snapshot.flowState?.edges?.length || 0"
          :is-dirty="workspaceStore.activeTab!.snapshot.flowState?.dataSnapshot !== workspaceStore.activeTab!.snapshot.flowState?.originalDataSnapshot"
          :current-filename="workspaceStore.activeTab!.snapshot.flowState?.currentFilename || ''"
          :selected-resource-file="workspaceStore.activeTab!.snapshot.selectedResourceFile || ''"
          :zoom="workspaceStore.activeTab!.snapshot.viewport?.zoom || 1"
          :edge-type="settingsStore.edgeType"
          :spacing="settingsStore.spacing"
          :layout-algorithm="settingsStore.layoutAlgorithm"
          :layout-direction="settingsStore.layoutDirection"
          :pipeline-version="settingsStore.pipelineVersion"
          :restore-workspace-on-start="settingsStore.restoreWorkspaceOnStart"
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
        :nodes="workspaceStore.activeTab!.snapshot.flowState?.nodes || []"
        :current-filename="workspaceStore.activeTab!.snapshot.flowState?.currentFilename || ''"
        :current-source="workspaceStore.activeTab!.snapshot.flowState?.currentSource || ''"
        :initial-node-id="debugPanel.nodeId"
        @close="closeDebugPanel"
        @locate-node="(nodeId) => activeEditorRef?.handleLocateNode(nodeId)"
        @debug-node="(nodeId) => activeEditorRef?.handleDebugNodeFromPanel(nodeId)"
        @update-node-status="(payload) => activeEditorRef?.handleUpdateNodeStatus(payload)"
      />
    </div>
  </div>
</template>
