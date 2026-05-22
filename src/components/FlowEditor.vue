<script setup lang="ts">
import { ref, provide, onMounted, onBeforeUnmount, computed, defineAsyncComponent, watch, nextTick } from 'vue'
import { VueFlow, useVueFlow, type NodeTypesObject } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { FolderSearch } from 'lucide-vue-next'
import { ElMessage } from 'element-plus'
import ContextMenu from './Flow/ContextMenu.vue'
import { useFlowGraph } from '../composables/useFlowGraph'
import { useEditorActions } from '../composables/useEditorActions'
import { useSaveManager } from '../composables/useSaveManager'
import { useDebugRunner } from '../composables/useDebugRunner'
import type { FlowEditorSnapshot } from '../utils/flowWorkspaceTypes'
import type { SpacingKey, LayoutAlgorithm, LayoutDirection, LoadNodesPayload, FlowNode, FlowEdge } from '../utils/flowTypes'
import type { EdgeType } from '../utils/flowOptions'
import { perfLog, perfMark, perfNow } from '../utils/perfTrace'
import { throttle } from '../utils/throttle'

const NodeSearch = defineAsyncComponent(() => import('./Flow/NodeSearch.vue'))
const SaveConfirmModal = defineAsyncComponent(() => import('./Flow/Modals/SaveConfirmModal.vue'))
const DeleteImagesConfirmModal = defineAsyncComponent(() => import('./Flow/Modals/DeleteImagesConfirmModal.vue'))

const props = defineProps<{
  tabId?: string
  snapshot?: FlowEditorSnapshot
  defaultEdgeType?: EdgeType
  defaultSpacing?: SpacingKey
  defaultLayoutAlgorithm?: LayoutAlgorithm
  defaultLayoutDirection?: LayoutDirection
  defaultPipelineVersion?: 'V1' | 'V2'
  debugPanelVisible?: boolean
}>()

const emit = defineEmits<{
  snapshotChange: [snapshot: FlowEditorSnapshot, tabId?: string]
  'request-switch-file': [payload: { filename: string; source: string }]
  'open-debug-panel': [payload?: { nodeId?: string }]
  'close-debug-panel': []
}>()

const {
  nodes, edges, nodeTypes, currentEdgeType, currentSpacing, currentAlgorithm, currentDirection, isDirty, currentFilename, currentSource,
  onValidateConnection,
  handleConnect, handleEdgesChange, handleNodeUpdate, loadNodes, createNodeObject, applyLayout,
  getNodesData, getImageData, clearTempImageData, clearDirty, markDataChanged,
  setNodeStatus, selectNodeById,
  setEdgeJumpBack, layoutChainFromNode,
  imageManager,
  exportState,
  restoreState
} = useFlowGraph()
const nodeTypesObject = nodeTypes as unknown as NodeTypesObject
const { fitView, removeEdges, findNode, screenToFlowCoordinate, viewport, setViewport, onInit, getSelectedNodes, getSelectedEdges } = useVueFlow()
const isFileLoaded = computed<boolean>(() => !!currentFilename.value)

const closeAllDetailsSignal = ref<number>(0)
const isRestoringViewport = ref(false)
const isBulkLoading = ref(false)
const pendingFocusNodeId = ref<string | null>(null)

provide('closeAllDetailsSignal', closeAllDetailsSignal)
provide('currentFilename', currentFilename)
provide('currentDirection', currentDirection)
provide('imageManager', imageManager)

const saveManager = useSaveManager({
  currentEdgeType, currentSpacing, currentAlgorithm, currentDirection,
  currentFilename, currentSource, isDirty,
  exportState, restoreState, getNodesData, getImageData, clearTempImageData, clearDirty,
  imageManager: imageManager as unknown as { setNodeImages: (nodeId: string, images: unknown[]) => void },
  tabId: props.tabId,
  snapshot: props.snapshot,
  defaultEdgeType: props.defaultEdgeType,
  defaultSpacing: props.defaultSpacing,
  defaultLayoutAlgorithm: props.defaultLayoutAlgorithm,
  defaultLayoutDirection: props.defaultLayoutDirection,
  defaultPipelineVersion: props.defaultPipelineVersion
})

