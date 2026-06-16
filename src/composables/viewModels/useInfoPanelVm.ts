import { computed, getCurrentInstance, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { resourceApi } from '@/services/api'
import { useAppConfigStore } from '@/stores/appConfig'
import { useSystemState } from '@/composables/useSystemState'
import { usePreloadCache } from '@/composables/usePreloadCache'
import { makeFileId } from '@/utils/fileId'
import type { ResourceFileInfo, ResourceProfile } from '@/services/api'
import type { EdgeType } from '@/utils/flowOptions'
import type { FlowBusinessData, LayoutAlgorithm, LayoutDirection, SpacingKey, TemplateImage } from '@/utils/flowTypes'
import type { TabResourceInfo } from '@/utils/flowWorkspaceTypes'
import type { InfoPanelStatusSnapshot, PanelConnectionStatus, ResourcePanelSnapshot } from './types'

interface FlowTab {
  id: string
  title: string
  resourceFile: string
}

interface UseInfoPanelVmProps {
  tabs?: FlowTab[]
  selectedResourceFile?: string
  restoreWorkspaceOnStart?: boolean
}

interface ResourceManagerPort {
  availableFiles: ResourceFileInfo[]
  handleResourceLoad: () => Promise<void>
  findFileById: (id: string) => ResourceFileInfo | undefined
  executeFileSwitch: (filename: string, source?: string) => Promise<void>
  setMessage: (message: string) => void
}

type InfoPanelEmit = {
  (e: 'load-nodes', payload: { filename: string; source: string; nodes: Record<string, FlowBusinessData>; fileVersion?: 'V1' | 'V2' }): void
  (e: 'load-images', payload: Record<string, TemplateImage[]>, basePath?: string): void
  (e: 'save-nodes', payload: { source: string; filename: string }): void
  (e: 'device-connected', status: boolean): void
  (e: 'update:selected-resource-file', value: string): void
  (e: 'update-canvas-config', payload: { edgeType?: EdgeType; spacing?: SpacingKey; layoutAlgorithm?: LayoutAlgorithm; layoutDirection?: LayoutDirection }): void
  (e: 'update-pipeline-version', payload: 'V1' | 'V2'): void
  (e: 'update-low-memory', payload: boolean): void
  (e: 'restore-tabs', tabs: TabResourceInfo[]): void
  (e: 'clear-tabs'): void
  (e: 'open-debug-panel'): void
}

type EditableProfile = ResourceProfile & { paths: string[] }

export function useInfoPanelVm(props: UseInfoPanelVmProps, emit: InfoPanelEmit) {
  const appConfig = useAppConfigStore()
  const systemState = useSystemState((e, payload) => {
    if (e === 'save-nodes') emit('save-nodes', payload)
  })

  const isCollapsed = ref(false)
  const showResourceSettings = ref(false)
  const showCreateFileModal = ref(false)
  const showAppSettings = ref(false)
  const showAnnouncement = ref(false)
  const hasUnreadAnnouncement = ref(true)

  const resourceManagerRef = ref<ResourceManagerPort | null>(null)
  const resourceStatus = ref<ResourcePanelSnapshot>({
    status: 'disconnected',
    message: '资源未连接',
    fileOptions: [],
    availableFilesLength: 0
  })
  const deviceStatus = ref<InfoPanelStatusSnapshot>({
    status: 'disconnected',
    message: '设备未连接'
  })
  const agentStatus = ref<InfoPanelStatusSnapshot>({
    status: 'disconnected',
    message: 'Agent 未连接'
  })

  const openedFileIds = computed(() => {
    if (!props.tabs) return []
    return props.tabs
      .filter(tab => tab.resourceFile)
      .map(tab => tab.resourceFile)
  })

  const editableProfiles = computed<EditableProfile[]>(() =>
    appConfig.resource.profiles.map(p => ({
      ...p,
      paths: p.paths || []
    }))
  )

  const currentResourceFile = computed(() =>
    systemState.selectedResourceFile.value || props.selectedResourceFile || ''
  )

  const { triggerLoadFromCache, handleFileSelected: handleFileSelectedFromCache } = usePreloadCache({
    tabs: () => props.tabs,
    selectedResourceFile: () => systemState.selectedResourceFile.value,
    resourceManagerRef: () => resourceManagerRef.value,
    emit
  })

  const handleResourceStatus = (snapshot: {
    status: PanelConnectionStatus
    message: string
    fileOptions?: Array<{ label: string; value: PropertyKey; disabled?: boolean }>
    availableFilesLength?: number
  }) => {
    resourceStatus.value = {
      status: snapshot.status,
      message: snapshot.message,
      fileOptions: snapshot.fileOptions ?? resourceStatus.value.fileOptions,
      availableFilesLength: snapshot.availableFilesLength ?? resourceStatus.value.availableFilesLength
    }
  }

  const handleDeviceStatus = (snapshot: InfoPanelStatusSnapshot) => {
    deviceStatus.value = snapshot
  }

  const handleAgentStatus = (snapshot: InfoPanelStatusSnapshot) => {
    agentStatus.value = snapshot
  }

  const handleSaveNodes = async () => {
    const targetFileId = props.selectedResourceFile || systemState.selectedResourceFile.value
    if (!targetFileId) return
    await systemState.handleSaveNodes(resourceManagerRef.value, targetFileId)
  }

  const executeFileSwitch = async (filename: string, source?: string) => {
    await systemState.executeFileSwitch(filename, source, resourceManagerRef.value)
  }

  const triggerLoadFromCacheWrapper = (config: { filename: string; source: string; tabId: string }) => {
    triggerLoadFromCache(config)
  }

  const handleFileSelected = (payload: { filename: string; source: string }) => {
    handleFileSelectedFromCache(payload)
  }

  const handleDeviceConnected = (status: boolean) => {
    emit('device-connected', status)
  }

  const handleConfigChanged = () => {
    void appConfig.saveToBackend()
  }

  const handleCreateFile = async ({ path, filename }: { path: string; filename: string }) => {
    const rm = resourceManagerRef.value
    if (!rm) return
    try {
      rm.setMessage('创建文件中...')
      await resourceApi.createFile(path, filename)
      showCreateFileModal.value = false
      await rm.handleResourceLoad()
      await reloadResourceAfterCreate(rm, path, filename)
    } catch (e: unknown) {
      console.error(e)
      ElMessage.error(`创建失败: ${e instanceof Error ? e.message : '未知错误'}`)
      rm.setMessage('创建失败')
    }
  }

  const reloadResourceAfterCreate = async (rm: ResourceManagerPort, path: string, filename: string) => {
    const simpleName = filename.endsWith('.json') ? filename : `${filename}.json`
    const normalizedPath = path.replace(/\\/g, '/').toLowerCase()
    const newFileObj = rm.availableFiles.find(f =>
      f.value === simpleName &&
      f.source?.replace(/\\/g, '/').toLowerCase() === normalizedPath
    )
    if (newFileObj?.value) {
      await executeFileSwitch(newFileObj.value, newFileObj.source)
      rm.setMessage('新建成功并已加载')
    }
  }

  const handleFetchSystemState = async () => {
    await systemState.fetchSystemState()
  }

  if (getCurrentInstance()) {
    onMounted(async () => {
      await handleFetchSystemState()
    })
  }

  const saveResourceSettings = (data: { profiles: EditableProfile[]; index?: number }) => {
    void appConfig.updateResourceProfiles(data.profiles, data.index)
    showResourceSettings.value = false
  }

  const handleAppSettingsSave = (payload: {
    edgeType: EdgeType
    spacing: SpacingKey
    layoutAlgorithm: LayoutAlgorithm
    layoutDirection: LayoutDirection
    pipelineVersion: 'V1' | 'V2'
    lowMemoryMode: boolean
  }) => {
    appConfig.updateCanvasSettings({
      edgeType: payload.edgeType,
      spacing: payload.spacing,
      layoutAlgorithm: payload.layoutAlgorithm,
      layoutDirection: payload.layoutDirection,
      pipelineVersion: payload.pipelineVersion,
      lowMemoryMode: payload.lowMemoryMode
    })
    showAppSettings.value = false
  }

  const handleAnnouncementClose = () => {
    hasUnreadAnnouncement.value = false
    showAnnouncement.value = false
  }

  const handleCollapsedFileChange = (value: PropertyKey) => {
    const fileId = String(value)
    if (fileId === currentResourceFile.value) return
    const rm = resourceManagerRef.value
    if (!rm) return
    const fileObj = rm.findFileById(fileId)
    if (!fileObj?.value) return
    emit('update:selected-resource-file', fileId)
    void executeFileSwitch(fileObj.value, fileObj.source)
  }

  const resourceProfileFileId = (source: string, filename: string | null) => makeFileId(source, filename)

  return {
    appConfig,
    systemState,
    isCollapsed,
    showResourceSettings,
    showCreateFileModal,
    showAppSettings,
    showAnnouncement,
    hasUnreadAnnouncement,
    resourceManagerRef,
    resourceStatus,
    deviceStatus,
    agentStatus,
    openedFileIds,
    editableProfiles,
    currentResourceFile,
    resourceProfileFileId,
    handleResourceStatus,
    handleDeviceStatus,
    handleAgentStatus,
    handleSaveNodes,
    executeFileSwitch,
    triggerLoadFromCacheWrapper,
    handleFileSelected,
    handleDeviceConnected,
    handleConfigChanged,
    handleCreateFile,
    handleFetchSystemState,
    saveResourceSettings,
    handleAppSettingsSave,
    handleAnnouncementClose,
    handleCollapsedFileChange
  }
}
