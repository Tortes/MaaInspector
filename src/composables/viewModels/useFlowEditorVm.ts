import { computed, nextTick, onBeforeUnmount, onMounted, provide, ref } from 'vue'
import { useVueFlow, type NodeTypesObject } from '@vue-flow/core'
import { ElMessage } from 'element-plus'
import { useFlowGraph } from '@/composables/useFlowGraph'
import { useEditorActions } from '@/composables/useEditorActions'
import { useSaveManager } from '@/composables/useSaveManager'
import { useDebugRunner } from '@/composables/useDebugRunner'
import { resourceApi } from '@/services/api'
import { parseFileId } from '@/utils/fileId'
import type { FlowEdge, FlowNode, LoadNodesPayload, TemplateImage } from '@/utils/flowTypes'
import { isPipelineV2Nodes, toPipelineV1Nodes } from '@/utils/pipelineTransform'
import { perfLog, perfMark, perfNow } from '@/utils/perfTrace'
import type { FlowEditorPort } from './types'

interface UseFlowEditorVmOptions {
  tabId?: string
  emit: {
    (e: 'request-switch-file', payload: { filename: string; source: string }): void
    (e: 'open-debug-panel', payload?: { nodeId?: string }): void
    (e: 'close-debug-panel'): void
  }
}

