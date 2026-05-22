<script setup lang="ts">
import { ref, provide, onMounted, onBeforeUnmount, computed, defineAsyncComponent, watch, nextTick } from 'vue'
import { VueFlow, useVueFlow, type EdgeMouseEvent, type NodeMouseEvent, type NodeTypesObject } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { FolderSearch } from 'lucide-vue-next'
import ContextMenu from './Flow/ContextMenu.vue'
import { useFlowGraph } from '../utils/useFlowGraph'
import { toPipelineV2Nodes } from '../utils/pipelineTransform'
import { debugApi, resourceApi } from '../services/api'
import type { FlowEditorSnapshot } from '../utils/flowWorkspaceTypes'
import type { FlowNode, FlowEdge, FlowBusinessData, SpacingKey, LayoutAlgorithm, LayoutDirection, TemplateImage, MenuType, NodeStatus, UsedImageInfo, LoadNodesPayload } from '../utils/flowTypes'
import type { EdgeType } from '../utils/flowOptions'
import { perfLog, perfMark, perfNow } from '../utils/perfTrace'

const NodeSearch = defineAsyncComponent(() => import('./Flow/NodeSearch.vue'))
const SaveConfirmModal = defineAsyncComponent(() => import('./Flow/Modals/SaveConfirmModal.vue'))
const DeleteImagesConfirmModal = defineAsyncComponent(() => import('./Flow/Modals/DeleteImagesConfirmModal.vue'))

type DebugMode = 'standard' | 'recognition_only'
type MenuData = FlowNode | FlowEdge | null

interface MenuState {
  visible: boolean
  x: number
  y: number
  type: MenuType
  data: MenuData
  flowPos: { x: number; y: number } | null
}

interface EditorState {
  visible: boolean
  nodeId: string
  nodeData: FlowBusinessData | null
}

interface PendingSwitchConfig {
  filename: string
  source: string
  nodeId?: string
}

interface PendingSaveConfig {
  source: string
  filename: string
}

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
const { fitView, removeEdges, findNode, screenToFlowCoordinate, viewport, setViewport, onInit } = useVueFlow()
const isFileLoaded = computed<boolean>(() => !!currentFilename.value)

const closeAllDetailsSignal = ref<number>(0)
const pipelineVersion = ref<'V1' | 'V2'>('V1')
provide('closeAllDetailsSignal', closeAllDetailsSignal)
provide('currentFilename', currentFilename)
provide('currentDirection', currentDirection)
provide('imageManager', imageManager)
provide('pipelineVersion', pipelineVersion)
const loadedFileVersion = ref<'V1' | 'V2' | ''>('')
const isFormatDirty = computed(() => !!loadedFileVersion.value && pipelineVersion.value !== loadedFileVersion.value)
const isDirtyCombined = computed(() => isDirty.value || isFormatDirty.value)

const isDeviceConnected = ref<boolean>(false)
const menu = ref<MenuState>({ visible: false, x: 0, y: 0, type: 'pane', data: null, flowPos: { x: 0, y: 0 } })
const editor = ref<EditorState>({ visible: false, nodeId: '', nodeData: null })
const searchVisible = ref<boolean>(false)

const pendingFocusNodeId = ref<string | null>(null)
const showSaveModal = ref<boolean>(false)
const isSavingModal = ref<boolean>(false)
const pendingSwitchConfig = ref<PendingSwitchConfig | null>(null)
const showDeleteImagesModal = ref<boolean>(false)
const isProcessingImages = ref<boolean>(false)
const unusedImages = ref<string[]>([])
const usedImages = ref<UsedImageInfo[]>([])
const pendingSaveConfig = ref<PendingSaveConfig | null>(null)
const isRestoringViewport = ref(false)
const isBulkLoading = ref(false)