provide('pipelineVersion', saveManager.pipelineVersion)

const snapshotState = () => {
  const start = perfNow()
  emit('snapshotChange', saveManager.buildSnapshot({
    x: viewport.value.x || 0,
    y: viewport.value.y || 0,
    zoom: viewport.value.zoom || 1
  }), props.tabId)
  perfLog('FlowEditor.snapshotState', start, { tabId: props.tabId, filename: currentFilename.value })
}

const throttledSnapshot = throttle(snapshotState, 200)

const debugRunner = useDebugRunner({
  findNode,
  nodes,
  currentSource,
  currentFilename,
  onSaveNodes: saveManager.handleSaveNodes,
  onSnapshotState: snapshotState,
  setNodeStatus
})

const editorActions = useEditorActions({
  nodes, edges, currentEdgeType, currentSpacing, currentAlgorithm, currentDirection,
  isFileLoaded, createNodeObject, applyLayout, removeEdges, setEdgeJumpBack,
  layoutChainFromNode, markDataChanged, fitView, screenToFlowCoordinate,
  snapshotState,
  onDebugNode: debugRunner.handleDebugNode,
  onOpenDebugPanel: (payload) => emit('open-debug-panel', payload),
  onCloseDebugPanel: () => emit('close-debug-panel'),
  onIncrementCloseAllDetails: () => { closeAllDetailsSignal.value++ }
})

const { menu, searchVisible, closeMenu, onPaneContextMenu, onNodeContextMenu, onEdgeContextMenu, handleMenuAction } = editorActions
const {
  pipelineVersion: _pipelineVersion, loadedFileVersion, isDeviceConnected: _isDeviceConnected, isFormatDirty: _isFormatDirty, isDirtyCombined,
  showSaveModal, isSavingModal, pendingSwitchConfig, showDeleteImagesModal,
  isProcessingImages, unusedImages, usedImages, pendingSaveConfig: _pendingSaveConfig,
  restoreSnapshotState, applyDefaultSettings, handleLoadImages,
  handleSaveNodes, handleConfirmDeleteImages, handleSkipDeleteImages, handleCancelDeleteImages,
  handleUpdateCanvasConfig, handleUpdatePipelineVersion, handleDeviceConnected, handleBeforeUnload
} = saveManager
const { handleDebugNodeFromPanel, handleUpdateNodeStatus } = debugRunner

const handleNodeUpdateAndSnapshot = (payload: Parameters<typeof handleNodeUpdate>[0]) => {
  handleNodeUpdate(payload)
  snapshotState()
}

provide('updateNode', handleNodeUpdateAndSnapshot)

const handleNodesChange = () => {
  if (isBulkLoading.value) {
    perfMark('FlowEditor.handleNodesChange.skippedDuringBulkLoad', { tabId: props.tabId, filename: currentFilename.value })
    return
  }
  console.log('[DEBUG] handleNodesChange - isFileLoaded:', isFileLoaded.value, 'currentFilename:', currentFilename.value)
  const start = perfNow()
  throttledSnapshot()
  perfLog('FlowEditor.handleNodesChange', start, { tabId: props.tabId, filename: currentFilename.value })
}

const handleMoveEnd = () => {
  if (isBulkLoading.value) return
  if (isRestoringViewport.value) return
  const start = perfNow()
  throttledSnapshot()
  perfLog('FlowEditor.moveEndSnapshot', start, { tabId: props.tabId, zoom: viewport.value.zoom })
}

