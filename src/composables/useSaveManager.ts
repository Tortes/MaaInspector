import { ref, computed } from 'vue'
import type { FlowEditorSnapshot } from '../utils/flowWorkspaceTypes'
import type { FlowBusinessData, SpacingKey, LayoutAlgorithm, LayoutDirection, UsedImageInfo, TemplateImage } from '../utils/flowTypes'
import type { EdgeType } from '../utils/flowOptions'
import { isEdgeType, isSpacingKey, isLayoutAlgorithm, isLayoutDirection } from '../utils/typeGuards'
import { perfNow, perfLog } from '../utils/perfTrace'
import { resourceApi } from '../services/api'
import { toPipelineV2Nodes } from '../utils/pipelineTransform'
import { ElMessage } from 'element-plus'
import type { useFlowGraph } from './useFlowGraph'

type FlowGraphState = ReturnType<ReturnType<typeof useFlowGraph>['exportState']>

interface PendingSwitchConfig {
  filename: string
  source: string
  nodeId?: string
}

interface PendingSaveConfig {
  source: string
  filename: string
}

export interface SaveManagerDeps {
  currentEdgeType: { value: EdgeType }
  currentSpacing: { value: SpacingKey }
  currentAlgorithm: { value: LayoutAlgorithm }
  currentDirection: { value: LayoutDirection }
  currentFilename: { value: string }
  currentSource: { value: string }
  isDirty: { value: boolean }
  exportState: () => FlowGraphState
  restoreState: (snapshot?: FlowGraphState) => void
  getNodesData: () => Record<string, FlowBusinessData>
  getImageData: () => { delImages: { path: string }[]; tempImages: { path: string; base64: string; nodeId?: string }[] }
  clearTempImageData: () => void
  clearDirty: () => void
  imageManager: { setNodeImages: (nodeId: string, images: TemplateImage[]) => void }
  tabId?: string
  snapshot?: FlowEditorSnapshot
  defaultEdgeType?: EdgeType
  defaultSpacing?: SpacingKey
  defaultLayoutAlgorithm?: LayoutAlgorithm
  defaultLayoutDirection?: LayoutDirection
  defaultPipelineVersion?: 'V1' | 'V2'
}

