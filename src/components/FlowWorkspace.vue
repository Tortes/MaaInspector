<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, ref } from 'vue'
import { FileJson, Plus, X } from 'lucide-vue-next'
import FlowEditor from './FlowEditor.vue'
import InfoPanel from './Flow/InfoPanel.vue'
import { useTabManager } from '@/composables/useTabManager'
import { useMainAppState } from '@/composables/useMainAppState'
import type { TabResourceInfo } from '@/utils/flowWorkspaceTypes'
import type { FlowBusinessData } from '@/utils/flowTypes'

const NodeDebugPanel = defineAsyncComponent(() => import('./Flow/NodeDebugPanel.vue'))

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
  tabs,
  activeTabId,
  appSettings,
  editorRefs,
  makeTabTitle,
  selectTab: tabManagerSelectTab,
  addTab: tabManagerAddTab,
  closeTab: tabManagerCloseTab,
  updateTabResourceFile,
  restoreTabsFromResource,
  resetToInitialState,
  ensureWorkspaceTab
} = useTabManager()

const { updateTabs, clearTabs: clearMainTabs } = useMainAppState()

const infoPanelRef = ref<InfoPanelExpose | null>(null)
const debugPanel = ref<DebugPanelState>({ visible: false, nodeId: '' })

const activeTab = computed(() => tabs.value.items.find(t => t.id === activeTabId.value) || tabs.value.items[0] || null)
const activeEditorRef = computed(() => editorRefs.value.get(activeTabId.value) || null)

const selectTab = (tabId: string) => {
  tabManagerSelectTab(tabId)

  const targetTab = tabs.value.items.find(t => t.id === tabId)
  if (!targetTab?.resourceFile) return

  const infoPanel = infoPanelRef.value
  if (infoPanel?.triggerLoadFromCache) {
    const [source, filename] = targetTab.resourceFile.split('|')
    infoPanel.triggerLoadFromCache({
      filename,
      source,
      tabId
    })
  }
}

const addTab = () => {
  tabManagerAddTab()
}

const closeTab = (tabId: string) => {
  tabManagerCloseTab(tabId)
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
  const tab = ensureWorkspaceTab()
  await nextTick()
  const targetEditor = editorRefs.value.get(tab.id)
  if (!targetEditor) return
  await targetEditor.handleLoadNodesWrapper(payload)
  const resourceFile = `${payload.source}|${payload.filename}`
  updateTabResourceFile(tab.id, resourceFile, payload.filename)
}

const handleLoadImages = (payload: Record<string, unknown>, basePath?: string) => {
  activeEditorRef.value?.handleLoadImages(payload, basePath)
}

const handleUpdateCanvasConfig = (payload: {
  edgeType?: string
  spacing?: string
  layoutAlgorithm?: string
  layoutDirection?: string
}) => {
  activeEditorRef.value?.handleUpdateCanvasConfig(payload)
}

const handleUpdatePipelineVersion = (val: 'V1' | 'V2') => {
  activeEditorRef.value?.handleUpdatePipelineVersion(val)
}

const handleRestoreTabs = async (lastTabs: TabResourceInfo[]) => {
  restoreTabsFromResource(lastTabs)

  await nextTick()
  for (let i = 0; i < lastTabs.length; i++) {
    const tab = tabs.value.items[i]
    if (tab && lastTabs[i].resourceFile) {
      const editor = editorRefs.value.get(tab.id)
      if (editor) {
        try {
          await editor.loadResourceFile(lastTabs[i].resourceFile)
        } catch (error) {
          console.warn(`Failed to load resource for tab ${tab.title}`, error)
          tabManagerCloseTab(tab.id)
        }
      }
    }
  }

  updateTabs(tabs.value.items, activeTabId.value)
}

const handleClearTabs = () => {
  resetToInitialState()
  clearMainTabs()
}

const handleDeviceConnected = (val: boolean) => {
  activeEditorRef.value?.handleDeviceConnected(val)
}
</script>