const hasRestoredSnapshot = ref(false)
const hasAppliedInitialViewport = ref(false)
const isInitialized = ref(false)
const isSameViewport = (next?: { x: number; y: number; zoom: number }) => {
  if (!next) return false
  const threshold = 0.001
  return Math.abs((viewport.value.x || 0) - next.x) < threshold &&
    Math.abs((viewport.value.y || 0) - next.y) < threshold &&
    Math.abs((viewport.value.zoom || 1) - next.zoom) < threshold
}

onInit(async () => {
  isInitialized.value = true
  if (props.snapshot?.flowState) {
    await restoreSnapshotState(props.snapshot)
    hasRestoredSnapshot.value = true
    if (props.snapshot.viewport) {
      isRestoringViewport.value = true
      await nextTick()
      await setViewport({ x: props.snapshot.viewport.x, y: props.snapshot.viewport.y, zoom: props.snapshot.viewport.zoom }, { duration: 0 })
      isRestoringViewport.value = false
    }
  } else {
    applyDefaultSettings()
    await nextTick()
    fitView({ padding: 0.2, duration: 0 })
    snapshotState()
  }
  hasAppliedInitialViewport.value = true
})

let isRestoringExternalSnapshot = false
watch(() => props.snapshot?.flowState?.dataSnapshot, (newSnapshot) => {
  if (!newSnapshot || isRestoringExternalSnapshot) return
  isRestoringExternalSnapshot = true
  restoreSnapshotState(props.snapshot!)
  nextTick(() => { isRestoringExternalSnapshot = false })
})

watch(() => props.snapshot?.flowState?.currentFilename, (newFilename) => {
  if (newFilename && newFilename !== currentFilename.value) {
    isRestoringExternalSnapshot = true
    restoreSnapshotState(props.snapshot!)
    nextTick(() => { isRestoringExternalSnapshot = false })
  }
})

watch(() => props.snapshot?.viewport, async (nextViewport) => {
  if (!nextViewport) return
  if (!hasRestoredSnapshot.value) return
  if (!hasAppliedInitialViewport.value) return
  if (isRestoringExternalSnapshot) return
  if (isSameViewport(nextViewport)) return
  isRestoringViewport.value = true
  await nextTick()
  await setViewport({ x: nextViewport.x, y: nextViewport.y, zoom: nextViewport.zoom }, { duration: 0 })
  isRestoringViewport.value = false
}, { deep: true })

const handleRequestSwitch = (config: { filename: string; source: string; nodeId?: string }) => {
  if (!isDirtyCombined.value) {
    emit('request-switch-file', { filename: config.filename, source: config.source })
    return
  }
  pendingSwitchConfig.value = config
  showSaveModal.value = true
}

const executeSwitch = async (config: { filename: string; source: string; nodeId?: string }) => {
  if (config.nodeId) {
    pendingFocusNodeId.value = config.nodeId
    searchVisible.value = false
  }
  emit('request-switch-file', { filename: config.filename, source: config.source })
}

const handleDiscardChanges = () => {
  showSaveModal.value = false
  if (pendingSwitchConfig.value) {
    executeSwitch(pendingSwitchConfig.value)
    pendingSwitchConfig.value = null
  }
}

const handleSaveAndSwitch = async () => {
  isSavingModal.value = true
  try {
    await handleSaveNodes({ source: currentSource.value, filename: currentFilename.value }, snapshotState)
    showSaveModal.value = false
    if (pendingSwitchConfig.value) {
      executeSwitch(pendingSwitchConfig.value)
      pendingSwitchConfig.value = null
    }
  } catch (e) {
    console.error('Save failed in modal', e)
  } finally {
    isSavingModal.value = false
  }
}

const handleCancelSwitch = () => { showSaveModal.value = false; pendingSwitchConfig.value = null }

onMounted(() => {
  window.addEventListener('beforeunload', handleBeforeUnload)
  window.addEventListener('keydown', handleKeyDown)
})
onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload)
  window.removeEventListener('keydown', handleKeyDown)
})

