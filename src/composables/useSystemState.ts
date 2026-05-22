import { ref, computed, watch, type ComputedRef } from 'vue'
import { ElMessage } from 'element-plus'
import { systemApi } from '@/services/api'
import { makeFileId, parseFileId } from '@/utils/fileId'
import type { ApiDeviceInfo, ResourceProfile } from '@/services/api'
import type { LayoutAlgorithm, LayoutDirection, SpacingKey } from '@/utils/flowTypes'
import type { EdgeType } from '@/utils/flowOptions'

interface DeviceManagerRef {
  currentDevice?: ApiDeviceInfo | null
  loadLastDevice: (device: ApiDeviceInfo) => void
}

interface ResourceFileInfo {
  source?: string | null
  value?: string | null
}

interface ResourceManagerRef {
  availableFiles: Array<{ label?: string; source?: string | null; value?: string | null; filename?: string | null }>
  findFileById: (id: string) => ResourceFileInfo | undefined
  executeFileSwitch: (filename: string, source?: string) => Promise<void>
  setMessage: (message: string) => void
}

interface AgentManagerRef {
  currentAgentSocket?: string
}

type SystemStateEmit = {
  (e: 'update-canvas-config', payload: {
    edgeType: EdgeType
    spacing: SpacingKey
    layoutAlgorithm: LayoutAlgorithm
    layoutDirection: LayoutDirection
  }): void
  (e: 'update-restore-workspace', value: boolean): void
  (e: 'save-nodes', payload: { source: string; filename: string }): void
  (e: 'update-pipeline-version', version: 'V1' | 'V2'): void
}

type EditableProfile = ResourceProfile & { paths: string[] }

interface UseSystemStateOptions {
  initialSelectedResourceFile: string
  initialPipelineVersion: 'V1' | 'V2'
  props: {
    edgeType?: EdgeType
    spacing?: SpacingKey
    layoutAlgorithm?: LayoutAlgorithm
    layoutDirection?: LayoutDirection
    restoreWorkspaceOnStart?: boolean
    selectedResourceFile?: string
    pipelineVersion?: 'V1' | 'V2'
  }
  emit: SystemStateEmit
}

