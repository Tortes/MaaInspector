<script setup lang="ts">
import {computed, ref, onMounted, onUnmounted, defineComponent, h, watch} from 'vue'
import { ElMessage } from 'element-plus'
import {
  Bot, Settings, RefreshCw, CheckCircle2, XCircle, Loader2,
  Minimize2, Maximize2, Circle,
  Save, Bell, Settings as SettingsIcon, Bug
} from 'lucide-vue-next'
import {resourceApi, systemApi} from '../../services/api.ts'
import { perfLog, perfMark, perfNow } from '../../utils/perfTrace'
import { isPipelineV2Nodes, toPipelineV1Nodes } from '../../utils/pipelineTransform'
import { makeFileId, parseFileId } from '../../utils/fileId'
import type { DeviceInfo, ResourceProfile, ResourceFileInfo } from '../../services/api.ts'
import type { FlowBusinessData, LayoutAlgorithm, LayoutDirection, TemplateImage, SpacingKey } from '../../utils/flowTypes'
import type { EdgeType } from '../../utils/flowOptions'
import type { FlowTab } from '../../stores/workspace'
import ResourceSettingsModal from './Modals/ResourceSettingsModal.vue'
import CreateResourceModal from './Modals/CreateResourceModal.vue'
import AppSettingsModal from './Modals/AppSettingsModal.vue'
import AnnouncementModal from './Modals/AnnouncementModal.vue'
import DeviceManager from './InfoPanel/DeviceManager.vue'
import ResourceManager from './InfoPanel/ResourceManager.vue'
import AgentManager from './InfoPanel/AgentManager.vue'
import Dropdown from './Common/Dropdown.vue'

// --- Props & Emits ---
const props = defineProps<{
  tabs?: FlowTab[]
  nodeCount?: number
  edgeCount?: number
  isDirty?: boolean
  currentFilename?: string
  selectedResourceFile?: string
  zoom?: number
  edgeType?: EdgeType
  spacing?: SpacingKey
  layoutAlgorithm?: LayoutAlgorithm
  layoutDirection?: LayoutDirection
  pipelineVersion?: 'V1' | 'V2'
  restoreWorkspaceOnStart?: boolean
  lowMemoryMode?: boolean
}>()

const emit = defineEmits<{
  'load-nodes': [payload: { filename: string; source: string; nodes: Record<string, FlowBusinessData>; fileVersion?: 'V1' | 'V2' }]
  'load-images': [payload: Record<string, TemplateImage[]>, basePath?: string]
  'save-nodes': [payload: { source: string; filename: string }]
  'device-connected': [status: boolean]
  'update:selected-resource-file': [value: string]
  'update-canvas-config': [payload: { edgeType?: EdgeType; spacing?: SpacingKey; layoutAlgorithm?: LayoutAlgorithm; layoutDirection?: LayoutDirection }]
  'update-pipeline-version': [payload: 'V1' | 'V2']
  'update-restore-workspace': [payload: boolean]
  'update-low-memory': [payload: boolean]
  'open-debug-panel': []
}>()

// --- 预加载数据缓存 ---
const preloadCache = new Map<string, { nodes: Record<string, FlowBusinessData>; images: Record<string, TemplateImage[]>; fileVersion?: 'V1' | 'V2' }>()