const handleKeyDown = (e: KeyboardEvent) => {
  const isMod = e.ctrlKey || e.metaKey

  if (isMod && e.key === 's') {
    e.preventDefault()
    if (isFileLoaded.value && currentFilename.value) {
      handleSaveNodes({ source: currentSource.value, filename: currentFilename.value }, snapshotState)
        .then(() => ElMessage.success('保存成功'))
        .catch(() => ElMessage.error('保存失败'))
    }
    return
  }

  if (e.key === 'Delete' || e.key === 'Backspace') {
    const target = e.target as HTMLElement
    if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
      e.preventDefault()
      const selectedNodes = getSelectedNodes.value
      const selectedEdges = getSelectedEdges.value
      if (selectedNodes.length > 0) {
        selectedNodes.forEach((node: FlowNode) => {
          const edgeIds = edges.value.filter((e: FlowEdge) => e.source === node.id || e.target === node.id).map((e: FlowEdge) => e.id)
          removeEdges(edgeIds)
        })
        nodes.value = nodes.value.filter((n: FlowNode) => !selectedNodes.find((sn: FlowNode) => sn.id === n.id))
        markDataChanged()
        snapshotState()
      } else if (selectedEdges.length > 0) {
        removeEdges(selectedEdges.map((e: FlowEdge) => e.id))
        markDataChanged()
        snapshotState()
      }
    }
    return
  }

  if (isMod && e.key === 'z' && !e.shiftKey) {
    e.preventDefault()
    ElMessage.info('撤销功能暂不支持')
    return
  }

  if ((isMod && e.key === 'y') || (isMod && e.shiftKey && e.key === 'z')) {
    e.preventDefault()
    ElMessage.info('重做功能暂不支持')
    return
  }

  if (e.key === 'Escape') {
    searchVisible.value = false
    showSaveModal.value = false
    showDeleteImagesModal.value = false
    closeMenu()
  }
}

const handleLocateNode = (nodeId: string) => {
  selectNodeById(nodeId)
  setTimeout(() => fitView({ nodes: [nodeId], padding: 0.5, maxZoom: 1.5, minZoom: 0.8, duration: 600 }), 50)
}

const handleLoadNodesWrapper = async (payload: LoadNodesPayload) => {
  const start = perfNow()
  perfMark('FlowEditor.handleLoadNodesWrapper.start', {
    tabId: props.tabId,
    filename: payload.filename,
    nodeCount: Object.keys(payload.nodes).length
  })
  isBulkLoading.value = true
  try {
    await loadNodes(payload)
    perfLog('FlowEditor.loadNodes', start, { tabId: props.tabId, filename: payload.filename })
    loadedFileVersion.value = payload.fileVersion ?? 'V1'
    if (pendingFocusNodeId.value) {
      const targetId = pendingFocusNodeId.value
      setTimeout(() => { handleLocateNode(targetId); pendingFocusNodeId.value = null }, 300)
    }
  } finally {
    isBulkLoading.value = false
  }
  snapshotState()
  perfLog('FlowEditor.handleLoadNodesWrapper.total', start, { tabId: props.tabId, filename: payload.filename })
}

defineExpose({
  snapshotState,
  getSnapshot: () => saveManager.buildSnapshot({ x: viewport.value.x || 0, y: viewport.value.y || 0, zoom: viewport.value.zoom || 1 }),
  handleLoadNodesWrapper,
  handleLoadImages,
  handleSaveNodes: (config: { source: string; filename: string }) => handleSaveNodes(config, snapshotState),
  handleDeviceConnected: (val: boolean) => handleDeviceConnected(val, snapshotState),
  handleUpdateCanvasConfig: (config: Parameters<typeof handleUpdateCanvasConfig>[0]) => handleUpdateCanvasConfig(config, snapshotState),
  handleUpdatePipelineVersion: (val: 'V1' | 'V2') => handleUpdatePipelineVersion(val, snapshotState),
  handleRequestSwitch,
  handleLocateNode,
  handleDebugNodeFromPanel,
  handleUpdateNodeStatus
})
</script>