<template>
  <div class="w-full h-full flex flex-col bg-slate-100 overflow-hidden">
    <div class="shrink-0 border-b border-slate-200 bg-white px-2 py-1.5">
      <div class="flex items-end gap-1 overflow-x-auto overflow-y-hidden">
        <button
          v-for="(tab, index) in tabs.items"
          :key="tab.id"
          type="button"
          class="group h-9 min-w-0 max-w-[220px] px-3 flex items-center gap-2 border border-b-0 text-xs font-medium transition-colors"
          :class="activeTab?.id === tab.id
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
            v-if="tabs.items.length > 1"
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
      <FlowEditor
        v-if="appSettings.lowMemoryMode && activeTab"
        :key="activeTab.id"
        :ref="(el: any) => { if (el) editorRefs.set(activeTabId, el as FlowEditorExpose); else editorRefs.delete(activeTabId) }"
        :tab-id="activeTab.id"
        :debug-panel-visible="debugPanel.visible"
        @request-switch-file="handleRequestSwitchFile"
        @open-debug-panel="openDebugPanel"
        @close-debug-panel="closeDebugPanel"
      />

      <div
        v-else-if="activeTab"
        class="absolute inset-0"
      >
        <FlowEditor
          v-for="tab in tabs.items"
          v-show="tab.id === activeTabId"
          :key="tab.id"
          :ref="(el: any) => { if (el) editorRefs.set(tab.id, el as FlowEditorExpose); else editorRefs.delete(tab.id) }"
          :tab-id="tab.id"
          :debug-panel-visible="debugPanel.visible"
          @request-switch-file="handleRequestSwitchFile"
          @open-debug-panel="openDebugPanel"
          @close-debug-panel="closeDebugPanel"
        />
      </div>

      <div
        v-else
        class="absolute inset-0 flex items-center justify-center bg-slate-100"
      >
        <div class="text-center text-slate-500">
          <FileJson
            :size="40"
            class="mx-auto mb-3 text-slate-300"
          />
          <div class="text-sm font-semibold text-slate-600">
            未打开标签页
          </div>
          <div class="mt-1 text-xs">
            请在右上角控制台加载资源后选择文件
          </div>
        </div>
      </div>

      <div class="absolute top-3 right-3 z-50 pointer-events-none">
        <InfoPanel
          ref="infoPanelRef"
          :tabs="tabs.items"
          :current-filename="activeTab?.title || ''"
          :selected-resource-file="activeTab?.resourceFile || ''"
          :edge-type="appSettings.edgeType"
          :spacing="appSettings.spacing"
          :layout-algorithm="appSettings.layoutAlgorithm"
          :layout-direction="appSettings.layoutDirection"
          :pipeline-version="appSettings.pipelineVersion"
          :restore-workspace-on-start="appSettings.restoreWorkspaceOnStart"
          @update:selected-resource-file="() => {}"
          @load-nodes="handleLoadNodes"
          @load-images="handleLoadImages"
          @save-nodes="(payload) => activeEditorRef?.handleSaveNodes(payload)"
          @device-connected="handleDeviceConnected"
          @update-canvas-config="handleUpdateCanvasConfig"
          @update-pipeline-version="handleUpdatePipelineVersion"
          @restore-tabs="handleRestoreTabs"
          @clear-tabs="handleClearTabs"
          @open-debug-panel="openDebugPanel"
        />
      </div>

      <NodeDebugPanel
        :visible="debugPanel.visible"
        :initial-node-id="debugPanel.nodeId"
        @close="closeDebugPanel"
        @locate-node="(nodeId) => activeEditorRef?.handleLocateNode(nodeId)"
        @debug-node="(nodeId) => activeEditorRef?.handleDebugNodeFromPanel(nodeId)"
        @update-node-status="(payload) => activeEditorRef?.handleUpdateNodeStatus(payload)"
      />
    </div>
  </div>
</template>