const buildSnapshot = (): FlowEditorSnapshot => {
  const start = perfNow()
  const snapshot: FlowEditorSnapshot = {
      flowState: exportState(),
      pipelineVersion: pipelineVersion.value,
      loadedFileVersion: loadedFileVersion.value,
      isDeviceConnected: isDeviceConnected.value,
      viewport: {
        x: viewport.value.x || 0,
        y: viewport.value.y || 0,
        zoom: viewport.value.zoom || 1
      },
      selectedResourceFile: currentFilename.value ? `${currentSource.value}|${currentFilename.value}` : ''
  }
  perfLog('FlowEditor.buildSnapshot', start, {
    tabId: props.tabId,
    filename: snapshot.flowState?.currentFilename,
    nodeCount: snapshot.flowState?.nodes?.length || 0,
    edgeCount: snapshot.flowState?.edges?.length || 0
  })
  return snapshot
}

const snapshotState = () => {
  const start = perfNow()
  emit('snapshotChange', buildSnapshot(), props.tabId)
  perfLog('FlowEditor.snapshotState', start, { tabId: props.tabId, filename: currentFilename.value })
}

const restoreSnapshotState = async () => {
  if (!props.snapshot?.flowState) return
  const start = perfNow()
  restoreState(props.snapshot.flowState)
  pipelineVersion.value = props.snapshot.pipelineVersion || 'V1'
  loadedFileVersion.value = props.snapshot.loadedFileVersion || ''
  isDeviceConnected.value = !!props.snapshot.isDeviceConnected

  const hasImageState = props.snapshot.flowState.imageState?.nodeImageStates?.length
  const source = props.snapshot.flowState.currentSource
  const filename = props.snapshot.flowState.currentFilename
  if (!hasImageState && source && filename) {
    console.log('[DEBUG restoreSnapshotState] imageState empty, reloading images for', source, filename)
    try {
      const imgRes = await resourceApi.getTemplateImages(source, filename)
      if (imgRes.results) {
        handleLoadImages(imgRes.results as Record<string, unknown>)
      }
    } catch (e) {
      console.warn('[DEBUG restoreSnapshotState] failed to reload images', e)
    }
  }

  perfLog('FlowEditor.restoreSnapshotState', start, {
    tabId: props.tabId,
    filename: props.snapshot.flowState.currentFilename,
    nodeCount: props.snapshot.flowState.nodes?.length || 0
  })
}

const applyDefaultSettings = () => {
  currentEdgeType.value = props.snapshot?.defaultFlowConfig?.edgeType || props.defaultEdgeType || 'smoothstep'
  currentSpacing.value = props.snapshot?.defaultFlowConfig?.spacing || props.defaultSpacing || 'normal'
  currentAlgorithm.value = props.snapshot?.defaultFlowConfig?.layoutAlgorithm || props.defaultLayoutAlgorithm || 'layered'
  currentDirection.value = props.snapshot?.defaultFlowConfig?.layoutDirection || props.defaultLayoutDirection || 'TB'
  pipelineVersion.value = props.snapshot?.pipelineVersion || props.defaultPipelineVersion || 'V1'
  loadedFileVersion.value = ''
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
    await restoreSnapshotState()
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
  const start = perfNow()
  snapshotState()
  perfLog('FlowEditor.handleNodesChange', start, { tabId: props.tabId, filename: currentFilename.value })
}

const handleMoveEnd = () => {
  if (isBulkLoading.value) return
  if (isRestoringViewport.value) return
  const start = perfNow()
  snapshotState()
  perfLog('FlowEditor.moveEndSnapshot', start, { tabId: props.tabId, zoom: viewport.value.zoom })
}