export function useSystemState(options: UseSystemStateOptions) {
  const systemStatus = ref<'connected' | 'loading' | 'error' | 'disconnected'>('disconnected')
  const resourceProfiles = ref<EditableProfile[]>([])
  const selectedProfileIndex = ref(0)
  const selectedResourceFile = ref(options.initialSelectedResourceFile)
  const pipelineVersion = ref<'V1' | 'V2'>(options.initialPipelineVersion)
  const isSaving = ref(false)

  const currentProfile: ComputedRef<EditableProfile> = computed(() =>
    resourceProfiles.value[selectedProfileIndex.value] || { name: 'None', paths: [] } as EditableProfile
  )

  const normalizeProfiles = (profiles?: ResourceProfile[]): EditableProfile[] =>
    (profiles || []).map(p => ({
      ...p,
      paths: Array.isArray((p as Record<string, unknown>).paths) ? [...(p as Record<string, unknown>).paths as string[]] : []
    }))

  let isInit = true

  const fetchSystemState = async (deviceManagerRef: DeviceManagerRef | null, agentManagerRef: AgentManagerRef | null) => {
    systemStatus.value = 'loading'
    isInit = true
    try {
      const data = await systemApi.getInitialState()

      if (data.resource_profiles) {
        resourceProfiles.value = normalizeProfiles(data.resource_profiles as ResourceProfile[])
        const state = data.current_state || {}
        if (state.resource_profile_index !== undefined && resourceProfiles.value[state.resource_profile_index]) {
          selectedProfileIndex.value = state.resource_profile_index
        }
        if (state.resource_file && state.resource_source) {
          selectedResourceFile.value = makeFileId(state.resource_source, state.resource_file)
        } else if (state.resource_file) {
          selectedResourceFile.value = state.resource_file
        }
      }

      const am = agentManagerRef
      if (am) {
        const state = data.current_state || {}
        if (state.agent_socket_id) am.currentAgentSocket = state.agent_socket_id
        else if (data.agent_socket_id) am.currentAgentSocket = data.agent_socket_id
      }

      if (data.current_state) {
        const state = data.current_state
        if (state.edge_type || state.spacing || state.layout_algorithm || state.layout_direction) {
          options.emit('update-canvas-config', {
            edgeType: (state.edge_type as EdgeType) || 'smoothstep',
            spacing: (state.spacing as SpacingKey) || 'normal',
            layoutAlgorithm: (state.layout_algorithm as LayoutAlgorithm) || 'layered',
            layoutDirection: (state.layout_direction as LayoutDirection) || 'TB'
          })
        }
        if (state.pipeline_version === 'V2' || state.pipeline_version === 'V1') {
          pipelineVersion.value = state.pipeline_version
        }
        if (typeof state.restore_workspace_on_start === 'boolean') {
          options.emit('update-restore-workspace', state.restore_workspace_on_start)
        }
      }

      const dm = deviceManagerRef
      if (dm && data.last_connected_device) {
        dm.loadLastDevice(data.last_connected_device as ApiDeviceInfo)
      }

      systemStatus.value = 'connected'
    } catch (e: unknown) {
      console.error("Init failed", e)
      systemStatus.value = 'error'
    } finally {
      setTimeout(() => { isInit = false }, 500)
    }
  }

  const saveAllConfig = async (deviceManagerRef: DeviceManagerRef | null, agentManagerRef: AgentManagerRef | null) => {
    if (isInit) return
    if (systemStatus.value !== 'connected') return
    try {
      const am = agentManagerRef
      const dm = deviceManagerRef
      const { source: currentSource, filename: currentFilename } = parseFileId(selectedResourceFile.value)

      const currentDevices: ApiDeviceInfo[] = []
      let deviceIndex = -1
      if (dm && dm.currentDevice) {
        currentDevices.push(dm.currentDevice)
        deviceIndex = 0
      }

      const props = options.props
      const payload = {
        devices: currentDevices,
        resource_profiles: resourceProfiles.value,
        agent_socket_id: am?.currentAgentSocket || '',
        current_state: {
          device_index: deviceIndex,
          resource_profile_index: selectedProfileIndex.value,
          resource_file: currentFilename,
          resource_source: currentSource,
          agent_socket_id: am?.currentAgentSocket || '',
          edge_type: props.edgeType,
          spacing: props.spacing,
          layout_algorithm: props.layoutAlgorithm,
          layout_direction: props.layoutDirection,
          pipeline_version: pipelineVersion.value,
          restore_workspace_on_start: props.restoreWorkspaceOnStart ?? true
        }
      }
      await systemApi.saveDeviceConfig(payload)
    } catch (e) {
      console.error("Auto save failed", e)
    }
  }

  const setupAutoSave = (deviceManagerRef: DeviceManagerRef | null, agentManagerRef: AgentManagerRef | null) => {
    watch([selectedProfileIndex, selectedResourceFile, pipelineVersion], () => saveAllConfig(deviceManagerRef, agentManagerRef), { deep: false })
    watch(() => [options.props.edgeType, options.props.spacing, options.props.layoutAlgorithm, options.props.layoutDirection, options.props.restoreWorkspaceOnStart], () => saveAllConfig(deviceManagerRef, agentManagerRef), { deep: false })
    watch(() => agentManagerRef?.currentAgentSocket, () => saveAllConfig(deviceManagerRef, agentManagerRef))
  }

  const handleSaveNodes = async (resourceManagerRef: ResourceManagerRef | null) => {
    if (!selectedResourceFile.value || isSaving.value) return
    isSaving.value = true
    try {
      const rm = resourceManagerRef
      if (!rm) throw new Error('ResourceManager 未就绪')
      const fileObj = rm.findFileById(selectedResourceFile.value)
      if (!fileObj || !fileObj.value) throw new Error('未找到当前文件')
      options.emit('save-nodes', { source: fileObj.source ?? '', filename: fileObj.value ?? '' })
    } catch (e: unknown) {
      console.error('保存失败', e)
      ElMessage.error('保存失败: ' + (e instanceof Error ? e.message : '未知错误'))
      throw e
    } finally {
      isSaving.value = false
    }
  }

  const executeFileSwitch = async (filename: string, source: string | undefined, resourceManagerRef: ResourceManagerRef | null) => {
    const rm = resourceManagerRef
    if (!rm) return

    const normSource = source ? source.replace(/\\/g, '/').toLowerCase() : ''
    const target = rm.availableFiles.find((f) => {
      const fSource = f.source ? f.source.replace(/\\/g, '/').toLowerCase() : ''
      if (source) {
        return f.value === filename && fSource === normSource
      }
      return f.value === filename
    })

    if (target && target.value) {
      selectedResourceFile.value = makeFileId(target.source ?? '', target.value)
      await rm.executeFileSwitch(target.value, target.source ?? undefined)
    } else {
      ElMessage.error(`无法切换: 未找到文件 ${filename}`)
    }
  }

  watch(() => options.props.selectedResourceFile, (v) => { if (v) selectedResourceFile.value = v }, { immediate: true })

  watch(pipelineVersion, (val) => {
    options.emit('update-pipeline-version', val)
  }, { immediate: true })

  return {
    systemStatus,
    resourceProfiles,
    selectedProfileIndex,
    selectedResourceFile,
    pipelineVersion,
    isSaving,
    currentProfile,
    fetchSystemState,
    saveAllConfig,
    setupAutoSave,
    handleSaveNodes,
    executeFileSwitch,
    normalizeProfiles
  }
}