const preloadAllTabFiles = async () => {
  console.log('[预加载] preloadAllTabFiles 被调用')
  console.log('[预加载] props.tabs:', props.tabs)
  console.log('[预加载] props.tabs.length:', props.tabs?.length)
  
  if (!props.tabs || props.tabs.length === 0) {
    console.log('[预加载] 跳过: 没有标签页')
    return
  }
  
  const rm = resourceManagerRef.value
  if (!rm) {
    console.log('[预加载] 跳过: ResourceManager 未就绪')
    return
  }
  
  const filesToPreload = new Set<string>()
  // selectedResourceFile 已经是 source|filename 格式
  const currentFileKey = selectedResourceFile.value
  console.log('[预加载] 当前文件 key:', currentFileKey)
  
  for (const tab of props.tabs) {
    const snapshot = tab.snapshot
    console.log('[预加载] 检查标签页:', tab.id, 'filename:', snapshot.flowState?.currentFilename, 'source:', snapshot.flowState?.currentSource)
    if (snapshot.flowState?.currentFilename && snapshot.flowState?.currentSource) {
      const fileKey = `${snapshot.flowState.currentSource}|${snapshot.flowState.currentFilename}`
      console.log('[预加载] 文件 key:', fileKey, '是否缓存:', preloadCache.has(fileKey), '是否当前文件:', fileKey === currentFileKey)
      if (fileKey !== currentFileKey && !preloadCache.has(fileKey)) {
        filesToPreload.add(fileKey)
        console.log('[预加载] 添加到预加载队列:', fileKey)
      }
    }
  }
  
  console.log('[预加载] 待预加载文件数量:', filesToPreload.size)
  if (filesToPreload.size === 0) {
    console.log('[预加载] 跳过: 没有需要预加载的文件')
    return
  }
  
  const preloadPromises = Array.from(filesToPreload).map(async (fileKey) => {
    const [source, filename] = fileKey.split('|')
    if (!source || !filename) return
    
    console.log('[预加载] 开始预加载:', filename, 'source:', source)
    try {
      const [nodesRes, imagesRes] = await Promise.all([
        resourceApi.getFileNodes<Record<string, FlowBusinessData>>(source, filename),
        resourceApi.getTemplateImages(source, filename)
      ])
      
      console.log('[预加载] 预加载成功:', filename, '节点数:', Object.keys(nodesRes.nodes || {}).length)
      const nodes = nodesRes.nodes || {}
      const fileVersion = isPipelineV2Nodes(nodes) ? 'V2' : 'V1'
      const normalizedNodes = fileVersion === 'V2' ? toPipelineV1Nodes(nodes) : nodes
      
      preloadCache.set(fileKey, {
        nodes: normalizedNodes,
        images: imagesRes.results as Record<string, TemplateImage[]> || {},
        fileVersion
      })
      console.log('[预加载] 缓存已设置:', fileKey, '缓存大小:', preloadCache.size)
    } catch (e) {
      console.warn(`[预加载] 预加载文件失败: ${filename}`, e)
    }
  })
  
  await Promise.allSettled(preloadPromises)
  console.log('[预加载] 所有预加载完成, 缓存大小:', preloadCache.size)
}

// --- 内部组件 ---
const StatusIndicator = defineComponent({
  props: {status: String, size: {type: Number, default: 16}},
  setup(props) {
    return () => {
      if (props.status === 'connected') return h(CheckCircle2, {
        size: props.size,
        class: 'text-emerald-500 fill-emerald-50'
      })
      if (props.status === 'connecting' || props.status === 'disconnecting') return h(Loader2, {
        size: props.size,
        class: 'text-blue-500 animate-spin'
      })
      if (props.status === 'failed') return h(XCircle, {size: props.size, class: 'text-red-500'})
      return h(Circle, {size: props.size, class: 'text-slate-300'})
    }
  }
})

// --- 视图状态 ---
const zoomPercentage = computed(() => Math.round((props.zoom || 1) * 100) + '%')
const isCollapsed = ref(false)
const showResourceSettings = ref(false)
const showCreateFileModal = ref(false)
const showAppSettings = ref(false)
const showAnnouncement = ref(false)
const hasUnreadAnnouncement = ref(true)

// --- 全局状态 ---
const pipelineVersion = ref<'V1' | 'V2'>(props.pipelineVersion || 'V1')
const systemStatus = ref<'connected' | 'loading' | 'error' | 'disconnected'>('disconnected')
const isSaving = ref(false)

// --- 资源配置状态 (InfoPanel 拥有) ---
type EditableProfile = ResourceProfile & { paths: string[] }
const resourceProfiles = ref<EditableProfile[]>([])
const selectedProfileIndex = ref(0)
const selectedResourceFile = ref(props.selectedResourceFile || '')

