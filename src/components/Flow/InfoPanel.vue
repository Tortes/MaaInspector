<script setup lang="ts">
import {computed, ref, onMounted, onUnmounted} from 'vue'
import { ElMessage } from 'element-plus'
import {
  Bot, Settings, RefreshCw, Loader2,
  Minimize2, Maximize2,
  Save, Bell, Settings as SettingsIcon, Bug
} from 'lucide-vue-next'
import {resourceApi} from '@/services/api'
import { useAppConfigStore } from '@/stores/appConfig'
import type { ResourceProfile, ResourceFileInfo } from '@/services/api'
import type { FlowBusinessData, TemplateImage } from '@/utils/flowTypes'
import type { EdgeType } from '@/utils/flowOptions'
import type { SpacingKey, LayoutAlgorithm, LayoutDirection } from '@/utils/flowTypes'
import type { TabResourceInfo } from '@/utils/flowWorkspaceTypes'
import { usePreloadCache } from '@/composables/usePreloadCache'
import { useSystemState } from '@/composables/useSystemState'
import ResourceSettingsModal from './Modals/ResourceSettingsModal.vue'
import CreateResourceModal from './Modals/CreateResourceModal.vue'
import AppSettingsModal from './Modals/AppSettingsModal.vue'
import AnnouncementModal from './Modals/AnnouncementModal.vue'
import DeviceManager from './InfoPanel/DeviceManager.vue'
import ResourceManager from './InfoPanel/ResourceManager.vue'
import AgentManager from './InfoPanel/AgentManager.vue'
import Dropdown from './Common/Dropdown.vue'
import StatusIndicator from './Common/StatusIndicator.vue'

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
  lowMemoryMode?: boolean
  restoreWorkspaceOnStart?: boolean
}>()

interface FlowTab {
  id: string
  title: string
  resourceFile: string
}

const openedFileIds = computed(() => {
  if (!props.tabs) return []
  return props.tabs
    .filter(tab => tab.resourceFile)
    .map(tab => tab.resourceFile)
})

const emit = defineEmits<{
  'load-nodes': [payload: { filename: string; source: string; nodes: Record<string, FlowBusinessData>; fileVersion?: 'V1' | 'V2' }]
  'load-images': [payload: Record<string, TemplateImage[]>, basePath?: string]
  'save-nodes': [payload: { source: string; filename: string }]
  'device-connected': [status: boolean]
  'update:selected-resource-file': [value: string]
  'update-canvas-config': [payload: { edgeType?: EdgeType; spacing?: SpacingKey; layoutAlgorithm?: LayoutAlgorithm; layoutDirection?: LayoutDirection }]
  'update-pipeline-version': [payload: 'V1' | 'V2']
  'update-low-memory': [payload: boolean]
  'restore-tabs': [tabs: TabResourceInfo[]]
  'clear-tabs': []
  'open-debug-panel': []
}>()

// --- Store & Composables ---
const appConfig = useAppConfigStore()

const systemState = useSystemState((e, payload) => {
  if (e === 'save-nodes') emit('save-nodes', payload)
})

const {
  triggerLoadFromCache,
  handleFileSelected: handleFileSelectedFromCache
} = usePreloadCache({
  tabs: () => props.tabs,
  selectedResourceFile: () => systemState.selectedResourceFile.value,
  resourceManagerRef: () => resourceManagerRef.value,
  emit
})

// --- View state ---
const isCollapsed = ref(false)
const showResourceSettings = ref(false)
const showCreateFileModal = ref(false)
const showAppSettings = ref(false)
const showAnnouncement = ref(false)
const hasUnreadAnnouncement = ref(true)

// --- Child component refs ---
const deviceManagerRef = ref<InstanceType<typeof DeviceManager> | null>(null)
const resourceManagerRef = ref<InstanceType<typeof ResourceManager> | null>(null)
const agentManagerRef = ref<InstanceType<typeof AgentManager> | null>(null)

// --- Sync child state for collapsed template ---
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