<template>
  <div class="w-full h-full min-h-[500px] bg-slate-50 relative">
    <VueFlow
      v-model:nodes="nodes"
      v-model:edges="edges"
      :node-types="nodeTypesObject"
      :default-zoom="1"
      :min-zoom="0.1"
      :max-zoom="4"
      :only-render-visible-elements="true"
      :is-valid-connection="onValidateConnection"
      :nodes-draggable="isFileLoaded"
      :nodes-connectable="isFileLoaded"
      :elements-selectable="isFileLoaded"
      :pan-on-drag="true"
      @connect="(params) => { handleConnect(params); throttledSnapshot() }"
      @edges-change="(changes) => { handleEdgesChange(changes); throttledSnapshot() }"
      @nodes-change="handleNodesChange"
      @node-drag-stop="(e) => { console.log('[DEBUG] node-drag-stop event:', e); handleNodesChange() }"
      @node-drag="(e) => console.log('[DEBUG] node-drag event:', e)"
      @pane-context-menu="onPaneContextMenu"
      @node-context-menu="onNodeContextMenu"
      @edge-context-menu="onEdgeContextMenu"
      @pane-click="closeMenu"
      @node-click="closeMenu"
      @edge-click="closeMenu"
      @move-start="closeMenu"
      @move-end="handleMoveEnd"
    >
      <Background
        pattern-color="#cbd5e1"
        :gap="20"
      />
      <Controls />
      <div
        v-if="!isFileLoaded"
        class="absolute inset-0 z-10 bg-slate-100/60 backdrop-blur-[2px] flex items-center justify-center pointer-events-none transition-all"
      >
        <div class="flex flex-col items-center gap-4 p-8 bg-white/80 border border-slate-200 rounded-2xl shadow-xl">
          <div class="p-4 bg-indigo-50 rounded-full">
            <FolderSearch class="w-12 h-12 text-indigo-400" />
          </div>
          <div class="text-center space-y-1">
            <h3 class="text-lg font-bold text-slate-700">
              未加载资源文件
            </h3>
            <p class="text-sm text-slate-500">
              请在右上角控制台选择并加载资源文件以开始编辑
            </p>
          </div>
        </div>
      </div>
      <ContextMenu
        v-if="menu.visible"
        v-bind="menu"
        :current-edge-type="currentEdgeType"
        :current-spacing="currentSpacing"
        :current-algorithm="currentAlgorithm"
        :current-direction="currentDirection"
        :debug-panel-visible="props.debugPanelVisible"
        :search-visible="searchVisible"
        @close="closeMenu"
        @action="handleMenuAction"
      />
    </VueFlow>
    <NodeSearch
      :visible="searchVisible"
      :nodes="nodes"
      :current-filename="currentFilename"
      :current-source="currentSource"
      @close="searchVisible = false"
      @locate-node="handleLocateNode"
      @switch-file="handleRequestSwitch"
    />
    <SaveConfirmModal
      :visible="showSaveModal"
      :filename="currentFilename"
      :is-saving="isSavingModal"
      @cancel="handleCancelSwitch"
      @discard="handleDiscardChanges"
      @save="handleSaveAndSwitch"
    />
    <DeleteImagesConfirmModal
      :visible="showDeleteImagesModal"
      :unused-images="unusedImages"
      :used-images="usedImages"
      :is-processing="isProcessingImages"
      @cancel="handleCancelDeleteImages"
      @confirm="() => handleConfirmDeleteImages(snapshotState)"
      @skip="() => handleSkipDeleteImages(snapshotState)"
    />
  </div>
</template>

<style>
@import '@vue-flow/core/dist/style.css';
@import '@vue-flow/controls/dist/style.css';
.vue-flow__panel { pointer-events: none; }
</style>