watch(() => props.selectedResourceFile, (v) => { if (v) selectedResourceFile.value = v }, { immediate: true })

const currentProfile = computed<EditableProfile>(() =>
  resourceProfiles.value[selectedProfileIndex.value] || { name: 'None', paths: [] } as EditableProfile
)

const normalizeProfiles = (profiles?: ResourceProfile[]): EditableProfile[] =>
  (profiles || []).map(p => ({
    ...p,
    paths: Array.isArray((p as any).paths) ? [...(p as any).paths] : []
  }))

// --- 子组件 refs ---
const deviceManagerRef = ref<InstanceType<typeof DeviceManager> | null>(null)
const resourceManagerRef = ref<InstanceType<typeof ResourceManager> | null>(null)
const agentManagerRef = ref<InstanceType<typeof AgentManager> | null>(null)

// --- 同步子组件状态到本地 (用于 collapsed 模板显示) ---
const dmStatus = ref('disconnected')
const dmMessage = ref('设备未连接')
const rmStatus = ref('disconnected')
const rmMessage = ref('资源未连接')
const rmFileOptions = ref<{label: string; value: PropertyKey; disabled?: boolean}[]>([])
const rmAvailableFilesLen = ref(0)
const amStatus = ref('disconnected')
const amMessage = ref('Agent 未连接')

let syncTimer: ReturnType<typeof setInterval> | null = null
const syncChildState = () => {
  const dm = deviceManagerRef.value
  if (dm) {
    dmStatus.value = dm.status ?? 'disconnected'
    dmMessage.value = dm.message ?? '设备未连接'
  }
  const rm = resourceManagerRef.value
  if (rm) {
    rmStatus.value = rm.status ?? 'disconnected'
    rmMessage.value = rm.message ?? '资源未连接'
    rmFileOptions.value = rm.fileOptions ?? []
    rmAvailableFilesLen.value = (rm.availableFiles as any)?.length ?? 0
  }
  const am = agentManagerRef.value
  if (am) {
    amStatus.value = am.status ?? 'disconnected'
    amMessage.value = am.message ?? 'Agent 未连接'
  }
}

// --- 保存节点 ---
const handleSaveNodes = async () => {
  if (!selectedResourceFile.value || isSaving.value) return
  isSaving.value = true
  try {
    const rm = resourceManagerRef.value
    if (!rm) throw new Error('ResourceManager 未就绪')
    const fileObj = rm.findFileById(selectedResourceFile.value)
    if (!fileObj || !fileObj.value) throw new Error('未找到当前文件')
    emit('save-nodes', {source: fileObj.source, filename: fileObj.value})
  } catch (e: unknown) {
    console.error('保存失败', e)
    ElMessage.error('保存失败: ' + (e instanceof Error ? e.message : '未知错误'))
    throw e
  } finally {
    isSaving.value = false
  }
}

const executeFileSwitch = async (filename: string, source?: string) => {
  const start = perfNow()
  perfMark('InfoPanel.executeFileSwitch.start', { filename, source })
  const rm = resourceManagerRef.value
  if (!rm) return

  const normSource = source ? source.replace(/\\/g, '/').toLowerCase() : ''
  const target = (rm.availableFiles as ResourceFileInfo[]).find((f: ResourceFileInfo) => {
    const fSource = f.source ? f.source.replace(/\\/g, '/').toLowerCase() : ''
    if (source) {
      return f.value === filename && fSource === normSource
    }
    return f.value === filename
  })

  if (target) {
    selectedResourceFile.value = makeFileId(target.source, target.value)
    await rm.executeFileSwitch(target.value ?? '', target.source ?? undefined)
    perfLog('InfoPanel.executeFileSwitch.total', start, { filename, source })
  } else {
    ElMessage.error(`无法切换: 未找到文件 ${filename}`)
  }
}

