<script setup lang="ts">
import { computed, defineAsyncComponent, ref } from 'vue'
import { FileJson, Plus, X } from 'lucide-vue-next'
import FlowEditor from './FlowEditor.vue'
import InfoPanel from './Flow/InfoPanel.vue'
import { useTabManager } from '../composables/useTabManager'
import { useWorkspacePersistence } from '../composables/useWorkspacePersistence'
import type { FlowEditorSnapshot } from '../utils/flowWorkspaceTypes'
import type { EdgeType } from '../utils/flowOptions'
import type { FlowBusinessData, LayoutAlgorithm, LayoutDirection, SpacingKey } from '../utils/flowTypes'
import { perfLog, perfMark, perfNow } from '../utils/perfTrace'
import { useSettingsStore } from '../stores/settings'

const NodeDebugPanel = defineAsyncComponent(() => import('./Flow/NodeDebugPanel.vue'))

type FlowEditorExpose = any

type InfoPanelExpose = {
  executeFileSwitch: (filename: string, source?: string) => Promise<void>
  handleSaveNodes: () => Promise<void>
  triggerLoadFromCache: (config: { filename: string; source: string; tabId: string }) => void
}

interface DebugPanelState {
  visible: boolean
  nodeId: string
}

const {
  tabs: tabManagerTabs,
  activeTabId: tabManagerActiveTabId,
  appSettings,
  editorRefs,
  activeTab: tabManagerActiveTab,
  makeTabTitle,
  selectTab: tabManagerSelectTab,
  addTab: tabManagerAddTab,
  closeTab: tabManagerCloseTab,
  updateTabSnapshot: tabManagerUpdateTabSnapshot,
  handleUpdateCanvasConfig: tabManagerHandleUpdateCanvasConfig,
  handleUpdatePipelineVersion: tabManagerHandleUpdatePipelineVersion,
  handleUpdateRestoreWorkspace: tabManagerHandleUpdateRestoreWorkspace,
  handleUpdateLowMemory: tabManagerHandleUpdateLowMemory,
  getWorkspaceState,
  snapshotAllEditors,
  snapshotCurrentEditor
} = useTabManager()

const { schedulePersistWorkspaceState } = useWorkspacePersistence({
  appSettings,
  tabs: tabManagerTabs,
  activeTabId: tabManagerActiveTabId,
  getWorkspaceState,
  snapshotAllEditors
})

const settingsStore = useSettingsStore()

const infoPanelRef = ref<InfoPanelExpose | null>(null)
const debugPanel = ref<DebugPanelState>({ visible: false, nodeId: '' })

const activeEditorRef = computed(() => editorRefs.value.get(tabManagerActiveTabId.value) || null)

const selectTab = (tabId: string) => {
  snapshotCurrentEditor()
  tabManagerSelectTab(tabId)
  schedulePersistWorkspaceState()

  const targetTab = tabManagerTabs.value.find(t => t.id === tabId)
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
  tabManagerAddTab()
  schedulePersistWorkspaceState()
}

const closeTab = (tabId: string) => {
  tabManagerCloseTab(tabId)
  schedulePersistWorkspaceState()
}

const updateTabSnapshot = (tabId: string, snapshot: FlowEditorSnapshot) => {
  const start = perfNow()
  const tab = tabManagerTabs.value.find(item => item.id === tabId)
  if (!tab) return
  const hadLoadedFile = !!tab.snapshot.flowState?.currentFilename || !!tab.snapshot.selectedResourceFile
  const nextHasLoadedFile = !!snapshot.flowState?.currentFilename || !!snapshot.selectedResourceFile
  if (hadLoadedFile && !nextHasLoadedFile) return
  tabManagerUpdateTabSnapshot(tabId, snapshot)
  schedulePersistWorkspaceState()
  perfLog('FlowWorkspace.updateTabSnapshot', start, {
    tabId,
    filename: snapshot.flowState?.currentFilename,
    nodeCount: snapshot.flowState?.nodes?.length || 0,
    edgeCount: snapshot.flowState?.edges?.length || 0
  })
}