export function useSaveManager(deps: SaveManagerDeps) {
  const {
    currentEdgeType, currentSpacing, currentAlgorithm, currentDirection,
    currentFilename, currentSource, isDirty,
    exportState, restoreState, getNodesData, getImageData, clearTempImageData, clearDirty,
    imageManager,
    tabId, snapshot, defaultEdgeType, defaultSpacing, defaultLayoutAlgorithm,
    defaultLayoutDirection, defaultPipelineVersion
  } = deps

  const pipelineVersion = ref<'V1' | 'V2'>('V1')
  const loadedFileVersion = ref<'V1' | 'V2' | ''>('')
  const isDeviceConnected = ref(false)

  const isFormatDirty = computed(() => !!loadedFileVersion.value && pipelineVersion.value !== loadedFileVersion.value)
  const isDirtyCombined = computed(() => isDirty.value || isFormatDirty.value)

  const showSaveModal = ref(false)
  const isSavingModal = ref(false)
  const pendingSwitchConfig = ref<PendingSwitchConfig | null>(null)
  const showDeleteImagesModal = ref(false)
  const isProcessingImages = ref(false)
  const unusedImages = ref<string[]>([])
  const usedImages = ref<UsedImageInfo[]>([])
  const pendingSaveConfig = ref<PendingSaveConfig | null>(null)

  const buildSnapshot = (viewportValue: { x: number; y: number; zoom: number }): FlowEditorSnapshot => {
    const start = perfNow()
    const snap: FlowEditorSnapshot = {
      flowState: exportState(),
      pipelineVersion: pipelineVersion.value,
      loadedFileVersion: loadedFileVersion.value,
      isDeviceConnected: isDeviceConnected.value,
      viewport: viewportValue,
      selectedResourceFile: currentFilename.value ? `${currentSource.value}|${currentFilename.value}` : ''
    }
    perfLog('FlowEditor.buildSnapshot', start, {
      tabId,
      filename: snap.flowState?.currentFilename,
      nodeCount: snap.flowState?.nodes?.length || 0,
      edgeCount: snap.flowState?.edges?.length || 0
    })
    return snap
  }

  const restoreSnapshotState = async (snap: FlowEditorSnapshot) => {
    if (!snap?.flowState) return
    const start = perfNow()
    restoreState(snap.flowState)
    pipelineVersion.value = snap.pipelineVersion || 'V1'
    loadedFileVersion.value = snap.loadedFileVersion || ''
    isDeviceConnected.value = !!snap.isDeviceConnected

    const hasImageState = snap.flowState.imageState?.nodeImageStates?.length
    const source = snap.flowState.currentSource
    const filename = snap.flowState.currentFilename
    if (!hasImageState && source && filename) {
      try {
        const imgRes = await resourceApi.getTemplateImages(source, filename)
        if (imgRes.results) {
          handleLoadImages(imgRes.results as Record<string, unknown>)
        }
      } catch (e) { console.warn('Failed to restore image:', e) }
    }

    perfLog('FlowEditor.restoreSnapshotState', start, {
      tabId,
      filename: snap.flowState.currentFilename,
      nodeCount: snap.flowState.nodes?.length || 0
    })
  }

  const applyDefaultSettings = () => {
    currentEdgeType.value = snapshot?.defaultFlowConfig?.edgeType || defaultEdgeType || 'smoothstep'
    currentSpacing.value = snapshot?.defaultFlowConfig?.spacing || defaultSpacing || 'normal'
    currentAlgorithm.value = snapshot?.defaultFlowConfig?.layoutAlgorithm || defaultLayoutAlgorithm || 'layered'
    currentDirection.value = snapshot?.defaultFlowConfig?.layoutDirection || defaultLayoutDirection || 'TB'
    pipelineVersion.value = snapshot?.pipelineVersion || defaultPipelineVersion || 'V1'
    loadedFileVersion.value = ''
  }

  const isTemplateImageArray = (value: unknown): value is Array<{ path: string }> =>
    Array.isArray(value) && value.every(item => typeof item === 'object' && !!item && 'path' in item)

  const isUsedImageInfoArray = (value: unknown): value is UsedImageInfo[] =>
    Array.isArray(value) && value.every(item => typeof item === 'object' && !!item && 'path' in item && 'used_by' in item)

  const handleLoadImages = (imageDataMap: Record<string, unknown>, _basePath?: string) => {
    if (!imageDataMap) return
    const start = perfNow()
    try {
      for (const [nodeId, images] of Object.entries(imageDataMap)) {
        if (isTemplateImageArray(images)) {
          imageManager.setNodeImages(nodeId, images)
        }
      }
    } finally {
    }
    perfLog('FlowEditor.handleLoadImages', start, {
      tabId,
      imageEntryCount: Object.keys(imageDataMap).length
    })
  }

  const saveNodesOnly = async (source: string, filename: string, onSnapshotState: () => void) => {
    const rawNodes = getNodesData()
    const payload = pipelineVersion.value === 'V2' ? toPipelineV2Nodes(rawNodes) : rawNodes
    const res = await resourceApi.saveFileNodes(source, filename, payload, { context: { feature: 'resource', action: 'save_nodes', component: 'FlowEditor' } })
    if (res.success) {
      clearDirty()
      loadedFileVersion.value = pipelineVersion.value
      onSnapshotState()
    }
  }

  const processImagesAndSave = async (source: string, filename: string, deletePaths: string[], tempImages: { path: string; base64: string; nodeId?: string }[], onSnapshotState: () => void) => {
    try {
      if (deletePaths.length > 0 || tempImages.length > 0) {
        await resourceApi.processImages(source, deletePaths, tempImages, { context: { feature: 'resource', action: 'process_images', component: 'FlowEditor' } })
      }
      clearTempImageData()
      await saveNodesOnly(source, filename, onSnapshotState)
    } catch (e: unknown) {
      console.error('[FlowEditor] 图片处理失败:', e)
      throw e
    }
  }

  const handleSaveNodes = async ({ source, filename }: { source: string; filename: string }, onSnapshotState: () => void) => {
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
        await processImagesAndSave(source, filename, [], tempImages, onSnapshotState)
      } else {
        await saveNodesOnly(source, filename, onSnapshotState)
      }
    } catch (e: unknown) {
      console.error('[FlowEditor] 保存失败:', e)
      throw e
    }
  }

  const handleConfirmDeleteImages = async (onSnapshotState: () => void) => {
    if (!pendingSaveConfig.value) return
    isProcessingImages.value = true
    try {
      await processImagesAndSave(pendingSaveConfig.value.source, pendingSaveConfig.value.filename, unusedImages.value, getImageData().tempImages, onSnapshotState)
      showDeleteImagesModal.value = false
      pendingSaveConfig.value = null
    } catch (e: unknown) {
      const err = e as { message?: string }
      ElMessage.error('保存失败: ' + (err?.message || '未知错误'))
    } finally {
      isProcessingImages.value = false
    }
  }

  const handleSkipDeleteImages = async (onSnapshotState: () => void) => {
    if (!pendingSaveConfig.value) return
    isProcessingImages.value = true
    try {
      await processImagesAndSave(pendingSaveConfig.value.source, pendingSaveConfig.value.filename, [], getImageData().tempImages, onSnapshotState)
      showDeleteImagesModal.value = false
      pendingSaveConfig.value = null
    } catch (e: unknown) {
      const err = e as { message?: string }
      ElMessage.error('保存失败: ' + (err?.message || '未知错误'))
    } finally {
      isProcessingImages.value = false
    }
  }

  const handleCancelDeleteImages = () => { showDeleteImagesModal.value = false; pendingSaveConfig.value = null }

  const handleUpdateCanvasConfig = ({
    edgeType, spacing, layoutAlgorithm, layoutDirection
  }: {
    edgeType?: string; spacing?: string; layoutAlgorithm?: string; layoutDirection?: string
  }, onSnapshotState: () => void) => {
    const nextEdgeType = isEdgeType(edgeType) ? edgeType : undefined
    const nextSpacing = isSpacingKey(spacing) ? spacing : undefined
    const nextAlgorithm = isLayoutAlgorithm(layoutAlgorithm) ? layoutAlgorithm : undefined
    const nextDirection = isLayoutDirection(layoutDirection) ? layoutDirection : undefined
    if (nextEdgeType && nextEdgeType !== currentEdgeType.value) {
      currentEdgeType.value = nextEdgeType
    }
    if (nextSpacing && nextSpacing !== currentSpacing.value) currentSpacing.value = nextSpacing
    if (nextAlgorithm && nextAlgorithm !== currentAlgorithm.value) currentAlgorithm.value = nextAlgorithm
    if (nextDirection && nextDirection !== currentDirection.value) currentDirection.value = nextDirection
    onSnapshotState()
  }

  const handleUpdatePipelineVersion = (val: 'V1' | 'V2', onSnapshotState: () => void) => {
    pipelineVersion.value = val
    onSnapshotState()
  }

  const handleDeviceConnected = (val: boolean, onSnapshotState: () => void) => {
    isDeviceConnected.value = val
    onSnapshotState()
  }

  const handleBeforeUnload = (e: BeforeUnloadEvent) => {
    if (isDirtyCombined.value) { e.preventDefault(); e.returnValue = ''; return '' }
  }

  return {
    pipelineVersion,
    loadedFileVersion,
    isDeviceConnected,
    isFormatDirty,
    isDirtyCombined,
    showSaveModal,
    isSavingModal,
    pendingSwitchConfig,
    showDeleteImagesModal,
    isProcessingImages,
    unusedImages,
    usedImages,
    pendingSaveConfig,
    buildSnapshot,
    restoreSnapshotState,
    applyDefaultSettings,
    handleLoadImages,
    handleSaveNodes,
    handleConfirmDeleteImages,
    handleSkipDeleteImages,
    handleCancelDeleteImages,
    handleUpdateCanvasConfig,
    handleUpdatePipelineVersion,
    handleDeviceConnected,
    handleBeforeUnload
  }
}