const triggerLoadFromCache = (config: { filename: string; source: string; tabId: string }) => {
  const fileKey = `${config.source}|${config.filename}`
  const cached = preloadCache.get(fileKey)
  
  if (!cached) {
    console.log('[缓存加载] 未命中缓存:', fileKey)
    return
  }
  
  console.log('[缓存加载] 从缓存加载到标签页:', config.tabId, '文件:', config.filename, '节点数:', Object.keys(cached.nodes).length)
  emit('load-nodes', { filename: config.filename, source: config.source, nodes: cached.nodes, fileVersion: cached.fileVersion })
  emit('load-images', cached.images)
  preloadCache.delete(fileKey)
}

defineExpose({executeFileSwitch, handleSaveNodes, triggerLoadFromCache})

// --- 子组件事件处理 ---
const handleDeviceConnected = (status: boolean) => {
  emit('device-connected', status)
}

const handleFileSelected = (payload: { filename: string; source: string }) => {
  console.log('[文件选择] handleFileSelected 被调用:', payload)
  
  const rm = resourceManagerRef.value
  if (!rm) {
    console.log('[文件选择] 跳过: ResourceManager 未就绪')
    return
  }
  const fileId = makeFileId(payload.source, payload.filename)
  const fileObj = rm.findFileById(fileId)
  if (!fileObj || !fileObj.value) {
    console.log('[文件选择] 跳过: 找不到文件对象')
    return
  }

  const src = fileObj.source
  const fname = fileObj.value
  const fileKey = `${src}|${fname}`
  console.log('[文件选择] 文件 key:', fileKey, '缓存大小:', preloadCache.size)

  // 检查预加载缓存
  const cached = preloadCache.get(fileKey)
  if (cached) {
    console.log('[文件选择] 使用缓存数据:', fileKey, '节点数:', Object.keys(cached.nodes).length)
    emit('load-nodes', { filename: fname, source: src, nodes: cached.nodes, fileVersion: cached.fileVersion })
    emit('load-images', cached.images)
    preloadCache.delete(fileKey)
    rm.setMessage(`已加载: ${Object.keys(cached.nodes).length} 节点 (从缓存)`)
    return
  }

  console.log('[文件选择] 未命中缓存, 开始正常加载')
  const totalStart = perfNow()
  rm.setMessage('加载节点中...')
  resourceApi.getFileNodes<Record<string, FlowBusinessData>>(src, fname, {
    context: { feature: 'resource', action: 'get_nodes', component: 'InfoPanel' }
  }).then(res => {
    const getNodesStart = perfNow()
    perfLog('InfoPanel.getFileNodes', getNodesStart, { filename: fname, source: src })
    const nodes = res.nodes || {}
    const normalizeStart = perfNow()
    const fileVersion = isPipelineV2Nodes(nodes) ? 'V2' : 'V1'
    const normalizedNodes = fileVersion === 'V2'
      ? toPipelineV1Nodes(nodes)
      : nodes
    perfLog('InfoPanel.normalizeNodes', normalizeStart, { nodeCount: Object.keys(nodes).length, fileVersion })

    const emitStart = perfNow()
    emit('load-nodes', {filename: fname, source: src, nodes: normalizedNodes, fileVersion})
    perfLog('InfoPanel.emitLoadNodes', emitStart, { nodeCount: Object.keys(normalizedNodes).length })
    rm.setMessage(`已加载: ${Object.keys(nodes).length} 节点`)

    resourceApi.getTemplateImages(src, fname, {
      context: { feature: 'resource', action: 'get_templates', component: 'InfoPanel' }
    }).then(imgRes => {
      const templateStart = perfNow()
      perfLog('InfoPanel.getTemplateImages', templateStart, { filename: fname })
      if (imgRes.results) {
        const basePath = (imgRes as Record<string, unknown>).base_image_path as string | undefined
        emit('load-images', imgRes.results as Record<string, TemplateImage[]>, basePath)
      }
    }).catch(imgError => {
      console.warn("图片加载失败", imgError)
    })

    perfLog('InfoPanel.fetchAndEmitNodes.total', totalStart, { filename: fname })
    
    // 当前文件加载完成后，预加载其他标签页的文件
    console.log('[文件选择] 触发预加载其他标签页文件')
    preloadAllTabFiles()
  }).catch(e => {
    console.error("加载节点失败", e)
    rm.setMessage('节点加载失败')
  })
}