const updateActiveSnapshot = (snapshot: FlowEditorSnapshot, tabId?: string) => {
  updateTabSnapshot(tabId || tabManagerActiveTabId.value, snapshot)
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
    tabId: tabManagerActiveTabId.value,
    filename: payload.filename,
    nodeCount: Object.keys(payload.nodes).length
  })
  const targetTabId = tabManagerActiveTabId.value
  const targetEditor = editorRefs.value.get(targetTabId)
  if (!targetEditor) return
  await targetEditor.handleLoadNodesWrapper(payload)
  if (targetTabId !== tabManagerActiveTabId.value) return
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
  const currentSnapshot = tabManagerActiveTab.value.snapshot
  if (!currentSnapshot) return
  updateTabSnapshot(tabManagerActiveTabId.value, {
    ...currentSnapshot,
    selectedResourceFile: value
  })
}

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
  tabManagerHandleUpdateCanvasConfig(payload)
  schedulePersistWorkspaceState()
  activeEditorRef.value?.handleUpdateCanvasConfig(payload)
}

const handleUpdatePipelineVersion = (val: 'V1' | 'V2') => {
  settingsStore.updateSettings({ pipelineVersion: val })
  tabManagerHandleUpdatePipelineVersion(val)
  schedulePersistWorkspaceState()
  activeEditorRef.value?.handleUpdatePipelineVersion(val)
}

const handleUpdateRestoreWorkspace = (value: boolean) => {
  settingsStore.updateSettings({ restoreWorkspaceOnStart: value })
  tabManagerHandleUpdateRestoreWorkspace(value)
}

const handleUpdateLowMemory = (value: boolean) => {
  settingsStore.updateSettings({ lowMemoryMode: value })
  tabManagerHandleUpdateLowMemory(value)
  schedulePersistWorkspaceState()
}
</script>

<template>
  <div class="w-full h-full flex flex-col bg-slate-100 overflow-hidden">
    <div class="shrink-0 border-b border-slate-200 bg-white px-2 py-1.5">
      <div class="flex items-end gap-1 overflow-x-auto overflow-y-hidden">
        <button
          v-for="(tab, index) in tabManagerTabs"
          :key="tab.id"
          type="button"
          class="group h-9 min-w-0 max-w-[220px] px-3 flex items-center gap-2 border border-b-0 text-xs font-medium transition-colors"
          :class="tabManagerActiveTab?.id === tab.id
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
            v-if="tabManagerTabs.length > 1"
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
        v-if="appSettings.lowMemoryMode"
        :key="tabManagerActiveTab!.id"
        :ref="(el: any) => { if (el) editorRefs.set(tabManagerActiveTabId, el as FlowEditorExpose); else editorRefs.delete(tabManagerActiveTabId) }"
        :tab-id="tabManagerActiveTab!.id"
        :snapshot="tabManagerActiveTab!.snapshot"
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
      <div
        v-else
        class="absolute inset-0"
      >
        <FlowEditor
          v-for="tab in tabManagerTabs"
          v-show="tab.id === tabManagerActiveTabId"
          :key="tab.id"
          :ref="(el: any) => { if (el) editorRefs.set(tab.id, el as FlowEditorExpose); else editorRefs.delete(tab.id) }"
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
          :tabs="tabManagerTabs"
          :node-count="tabManagerActiveTab!.snapshot.flowState?.nodes?.length || 0"
          :edge-count="tabManagerActiveTab!.snapshot.flowState?.edges?.length || 0"
          :is-dirty="tabManagerActiveTab!.snapshot.flowState?.dataSnapshot !== tabManagerActiveTab!.snapshot.flowState?.originalDataSnapshot"
          :current-filename="tabManagerActiveTab!.snapshot.flowState?.currentFilename || ''"
          :selected-resource-file="tabManagerActiveTab!.snapshot.selectedResourceFile || ''"
          :zoom="tabManagerActiveTab!.snapshot.viewport?.zoom || 1"
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
        :nodes="tabManagerActiveTab!.snapshot.flowState?.nodes || []"
        :current-filename="tabManagerActiveTab!.snapshot.flowState?.currentFilename || ''"
        :current-source="tabManagerActiveTab!.snapshot.flowState?.currentSource || ''"
        :initial-node-id="debugPanel.nodeId"
        @close="closeDebugPanel"
        @locate-node="(nodeId) => activeEditorRef?.handleLocateNode(nodeId)"
        @debug-node="(nodeId) => activeEditorRef?.handleDebugNodeFromPanel(nodeId)"
        @update-node-status="(payload) => activeEditorRef?.handleUpdateNodeStatus(payload)"
      />
    </div>
  </div>
</template>