// --- Wrapped composable methods ---
const handleSaveNodes = async () => {
  await systemState.handleSaveNodes(resourceManagerRef.value)
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

defineExpose({ executeFileSwitch, handleSaveNodes, triggerLoadFromCache: triggerLoadFromCacheWrapper })

// --- Child component event handlers ---
const handleDeviceConnected = (status: boolean) => {
  emit('device-connected', status)
}

const handleConfigChanged = () => {
  void appConfig.saveToBackend()
}

const handleCreateFile = async ({path, filename}: { path: string; filename: string }) => {
  const rm = resourceManagerRef.value
  if (!rm) return
  try {
    rm.setMessage('创建文件中...')
    await resourceApi.createFile(path, filename)
    showCreateFileModal.value = false
    await rm.handleResourceLoad()
    const simpleName = filename.endsWith('.json') ? filename : filename + '.json'
    const normalizedPath = path.replace(/\\/g, '/').toLowerCase()
    const availFiles = rm.availableFiles as ResourceFileInfo[]
    const newFileObj = availFiles.find(f =>
      f.value === simpleName &&
      f.source?.replace(/\\/g, '/').toLowerCase() === normalizedPath
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

// --- Initialization ---
const handleFetchSystemState = async () => {
  await systemState.fetchSystemState()
}

onMounted(async () => {
  await handleFetchSystemState()
  setTimeout(() => {
    syncChildState()
    syncTimer = setInterval(syncChildState, 200)
  }, 100)
})

onUnmounted(() => {
  if (syncTimer) { clearInterval(syncTimer); syncTimer = null }
})

type EditableProfile = ResourceProfile & { paths: string[] }

const editableProfiles = computed<EditableProfile[]>(() =>
  appConfig.resource.profiles.map(p => ({
    ...p,
    paths: p.paths || []
  }))
)

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
                :model-value="systemState.selectedResourceFile.value"
                :options="rmFileOptions"
                :disabled="rmStatus !== 'connected' || rmAvailableFilesLen === 0"
                placeholder="未加载资源"
                size="xs"
                @update:model-value="(v: PropertyKey) => {
                  const fileId = String(v)
                  if (fileId === systemState.selectedResourceFile.value) return
                  const rm = resourceManagerRef
                  if (!rm) return
                  const fileObj = rm.findFileById(fileId)
                  if (!fileObj || !fileObj.value) return
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
          :disabled="systemState.isSaving.value"
          class="p-1.5 rounded-full bg-amber-500 hover:bg-amber-600 text-white transition-colors"
          title="保存更改"
          @click="handleSaveNodes"
        >
          <component
            :is="systemState.isSaving.value ? Loader2 : Save"
            :size="12"
            :class="{'animate-spin': systemState.isSaving.value}"
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
              :class="{'bg-emerald-50 border-emerald-100 text-emerald-600': appConfig.system.status === 'connected', 'bg-red-50 border-red-100 text-red-500': appConfig.system.status === 'error', 'bg-blue-50 border-blue-100 text-blue-500': appConfig.system.status === 'loading', 'bg-slate-100 border-slate-200 text-slate-400': appConfig.system.status === 'disconnected'}"
            >
              <div
                class="w-1.5 h-1.5 rounded-full"
                :class="{'bg-emerald-500': appConfig.system.status === 'connected', 'bg-red-500': appConfig.system.status === 'error', 'bg-blue-500': appConfig.system.status === 'loading', 'bg-slate-400': appConfig.system.status === 'disconnected'}"
              />
              <span class="font-bold">{{
                appConfig.system.status === 'connected' ? 'ON' : (appConfig.system.status === 'error' ? 'ERR' : (appConfig.system.status === 'loading' ? '...' : 'OFF'))
              }}</span>
            </div>
            <button
              class="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-blue-500 transition-colors"
              @click="handleFetchSystemState"
            >
              <RefreshCw
                :size="12"
                :class="{'animate-spin': appConfig.system.status === 'loading'}"
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
            :is-connected="appConfig.system.status === 'connected'"
            @device-connected="handleDeviceConnected"
          />

          <ResourceManager
            ref="resourceManagerRef"
            :profiles="editableProfiles"
            :profile-index="appConfig.resource.profileIndex"
            :selected-file="appConfig.resource.selectedFileId"
            :opened-file-ids="openedFileIds"
            :restore-workspace-on-start="props.restoreWorkspaceOnStart"
            @file-selected="handleFileSelected"
            @config-changed="handleConfigChanged"
            @update:profile-index="(v) => appConfig.switchResourceProfile(v)"
            @update:selected-file="(v) => appConfig.selectResourceFile(v)"
            @open-settings="showResourceSettings = true"
            @open-create-file="showCreateFileModal = true"
            @restore-tabs="(tabs) => emit('restore-tabs', tabs)"
            @clear-tabs="emit('clear-tabs')"
          />

          <AgentManager ref="agentManagerRef" />

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
              :disabled="systemState.isSaving.value"
              class="flex items-center gap-1 px-2 py-1 bg-indigo-500 hover:bg-indigo-600 text-white rounded text-[10px] font-bold transition-colors disabled:opacity-50"
              @click="handleSaveNodes"
            >
              <component
                :is="systemState.isSaving.value ? Loader2 : Save"
                :size="10"
                :class="{'animate-spin': systemState.isSaving.value}"
              />
              {{ systemState.isSaving.value ? '保存中...' : '保存' }}
            </button>
            <span class="font-mono font-bold text-slate-300">{{ Math.round((props.zoom || 1) * 100) }}%</span>
          </div>
        </div>
      </div>
    </Transition>

    <ResourceSettingsModal
      :visible="showResourceSettings"
      :profiles="editableProfiles"
      :current-index="appConfig.resource.profileIndex"
      @close="showResourceSettings = false"
      @save="saveResourceSettings"
    />
    <CreateResourceModal
      :visible="showCreateFileModal"
      :paths="appConfig.currentProfile.paths ?? []"
      @close="showCreateFileModal = false"
      @create="handleCreateFile"
    />
    <AppSettingsModal
      :visible="showAppSettings"
      :default-edge-type="props.edgeType"
      :default-spacing="props.spacing"
      :default-layout-algorithm="props.layoutAlgorithm"
      :default-layout-direction="props.layoutDirection"
      :default-pipeline-version="appConfig.canvas.pipelineVersion"
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