// Watch for external snapshot changes (e.g., when workspace restores state)
let isRestoringExternalSnapshot = false
watch(() => props.snapshot, async (newSnapshot, oldSnapshot) => {
  // Skip initial setup and self-triggered changes
  if (!isInitialized.value) return
  if (!newSnapshot?.flowState) return
  if (oldSnapshot === newSnapshot) return
  
  // Check if this is an external snapshot restore (not from this editor's own snapshotState)
  const isNewFileLoaded = newSnapshot.flowState.currentFilename && 
    newSnapshot.flowState.currentFilename !== currentFilename.value
  const isExternalUpdate = isNewFileLoaded || 
    (newSnapshot.flowState.dataSnapshot !== oldSnapshot?.flowState?.dataSnapshot)
  
  if (!isExternalUpdate) return
  
  // Restore the external snapshot
  isRestoringExternalSnapshot = true
  isRestoringViewport.value = true
  await restoreSnapshotState()
  hasRestoredSnapshot.value = true
  
  if (newSnapshot.viewport) {
    await nextTick()
    await setViewport({ 
      x: newSnapshot.viewport.x, 
      y: newSnapshot.viewport.y, 
      zoom: newSnapshot.viewport.zoom 
    }, { duration: 0 })
  }
  
  isRestoringViewport.value = false
  isRestoringExternalSnapshot = false
}, { deep: true })

watch(() => props.snapshot?.viewport, async (nextViewport) => {
  if (!nextViewport) return
  if (!hasRestoredSnapshot.value) return
  if (!hasAppliedInitialViewport.value) return
  if (isRestoringExternalSnapshot) return // Skip if already handled above
  if (isSameViewport(nextViewport)) return
  isRestoringViewport.value = true
  await nextTick()
  await setViewport({ x: nextViewport.x, y: nextViewport.y, zoom: nextViewport.zoom }, { duration: 0 })
  isRestoringViewport.value = false
}, { deep: true })

const handleUpdatePipelineVersion = (val: 'V1' | 'V2') => {
  pipelineVersion.value = val
  snapshotState()
}

const handleRequestSwitch = (config: PendingSwitchConfig) => {
  if (!isDirtyCombined.value) {
    emit('request-switch-file', { filename: config.filename, source: config.source })
    return
  }
  pendingSwitchConfig.value = config
  showSaveModal.value = true
}