export function useFlowEditorVm(options: UseFlowEditorVmOptions) {
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
  const { fitView, removeEdges, findNode, screenToFlowCoordinate, getSelectedNodes, getSelectedEdges } = useVueFlow()
  const isFileLoaded = computed<boolean>(() => !!currentFilename.value)

  const closeAllDetailsSignal = ref<number>(0)
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
    imageManager: imageManager as unknown as {
      setNodeImages: (nodeId: string, images: TemplateImage[]) => void
      replaceLoadedImages: (imageMap: Record<string, TemplateImage[] | unknown>) => void
    },
    tabId: options.tabId
  })

  provide('pipelineVersion', saveManager.loadedFileVersion)

  const debugRunner = useDebugRunner({
    findNode,
    nodes,
    currentSource,
    currentFilename,
    onSaveNodes: saveManager.handleSaveNodes,
    onSnapshotState: () => {},
    setNodeStatus
  })

  const editorActions = useEditorActions({
    nodes, edges, currentEdgeType, currentSpacing, currentAlgorithm, currentDirection,
    isFileLoaded, createNodeObject, applyLayout, removeEdges, setEdgeJumpBack,
    layoutChainFromNode, markDataChanged, fitView, screenToFlowCoordinate,
    snapshotState: () => {},
    onDebugNode: debugRunner.handleDebugNode,
    onOpenDebugPanel: (payload) => options.emit('open-debug-panel', payload),
    onCloseDebugPanel: () => options.emit('close-debug-panel'),
    onIncrementCloseAllDetails: () => { closeAllDetailsSignal.value++ }
  })

  const { menu, searchVisible, closeMenu, onPaneContextMenu, onNodeContextMenu, onEdgeContextMenu, handleMenuAction } = editorActions
  const {
    loadedFileVersion, isDirtyCombined,
    showSaveModal, isSavingModal, pendingSwitchConfig, showDeleteImagesModal,
    isProcessingImages, unusedImages, usedImages,
    handleLoadImages,
    handleSaveNodes, handleConfirmDeleteImages, handleSkipDeleteImages, handleCancelDeleteImages,
    handleUpdateCanvasConfig, handleUpdatePipelineVersion, handleDeviceConnected, handleBeforeUnload
  } = saveManager
  const { handleDebugNodeFromPanel, handleUpdateNodeStatus } = debugRunner

  const handleNodeUpdateAndSnapshot = (payload: Parameters<typeof handleNodeUpdate>[0]) => {
    handleNodeUpdate(payload)
  }

  provide('updateNode', handleNodeUpdateAndSnapshot)

  const handleNodesChange = () => {
    if (isBulkLoading.value) {
      return
    }
  }

  const executeSwitch = async (config: { filename: string; source: string; nodeId?: string }) => {
    if (config.nodeId) {
      pendingFocusNodeId.value = config.nodeId
      searchVisible.value = false
    }
    options.emit('request-switch-file', { filename: config.filename, source: config.source })
  }

  const handleRequestSwitch = (config: { filename: string; source: string; nodeId?: string }) => {
    if (!isDirtyCombined.value) {
      options.emit('request-switch-file', { filename: config.filename, source: config.source })
      return
    }
    pendingSwitchConfig.value = config
    showSaveModal.value = true
  }

  const handleDiscardChanges = () => {
    showSaveModal.value = false
    if (pendingSwitchConfig.value) {
      void executeSwitch(pendingSwitchConfig.value)
      pendingSwitchConfig.value = null
    }
  }

  const handleSaveAndSwitch = async () => {
    isSavingModal.value = true
    try {
      await handleSaveNodes({ source: currentSource.value, filename: currentFilename.value }, () => {})
      showSaveModal.value = false
      if (pendingSwitchConfig.value) {
        await executeSwitch(pendingSwitchConfig.value)
        pendingSwitchConfig.value = null
      }
    } catch (e) {
      console.error('Save failed in modal', e)
    } finally {
      isSavingModal.value = false
    }
  }

  const handleCancelSwitch = () => {
    showSaveModal.value = false
    pendingSwitchConfig.value = null
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    const isMod = e.ctrlKey || e.metaKey

    if (isMod && e.key === 's') {
      e.preventDefault()
      if (isFileLoaded.value && currentFilename.value) {
        handleSaveNodes({ source: currentSource.value, filename: currentFilename.value }, () => {})
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
            const edgeIds = edges.value.filter((edge: FlowEdge) => edge.source === node.id || edge.target === node.id).map((edge: FlowEdge) => edge.id)
            removeEdges(edgeIds)
            imageManager.removeNodeState(node.id)
          })
          nodes.value = nodes.value.filter((node: FlowNode) => !selectedNodes.find((selectedNode: FlowNode) => selectedNode.id === node.id))
          markDataChanged()
        } else if (selectedEdges.length > 0) {
          removeEdges(selectedEdges.map((edge: FlowEdge) => edge.id))
          markDataChanged()
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

  onMounted(() => {
    window.addEventListener('beforeunload', handleBeforeUnload)
    window.addEventListener('keydown', handleKeyDown)
  })
  onBeforeUnmount(() => {
    window.removeEventListener('beforeunload', handleBeforeUnload)
    window.removeEventListener('keydown', handleKeyDown)
  })

  const handleLocateNode = (nodeId: string) => {
    selectNodeById(nodeId)
    setTimeout(() => fitView({ nodes: [nodeId], padding: 0.5, maxZoom: 1.5, minZoom: 0.8, duration: 600 }), 50)
  }

  const handleLoadNodesWrapper = async (payload: LoadNodesPayload) => {
    const start = perfNow()
    perfMark('FlowEditor.handleLoadNodesWrapper.start', {
      tabId: options.tabId,
      filename: payload.filename,
      nodeCount: Object.keys(payload.nodes).length
    })
    isBulkLoading.value = true
    try {
      await loadNodes(payload)
      perfLog('FlowEditor.loadNodes', start, { tabId: options.tabId, filename: payload.filename })
      loadedFileVersion.value = payload.fileVersion ?? 'V1'
      if (pendingFocusNodeId.value) {
        const targetId = pendingFocusNodeId.value
        setTimeout(() => {
          handleLocateNode(targetId)
          pendingFocusNodeId.value = null
        }, 300)
      }
    } finally {
      isBulkLoading.value = false
    }
    perfLog('FlowEditor.handleLoadNodesWrapper.total', start, { tabId: options.tabId, filename: payload.filename })
  }

  const loadResourceFile = async (fileId: string) => {
    const { source, filename } = parseFileId(fileId)
    if (!source || !filename) {
      ElMessage.error('无效的资源文件标识')
      return
    }

    try {
      const res = await resourceApi.getFileNodes(source, filename)
      const nodesRes = res?.nodes
      if (nodesRes) {
        const rawNodes = nodesRes as Record<string, import('@/utils/flowTypes').FlowBusinessData>
        const fileVersion = isPipelineV2Nodes(rawNodes) ? 'V2' : 'V1'
        const processedNodes = fileVersion === 'V2' ? toPipelineV1Nodes(rawNodes) : rawNodes

        await handleLoadNodesWrapper({
          filename,
          source,
          nodes: processedNodes,
          fileVersion
        })

        const imgRes = await resourceApi.getTemplateImages(source, filename)
        if (imgRes?.results) {
          handleLoadImages(imgRes.results as Record<string, unknown>)
          await nextTick()
          await applyLayout()
        }
      }
    } catch (e) {
      console.error('Failed to load resource file:', e)
      throw e
    }
  }

  const editorPort: FlowEditorPort = {
    getEditorStatus: () => ({
      isDirty: isDirtyCombined.value,
      nodeCount: nodes.value.length,
      edgeCount: edges.value.length
    }),
    loadResourceFile,
    handleLoadNodesWrapper,
    handleLoadImages,
    handleSaveNodes: (config: { source: string; filename: string }) => handleSaveNodes(config, () => {}),
    handleDeviceConnected: (val: boolean) => handleDeviceConnected(val, () => {}),
    handleUpdateCanvasConfig: (config: Parameters<typeof handleUpdateCanvasConfig>[0]) => handleUpdateCanvasConfig(config, () => {}),
    handleUpdatePipelineVersion: (val: 'V1' | 'V2') => handleUpdatePipelineVersion(val, () => {}),
    handleApplyLayout: () => applyLayout(),
    handleLocateNode,
    handleDebugNodeFromPanel,
    handleUpdateNodeStatus
  }

  return {
    nodes,
    edges,
    nodeTypesObject,
    currentEdgeType,
    currentSpacing,
    currentAlgorithm,
    currentDirection,
    currentFilename,
    currentSource,
    isFileLoaded,
    onValidateConnection,
    handleConnect,
    handleEdgesChange,
    handleNodesChange,
    menu,
    searchVisible,
    closeMenu,
    onPaneContextMenu,
    onNodeContextMenu,
    onEdgeContextMenu,
    handleMenuAction,
    showSaveModal,
    isSavingModal,
    showDeleteImagesModal,
    unusedImages,
    usedImages,
    isProcessingImages,
    handleRequestSwitch,
    handleLocateNode,
    handleCancelSwitch,
    handleDiscardChanges,
    handleSaveAndSwitch,
    handleCancelDeleteImages,
    handleConfirmDeleteImages,
    handleSkipDeleteImages,
    editorPort
  }
}