const handleConfigChanged = () => {
  void saveAllConfig()
}

const handleCreateFile = async ({path, filename}: { path: string; filename: string }) => {
  const rm = resourceManagerRef.value
  if (!rm) return
  try {
    rm.setMessage('创建文件中...')
    await resourceApi.createFile(path, filename, {
      context: { feature: 'resource', action: 'create_file', component: 'InfoPanel' }
    })
    showCreateFileModal.value = false
    await rm.handleResourceLoad()
    const simpleName = filename.endsWith('.json') ? filename : filename + '.json'
    const normalizedPath = path.replace(/\\/g, '/').toLowerCase()
    const availFiles = rm.availableFiles as ResourceFileInfo[]
    const newFileObj = availFiles.find(f =>
      f.value === simpleName &&
      f.source.replace(/\\/g, '/').toLowerCase() === normalizedPath
    )
    if (newFileObj && newFileObj.value) {
      await executeFileSwitch(newFileObj.value, newFileObj.source)
      rm.setMessage('新建成功并已加载')
    }
  } catch (e: unknown) {
    console.error(e)
    ElMessage.error(`创建失败: ${e instanceof Error ? e.message : '未知错误'}`)
    rm.setMessage('创建失败')
  }
}

// --- 初始化 ---
let isInit = true