const executeSwitch = async (config: PendingSwitchConfig) => {
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
    await handleSaveNodes({ source: currentSource.value, filename: currentFilename.value })
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
const handleDeviceConnected = (val: boolean) => { isDeviceConnected.value = val; snapshotState() }

const handleBeforeUnload = (e: BeforeUnloadEvent) => {
  if (isDirtyCombined.value) { e.preventDefault(); e.returnValue = ''; return '' }
}
onMounted(() => window.addEventListener('beforeunload', handleBeforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', handleBeforeUnload))

const closeMenu = () => menu.value.visible = false
const getEvent = (params: MouseEvent | NodeMouseEvent | EdgeMouseEvent | { event: MouseEvent }) => (params as any).event || params
const onPaneContextMenu = (params: MouseEvent) => {
  if (!isFileLoaded.value) return
  const event = getEvent(params)
  event.preventDefault()
  menu.value = { visible: true, x: event.clientX, y: event.clientY, type: 'pane', data: null, flowPos: screenToFlowCoordinate({ x: event.clientX, y: event.clientY }) }
}
const onNodeContextMenu = (params: NodeMouseEvent) => {
  const event = getEvent(params); event.preventDefault()
  menu.value = { visible: true, x: event.clientX, y: event.clientY, type: 'node', data: params.node, flowPos: null }
}
const onEdgeContextMenu = (params: EdgeMouseEvent) => {
  const event = getEvent(params); event.preventDefault()
  menu.value = { visible: true, x: event.clientX, y: event.clientY, type: 'edge', data: params.edge, flowPos: null }
}

type MenuAction = {
  action: string
  type: MenuType
  data: FlowNode | FlowEdge | null
  payload?: string | EdgeType | SpacingKey | LayoutAlgorithm | LayoutDirection | null
}

const handleMenuAction = ({ action, type, data, payload }: MenuAction) => {
  closeMenu()
  switch (action) {
    case 'add': {
      const recognition = typeof payload === 'string' ? payload : undefined
      const newId = `N-${Date.now()}`
      const newNode = createNodeObject(newId, { id: newId, recognition: recognition || 'DirectHit' })
      if (menu.value.flowPos) newNode.position = { ...menu.value.flowPos }
      nodes.value = [...nodes.value, newNode]
      markDataChanged()
      break
    }
    case 'add_anchor': {
      const anchorId = `A-${Date.now()}`
      const anchorNode = createNodeObject(anchorId, { id: anchorId, recognition: 'Anchor', anchor: true })
      if (menu.value.flowPos) anchorNode.position = { ...menu.value.flowPos }
      anchorNode.data = { ...(anchorNode.data || {}), type: 'Anchor', id: anchorId }
      nodes.value = [...nodes.value, anchorNode]
      markDataChanged()
      break
    }
    case 'debug_this_node':
      if (type === 'node' && isFlowNodeData(data) && data.id) handleDebugNode(String(data.id), 'standard')
      break
    case 'debug_this_node_reco':
      if (type === 'node' && isFlowNodeData(data) && data.id) handleDebugNode(String(data.id), 'recognition_only')
      break
    case 'debug_in_panel':
      if (type === 'node' && isFlowNodeData(data) && data.id) emit('open-debug-panel', { nodeId: String(data.id) })
      break
    case 'edit':
      if (type === 'node' && isFlowNodeData(data)) {
        const fallback = { id: data.id, recognition: 'DirectHit' }
        editor.value = { visible: true, nodeId: String(data.id || ''), nodeData: JSON.parse(JSON.stringify(data.data?.data || fallback)) }
      }
      break
    case 'duplicate':
      if (type === 'node' && isFlowNodeData(data) && data.data?.data && data.position) {
        const copyId = `N-${Date.now()}`
        const sourceData = data.data.data
        const sourceMeta = data.data
        const copyData: FlowBusinessData = { ...JSON.parse(JSON.stringify(sourceData)), id: copyId }
        delete copyData.next
        delete copyData.on_error
        const copyNode = createNodeObject(copyId, copyData)
        if (sourceMeta._images?.length && copyNode.data) {
          copyNode.data._images = JSON.parse(JSON.stringify(sourceMeta._images))
        }
        copyNode.position = { x: data.position.x + 50, y: data.position.y + 50 }
        nodes.value = [...nodes.value, copyNode]
        markDataChanged()
      }
      break
    case 'delete':
      if (type === 'node' && data?.id) {
        removeEdges(edges.value.filter(e => e.source === data.id || e.target === data.id))
        nodes.value = nodes.value.filter(n => n.id !== data.id)
        markDataChanged()
      } else if (type === 'edge' && data?.id) {
        removeEdges([data.id])
        markDataChanged()
      }
      break
    case 'setJumpBack':
      if (type === 'edge' && data?.id) setEdgeJumpBack(data.id, true)
      break
    case 'setNormalLink':
      if (type === 'edge' && data?.id) setEdgeJumpBack(data.id, false)
      break
    case 'layout_chain':
      if (type === 'node' && isFlowNodeData(data) && data.id) layoutChainFromNode(data.id, currentSpacing.value)
      break
    case 'layout':
      applyLayout()
      break
    case 'changeAlgorithm':
      if (isLayoutAlgorithm(payload)) { currentAlgorithm.value = payload; applyLayout({ algorithm: payload }) }
      break
    case 'changeDirection':
      if (isLayoutDirection(payload)) { currentDirection.value = payload; applyLayout({ direction: payload }) }
      break
    case 'changeSpacing':
      if (isSpacingKey(payload)) { currentSpacing.value = payload; applyLayout({ spacing: payload }) }
      break
    case 'changeEdgeType':
      if (isEdgeType(payload)) { currentEdgeType.value = payload; edges.value = edges.value.map(e => ({ ...e, type: payload })) }
      break
    case 'reset':
      fitView({ padding: 0.2, duration: 500 })
      break
    case 'clear':
      nodes.value = []
      edges.value = []
      break
    case 'search':
      searchVisible.value = true
      break
    case 'closeSearch':
      searchVisible.value = false
      break
    case 'openDebugPanel':
      emit('open-debug-panel', { nodeId: type === 'node' && isFlowNodeData(data) ? String(data.id) : '' })
      break
    case 'closeDebugPanel':
      emit('close-debug-panel')
      break
    case 'closeAllDetails':
      closeAllDetailsSignal.value++
      break
  }
  snapshotState()
}

const handleDebugNode = async (nodeId: string, mode: DebugMode = 'standard') => {
  const node = findNode(nodeId)
  if (!node) return
  node.data._result = null

  try {
    await handleSaveNodes({ source: currentSource.value, filename: currentFilename.value })
    await debugApi.runNode({
      node: node.data.data,
      debug_mode: mode,
      context: { source: currentSource.value, filename: currentFilename.value }
    }, {
      context: { feature: 'debug', action: 'run_node', component: 'FlowEditor' }
    })
  } catch (error: unknown) {
    const err = error as { message?: string }
    console.error('Debug failed:', error)
    node.data._result = { success: false, error: err?.message || 'Network/Server Error' }
  } finally {
    nodes.value = [...nodes.value]
    snapshotState()
  }
}

const handleUpdateNodeStatus = ({ nodeId, status }: { nodeId: string; status: NodeStatus }) => {
  if (!nodeId || status === undefined) return
  setNodeStatus(nodeId, status)
  snapshotState()
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

const isTemplateImageArray = (value: unknown): value is TemplateImage[] => Array.isArray(value) && value.every(item => typeof item === 'object' && !!item && 'path' in item)
const isFlowNodeData = (value: MenuData): value is FlowNode => !!value && 'position' in value
const isUsedImageInfoArray = (value: unknown): value is UsedImageInfo[] => Array.isArray(value) && value.every(item => typeof item === 'object' && !!item && 'path' in item && 'used_by' in item)
const isEdgeType = (value: unknown): value is EdgeType => value === 'smoothstep' || value === 'default'
const isSpacingKey = (value: unknown): value is SpacingKey => value === 'very-compact' || value === 'compact' || value === 'normal' || value === 'loose' || value === 'extra-loose'
const isLayoutAlgorithm = (value: unknown): value is LayoutAlgorithm => value === 'layered' || value === 'stress' || value === 'mrtree'
const isLayoutDirection = (value: unknown): value is LayoutDirection => value === 'TB' || value === 'LR'

const handleLoadImages = (imageDataMap: Record<string, unknown>, _basePath?: string) => {
  if (!imageDataMap) return
  const start = perfNow()
  isBulkLoading.value = true
  try {
    const entries = Object.entries(imageDataMap)
    console.log('[DEBUG handleLoadImages] entries count:', entries.length)
    for (const [nodeId, images] of entries) {
      if (isTemplateImageArray(images)) {
        console.log('[DEBUG handleLoadImages] setting nodeId:', nodeId, 'images count:', images.length, 'first:', images[0])
        imageManager.setNodeImages(nodeId, images)
      } else {
        console.log('[DEBUG handleLoadImages] NOT TemplateImageArray for nodeId:', nodeId, 'value:', images)
      }
    }
  } finally {
    isBulkLoading.value = false
  }
  snapshotState()
  perfLog('FlowEditor.handleLoadImages', start, {
    tabId: props.tabId,
    imageEntryCount: Object.keys(imageDataMap).length
  })
}

const handleUpdateCanvasConfig = ({
  edgeType,
  spacing,
  layoutAlgorithm,
  layoutDirection
}: {
  edgeType?: string
  spacing?: string
  layoutAlgorithm?: string
  layoutDirection?: string
}) => {
  const nextEdgeType = isEdgeType(edgeType) ? edgeType : undefined
  const nextSpacing = isSpacingKey(spacing) ? spacing : undefined
  const nextAlgorithm = isLayoutAlgorithm(layoutAlgorithm) ? layoutAlgorithm : undefined
  const nextDirection = isLayoutDirection(layoutDirection) ? layoutDirection : undefined
  if (nextEdgeType && nextEdgeType !== currentEdgeType.value) {
    currentEdgeType.value = nextEdgeType
    edges.value = edges.value.map(edge => ({ ...edge, type: nextEdgeType }))
  }
  if (nextSpacing && nextSpacing !== currentSpacing.value) currentSpacing.value = nextSpacing
  if (nextAlgorithm && nextAlgorithm !== currentAlgorithm.value) currentAlgorithm.value = nextAlgorithm
  if (nextDirection && nextDirection !== currentDirection.value) currentDirection.value = nextDirection
  snapshotState()
}

const handleSaveNodes = async ({ source, filename }: { source: string; filename: string }) => {
  try {
    const { delImages, tempImages } = getImageData()
    if (delImages.length > 0 || tempImages.length > 0) {
      pendingSaveConfig.value = { source, filename }
      if (delImages.length > 0) {
        const checkRes = await resourceApi.checkUnusedImages(source, filename, delImages, { context: { feature: 'resource', action: 'check_unused_images', component: 'FlowEditor' } })
        unusedImages.value = checkRes.unused_images || []
        usedImages.value = isUsedImageInfoArray(checkRes.used_images) ? checkRes.used_images : []
        if (unusedImages.value.length > 0) { showDeleteImagesModal.value = true; return }
      }
      await processImagesAndSave(source, filename, [], tempImages)
    } else {
      await saveNodesOnly(source, filename)
    }
  } catch (e: unknown) {
    console.error('[FlowEditor] 保存失败:', e)
    throw e
  }
}

const processImagesAndSave = async (source: string, filename: string, deletePaths: string[], tempImages: { path: string; base64: string; nodeId?: string }[]) => {
  try {
    if (deletePaths.length > 0 || tempImages.length > 0) {
      await resourceApi.processImages(source, deletePaths, tempImages, { context: { feature: 'resource', action: 'process_images', component: 'FlowEditor' } })
    }
    clearTempImageData()
    await saveNodesOnly(source, filename)
  } catch (e: unknown) {
    console.error('[FlowEditor] 图片处理失败:', e)
    throw e
  }
}

const saveNodesOnly = async (source: string, filename: string) => {
  const rawNodes = getNodesData()
  const payload = pipelineVersion.value === 'V2' ? toPipelineV2Nodes(rawNodes) : rawNodes
  const res = await resourceApi.saveFileNodes(source, filename, payload, { context: { feature: 'resource', action: 'save_nodes', component: 'FlowEditor' } })
  if (res.success) {
    clearDirty()
    loadedFileVersion.value = pipelineVersion.value
    snapshotState()
  }
}

const handleConfirmDeleteImages = async () => {
  if (!pendingSaveConfig.value) return
  isProcessingImages.value = true
  try {
    await processImagesAndSave(pendingSaveConfig.value.source, pendingSaveConfig.value.filename, unusedImages.value, getImageData().tempImages)
    showDeleteImagesModal.value = false
    pendingSaveConfig.value = null
  } catch (e: unknown) {
    const err = e as { message?: string }
    alert('保存失败: ' + (err?.message || '未知错误'))
  } finally {
    isProcessingImages.value = false
  }
}

const handleSkipDeleteImages = async () => {
  if (!pendingSaveConfig.value) return
  isProcessingImages.value = true
  try {
    await processImagesAndSave(pendingSaveConfig.value.source, pendingSaveConfig.value.filename, [], getImageData().tempImages)
    showDeleteImagesModal.value = false
    pendingSaveConfig.value = null
  } catch (e: unknown) {
    const err = e as { message?: string }
    alert('保存失败: ' + (err?.message || '未知错误'))
  } finally {
    isProcessingImages.value = false
  }
}

const handleCancelDeleteImages = () => { showDeleteImagesModal.value = false; pendingSaveConfig.value = null }
const handleDebugNodeFromPanel = (nodeId: string) => handleDebugNode(nodeId, 'standard')

defineExpose({
  snapshotState,
  getSnapshot: buildSnapshot,
  handleLoadNodesWrapper,
  handleLoadImages,
  handleSaveNodes,
  handleDeviceConnected,
  handleUpdateCanvasConfig,
  handleUpdatePipelineVersion,
  handleRequestSwitch,
  handleLocateNode,
  handleDebugNodeFromPanel,
  handleUpdateNodeStatus
})
</script>

<template>
  <div class="w-full h-full min-h-[500px] bg-slate-50 relative">
    <VueFlow
      v-model:nodes="nodes" v-model:edges="edges" :node-types="nodeTypesObject"
      :default-zoom="1" :min-zoom="0.1" :max-zoom="4"
      :only-render-visible-elements="true"
      :is-valid-connection="onValidateConnection"
      :nodes-draggable="isFileLoaded" :nodes-connectable="isFileLoaded" :elements-selectable="isFileLoaded"
      @connect="(params) => { handleConnect(params); snapshotState() }" @edges-change="(changes) => { handleEdgesChange(changes); snapshotState() }"
      @nodes-change="handleNodesChange"
      @pane-context-menu="onPaneContextMenu" @node-context-menu="onNodeContextMenu" @edge-context-menu="onEdgeContextMenu"
      @pane-click="closeMenu" @node-click="closeMenu" @edge-click="closeMenu" @move-start="closeMenu" @move-end="handleMoveEnd"
    >
      <Background pattern-color="#cbd5e1" :gap="20" />
      <Controls />
      <div v-if="!isFileLoaded" class="absolute inset-0 z-10 bg-slate-100/60 backdrop-blur-[2px] flex items-center justify-center pointer-events-none transition-all">
        <div class="flex flex-col items-center gap-4 p-8 bg-white/80 border border-slate-200 rounded-2xl shadow-xl">
          <div class="p-4 bg-indigo-50 rounded-full"><FolderSearch class="w-12 h-12 text-indigo-400" /></div>
          <div class="text-center space-y-1">
            <h3 class="text-lg font-bold text-slate-700">未加载资源文件</h3>
            <p class="text-sm text-slate-500">请在右上角控制台选择并加载资源文件以开始编辑</p>
          </div>
        </div>
      </div>
      <ContextMenu
        v-if="menu.visible"
        v-bind="menu"
        :currentEdgeType="currentEdgeType"
        :currentSpacing="currentSpacing"
        :currentAlgorithm="currentAlgorithm"
        :currentDirection="currentDirection"
        :debug-panel-visible="props.debugPanelVisible"
        :search-visible="searchVisible"
        @close="closeMenu"
        @action="handleMenuAction"
      />
    </VueFlow>
    <NodeSearch :visible="searchVisible" :nodes="nodes" :current-filename="currentFilename" :current-source="currentSource" @close="searchVisible = false" @locate-node="handleLocateNode" @switch-file="handleRequestSwitch" />
    <SaveConfirmModal :visible="showSaveModal" :filename="currentFilename" :is-saving="isSavingModal" @cancel="handleCancelSwitch" @discard="handleDiscardChanges" @save="handleSaveAndSwitch" />
    <DeleteImagesConfirmModal :visible="showDeleteImagesModal" :unused-images="unusedImages" :used-images="usedImages" :is-processing="isProcessingImages" @cancel="handleCancelDeleteImages" @confirm="handleConfirmDeleteImages" @skip="handleSkipDeleteImages" />
  </div>
</template>

<style>
@import '@vue-flow/core/dist/style.css';
@import '@vue-flow/controls/dist/style.css';
.vue-flow__panel { pointer-events: none; }
</style>