const fetchSystemState = async () => {
  systemStatus.value = 'loading'
  isInit = true
  try {
    const data = await systemApi.getInitialState({
      context: { feature: 'system', action: 'init', component: 'InfoPanel' }
    })

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

    const am = agentManagerRef.value
    if (am) {
      const state = data.current_state || {}
      if (state.agent_socket_id) am.currentAgentSocket = state.agent_socket_id
      else if (data.agent_socket_id) am.currentAgentSocket = data.agent_socket_id
    }

    if (data.current_state) {
      const state = data.current_state
      if (state.edge_type || state.spacing || state.layout_algorithm || state.layout_direction) {
        emit('update-canvas-config', {
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
        emit('update-restore-workspace', state.restore_workspace_on_start)
      }
    }

    const dm = deviceManagerRef.value
    if (dm && data.last_connected_device) {
      dm.loadLastDevice(data.last_connected_device as DeviceInfo)
    }

    systemStatus.value = 'connected'
  } catch (e: unknown) {
    console.error("Init failed", e)
    systemStatus.value = 'error'
  } finally {
    setTimeout(() => { isInit = false }, 500)
  }
}

onMounted(() => {
  fetchSystemState()
  setTimeout(() => {
    syncChildState()
    syncTimer = setInterval(syncChildState, 200)
  }, 100)
})

onUnmounted(() => {
  if (syncTimer) { clearInterval(syncTimer); syncTimer = null }
})

// --- 配置保存 ---
const saveAllConfig = async () => {
  if (isInit) return
  if (systemStatus.value !== 'connected') return
  try {
    const am = agentManagerRef.value
    const dm = deviceManagerRef.value
    const { source: currentSource, filename: currentFilename } = parseFileId(selectedResourceFile.value)

    // 获取当前连接的设备信息
    const currentDevices: DeviceInfo[] = []
    let deviceIndex = -1
    if (dm && dm.currentDevice) {
      currentDevices.push(dm.currentDevice)
      deviceIndex = 0
    }

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
    await systemApi.saveDeviceConfig(payload, {
      context: { feature: 'system', action: 'save_config', component: 'InfoPanel' }
    })
  } catch (e) {
    console.error("Auto save failed", e)
  }
}

watch([selectedProfileIndex, selectedResourceFile, pipelineVersion], () => saveAllConfig(), {deep: false})
watch(() => [props.edgeType, props.spacing, props.layoutAlgorithm, props.layoutDirection, props.restoreWorkspaceOnStart], () => saveAllConfig(), {deep: false})

watch(() => agentManagerRef.value?.currentAgentSocket, () => saveAllConfig())

watch(pipelineVersion, (val) => {
  emit('update-pipeline-version', val)
}, { immediate: true })

const saveResourceSettings = (data: { profiles: ResourceProfile[]; index?: number }) => {
  resourceProfiles.value = normalizeProfiles(data.profiles)
  if (selectedProfileIndex.value >= resourceProfiles.value.length) selectedProfileIndex.value = 0
  if (data.index !== undefined) selectedProfileIndex.value = data.index
  showResourceSettings.value = false
  saveAllConfig()
}

const handleAppSettingsSave = (payload: {
  edgeType: EdgeType
  spacing: SpacingKey
  layoutAlgorithm: LayoutAlgorithm
  layoutDirection: LayoutDirection
  pipelineVersion: 'V1' | 'V2'
  restoreWorkspaceOnStart: boolean
  lowMemoryMode: boolean
}) => {
  pipelineVersion.value = payload.pipelineVersion
  emit('update-canvas-config', {
    edgeType: payload.edgeType,
    spacing: payload.spacing,
    layoutAlgorithm: payload.layoutAlgorithm,
    layoutDirection: payload.layoutDirection
  })
  emit('update-restore-workspace', payload.restoreWorkspaceOnStart)
  emit('update-low-memory', payload.lowMemoryMode)
  showAppSettings.value = false
  saveAllConfig()
}

const handleAnnouncementClose = () => {
  hasUnreadAnnouncement.value = false
  showAnnouncement.value = false
}
</script>

<template>
  <div class="relative flex flex-col items-end gap-2 font-sans select-none pointer-events-auto z-50">
    <Transition
      name="fade-scale"
      mode="out-in"
    >
      <div
        v-if="isCollapsed"
        class="bg-white/90 backdrop-blur shadow-lg border border-slate-200 rounded-full flex items-center p-1 pl-3 pr-1 gap-3 transition-all duration-300"
        :class="{'!border-amber-300': props.isDirty}"
      >
        <div
          class="flex items-center gap-1.5"
          :title="dmMessage"
        >
          <StatusIndicator
            :status="dmStatus"
            :size="12"
          />
          <span class="text-xs font-bold text-slate-600 max-w-[80px] truncate">{{
            dmStatus === 'connected' ? '设备' : '无设备'
          }}</span>
        </div>
        <div class="w-px h-4 bg-slate-200" />
        <div class="flex items-center gap-1.5 min-w-0">
          <StatusIndicator
            :status="rmStatus"
            :size="12"
          />
          <div class="flex items-center gap-1 min-w-0">
            <div
              v-if="props.isDirty"
              class="w-2 h-2 rounded-full bg-amber-500 animate-pulse flex-shrink-0"
              title="文件已修改"
            />
            <div class="min-w-[120px] max-w-[160px]">
              <Dropdown
                :model-value="selectedResourceFile"
                :options="rmFileOptions"
                :disabled="rmStatus !== 'connected' || rmAvailableFilesLen === 0"
                placeholder="未加载资源"
                size="xs"
                @update:model-value="(v: PropertyKey) => {
                  const fileId = String(v)
                  if (fileId === selectedResourceFile) return
                  const rm = resourceManagerRef
                  if (!rm) return
                  const fileObj = rm.findFileById(fileId)
                  if (!fileObj || !fileObj.value) return
                  selectedResourceFile = fileId
                  emit('update:selected-resource-file', fileId)
                  void executeFileSwitch(fileObj.value, fileObj.source)
                }"
              />
            </div>
          </div>
        </div>
        <div class="w-px h-4 bg-slate-200" />
        <div
          class="flex items-center gap-1"
          :title="amMessage"
        >
          <Bot
            :size="14"
            :class="amStatus === 'connected' ? 'text-violet-500' : 'text-slate-400'"
          />
          <StatusIndicator
            :status="amStatus"
            :size="10"
          />
        </div>
        <button
          v-if="props.isDirty"
          :disabled="isSaving"
          class="p-1.5 rounded-full bg-amber-500 hover:bg-amber-600 text-white transition-colors"
          title="保存更改"
          @click="handleSaveNodes"
        >
          <component
            :is="isSaving ? Loader2 : Save"
            :size="12"
            :class="{'animate-spin': isSaving}"
          />
        </button>
        <button
          class="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-blue-500 transition-colors"
          @click="isCollapsed = false"
        >
          <Maximize2 :size="14" />
        </button>
        <button
          class="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-blue-500 transition-colors"
          title="应用设置"
          @click="showAppSettings = true"
        >
          <SettingsIcon :size="14" />
        </button>
        <button
          v-if="hasUnreadAnnouncement"
          class="p-1.5 rounded-full hover:bg-slate-100 text-amber-500 hover:text-amber-600 transition-colors relative"
          title="更新公告"
          @click="showAnnouncement = true"
        >
          <Bell :size="14" />
          <span class="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white animate-pulse" />
        </button>
        <button
          v-else
          class="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-amber-500 transition-colors"
          title="更新公告"
          @click="showAnnouncement = true"
        >
          <Bell :size="14" />
        </button>
      </div>

      <div
        v-else
        class="w-80 bg-white/95 backdrop-blur-md shadow-xl border border-slate-200 rounded-xl overflow-hidden flex flex-col max-h-[90vh] origin-top-right transition-all"
      >
        <div class="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/80 shrink-0">
          <div class="flex items-center gap-2">
            <Settings class="w-4 h-4 text-slate-500" />
            <span class="font-bold text-slate-700 text-sm">系统控制台</span>
            <div
              class="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border transition-colors ml-1"
              :class="{'bg-emerald-50 border-emerald-100 text-emerald-600': systemStatus === 'connected', 'bg-red-50 border-red-100 text-red-500': systemStatus === 'error', 'bg-blue-50 border-blue-100 text-blue-500': systemStatus === 'loading', 'bg-slate-100 border-slate-200 text-slate-400': systemStatus === 'disconnected'}"
            >
              <div
                class="w-1.5 h-1.5 rounded-full"
                :class="{'bg-emerald-500': systemStatus === 'connected', 'bg-red-500': systemStatus === 'error', 'bg-blue-500': systemStatus === 'loading', 'bg-slate-400': systemStatus === 'disconnected'}"
              />
              <span class="font-bold">{{
                systemStatus === 'connected' ? 'ON' : (systemStatus === 'error' ? 'ERR' : (systemStatus === 'loading' ? '...' : 'OFF'))
              }}</span>
            </div>
            <button
              class="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-blue-500 transition-colors"
              @click="fetchSystemState"
            >
              <RefreshCw
                :size="12"
                :class="{'animate-spin': systemStatus === 'loading'}"
              />
            </button>
          </div>
          <div class="flex items-center gap-1">
            <button
              class="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-blue-500 transition-colors"
              title="应用设置"
              @click="showAppSettings = true"
            >
              <SettingsIcon :size="14" />
            </button>
            <button
              v-if="hasUnreadAnnouncement"
              class="p-1 rounded hover:bg-slate-200 text-amber-500 hover:text-amber-600 transition-colors relative"
              title="更新公告"
              @click="showAnnouncement = true"
            >
              <Bell :size="14" />
              <span class="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white animate-pulse" />
            </button>
            <button
              v-else
              class="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-amber-500 transition-colors"
              title="更新公告"
              @click="showAnnouncement = true"
            >
              <Bell :size="14" />
            </button>
            <button
              class="p-1 rounded-md text-slate-400 hover:bg-slate-200"
              @click="isCollapsed = true"
            >
              <Minimize2 :size="16" />
            </button>
          </div>
        </div>

        <div class="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
          <DeviceManager
            ref="deviceManagerRef"
            :is-connected="systemStatus === 'connected'"
            @device-connected="handleDeviceConnected"
          />

          <ResourceManager
            ref="resourceManagerRef"
            :profiles="resourceProfiles"
            :profile-index="selectedProfileIndex"
            :selected-file="selectedResourceFile"
            @file-selected="handleFileSelected"
            @config-changed="handleConfigChanged"
            @update:profile-index="(v) => { selectedProfileIndex = v }"
            @update:selected-file="(v) => { selectedResourceFile = v }"
            @open-settings="showResourceSettings = true"
            @open-create-file="showCreateFileModal = true"
          />

          <AgentManager ref="agentManagerRef" />

          <!-- 调试模块 -->
          <section class="space-y-2">
            <div class="flex items-center justify-between text-xs mb-1">
              <div class="flex items-center gap-1.5 font-bold text-slate-700">
                <Bug
                  :size="14"
                  class="text-amber-500"
                />
                调试模块
              </div>
            </div>
            <div class="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-3 shadow-sm">
              <button
                class="w-full btn-primary bg-amber-500 shadow-amber-100"
                @click="emit('open-debug-panel')"
              >
                <Bug :size="14" />
                打开调试模块
              </button>
            </div>
          </section>
        </div>

        <div
          class="shrink-0 px-4 py-3 bg-slate-50/50 border-t border-slate-100 text-[10px] text-slate-400 flex justify-between items-center"
        >
          <div class="flex gap-2 items-center">
            <span>{{ props.nodeCount }} Nodes</span>
            <span>{{ props.edgeCount }} Edges</span>
            <span
              v-if="props.isDirty"
              class="flex items-center gap-1 text-amber-600 font-medium"
            >
              <div class="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              已修改
            </span>
          </div>
          <div class="flex items-center gap-2">
            <button
              v-if="props.isDirty"
              :disabled="isSaving"
              class="flex items-center gap-1 px-2 py-1 bg-indigo-500 hover:bg-indigo-600 text-white rounded text-[10px] font-bold transition-colors disabled:opacity-50"
              @click="handleSaveNodes"
            >
              <component
                :is="isSaving ? Loader2 : Save"
                :size="10"
                :class="{'animate-spin': isSaving}"
              />
              {{ isSaving ? '保存中...' : '保存' }}
            </button>
            <span class="font-mono font-bold text-slate-300">{{ zoomPercentage }}</span>
          </div>
        </div>
      </div>
    </Transition>

    <ResourceSettingsModal
      :visible="showResourceSettings"
      :profiles="resourceProfiles"
      :current-index="selectedProfileIndex"
      @close="showResourceSettings = false"
      @save="saveResourceSettings"
    />
    <CreateResourceModal
      :visible="showCreateFileModal"
      :paths="currentProfile.paths"
      @close="showCreateFileModal = false"
      @create="handleCreateFile"
    />
    <AppSettingsModal
      :visible="showAppSettings"
      :default-edge-type="props.edgeType"
      :default-spacing="props.spacing"
      :default-layout-algorithm="props.layoutAlgorithm"
      :default-layout-direction="props.layoutDirection"
      :default-pipeline-version="pipelineVersion"
      :default-restore-workspace-on-start="props.restoreWorkspaceOnStart"
      :default-low-memory-mode="props.lowMemoryMode"
      @close="showAppSettings = false"
      @save="handleAppSettingsSave"
    />
    <AnnouncementModal
      :visible="showAnnouncement"
      @close="handleAnnouncementClose"
    />
  </div>
</template>

<style scoped>
.fade-scale-enter-active,
.fade-scale-leave-active {
  transition: all 0.3s ease;
}

.fade-scale-enter-from,
.fade-scale-leave-to {
  opacity: 0;
  transform: scale(0.95);
}

.input-base {
  @apply w-full bg-white border border-slate-200 rounded-lg py-2 px-3 text-xs text-slate-600 outline-none transition-all shadow-sm focus:border-indigo-300 focus:ring-2 focus:ring-indigo-50;
}

.btn-primary {
  @apply flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold text-white rounded-lg shadow-sm hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed;
}

.btn-icon {
  @apply p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 hover:border-slate-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed;
}
</style>
