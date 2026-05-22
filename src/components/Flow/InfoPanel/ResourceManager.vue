<script setup lang="ts">
import { ref, computed, watch, h } from 'vue'
import { ElMessage } from 'element-plus'
import {
  Database, HardDrive, Settings, RefreshCw, FilePlus, Loader2,
  CheckCircle2, XCircle, Circle
} from 'lucide-vue-next'
import { resourceApi } from '../../../services/api'
import { makeFileId, parseFileId, getFileObjById } from '../../../utils/fileId'
import Dropdown from '../Common/Dropdown.vue'
import type { DropdownOption } from '../Common/Dropdown.vue'
import type { ResourceProfile, ResourceFileInfo } from '../../../services/api'

// 状态指示器组件
const StatusIndicator = {
  props: { status: String, size: { type: Number, default: 16 } },
  setup(props: { status?: string; size: number }) {
    return () => {
      if (props.status === 'connected') return h(CheckCircle2, { size: props.size, class: 'text-emerald-500 fill-emerald-50' })
      if (props.status === 'connecting') return h(Loader2, { size: props.size, class: 'text-blue-500 animate-spin' })
      if (props.status === 'failed') return h(XCircle, { size: props.size, class: 'text-red-500' })
      return h(Circle, { size: props.size, class: 'text-slate-300' })
    }
  }
}

type EditableProfile = ResourceProfile & { paths: string[] }

const props = defineProps<{
  currentFilename?: string
  profiles?: EditableProfile[]
  profileIndex?: number
  selectedFile?: string
}>()

const emit = defineEmits([
  'file-selected',
  'config-changed',
  'update:profiles',
  'update:profileIndex',
  'update:selectedFile',
  'open-settings',
  'open-create-file'
])

// 内部状态 (当 props 未提供时使用)
const internalStatus = ref<'disconnected' | 'connecting' | 'connected' | 'failed'>('disconnected')
const internalMessage = ref('资源未连接')
const internalProfiles = ref<EditableProfile[]>([])
const internalProfileIndex = ref(0)
const internalSelectedFile = ref('')

// 使用 props 或内部状态
const status = computed(() => internalStatus.value)
const message = computed(() => internalMessage.value)
const resourceProfiles = computed<EditableProfile[]>(() => props.profiles ?? internalProfiles.value)
const selectedProfileIndex = computed(() => props.profileIndex ?? internalProfileIndex.value)
const selectedResourceFile = computed(() => props.selectedFile ?? internalSelectedFile.value)

// 本地可变副本 (用于 API 调用结果)
const localProfiles = ref<EditableProfile[]>([])
const localProfileIndex = ref(0)
const localSelectedFile = ref('')
const availableFiles = ref<ResourceFileInfo[]>([])

const currentProfile = computed<EditableProfile>(() =>
  resourceProfiles.value[selectedProfileIndex.value] || { name: 'None', paths: [] } as EditableProfile
)

const findFileById = (id: string) => getFileObjById(id, availableFiles.value)

const profileOptions = computed<DropdownOption[]>(() => {
  if (resourceProfiles.value.length === 0) {
    return [{ label: '无配置...', value: -1, disabled: true }]
  }
  return resourceProfiles.value.map((prof, idx) => ({
    label: prof.name || '未命名配置',
    value: idx
  }))
})

const fileOptions = computed<DropdownOption[]>(() => {
  if (availableFiles.value.length === 0) {
    return [{ label: '配置路径下无文件', value: '', disabled: true }]
  }
  return availableFiles.value.map((file) => ({
    label: file.label,
    value: makeFileId(file.source, file.value)
  }))
})

const normalizeProfiles = (profiles?: ResourceProfile[]): EditableProfile[] =>
  (profiles || []).map(p => ({
    ...p,
    paths: Array.isArray((p as any).paths) ? [...(p as any).paths] : []
  }))

// 加载资源
const handleResourceLoad = async () => {
  try {
    internalStatus.value = 'connecting'
    internalMessage.value = '加载中...'

    const res = await resourceApi.load(currentProfile.value, {
      context: { feature: 'resource', action: 'load', component: 'ResourceManager' }
    })

    const ok = (res as any)?.r ?? (res as any)?.success ?? true
    if (!ok) {
      internalStatus.value = 'failed'
      internalMessage.value = (res as any)?.message || '资源加载失败'
      return
    }

    internalStatus.value = 'connected'
    internalMessage.value = '已就绪'

    if ((res as any).list) {
      availableFiles.value = (res.list || []) as ResourceFileInfo[]
      const curFile = props.selectedFile ?? localSelectedFile.value
      let fileStillExists = curFile ? findFileById(curFile) : null

      if (!fileStillExists && curFile && !curFile.includes('|')) {
        const matchByName = availableFiles.value.find(f => f.value === curFile)
        if (matchByName) {
          const newId = makeFileId(matchByName.source, matchByName.value)
          localSelectedFile.value = newId
          emit('update:selectedFile', newId)
          fileStillExists = matchByName
        }
      }

      if (!curFile || !fileStillExists) {
        if (availableFiles.value.length > 0) {
          const firstFile = availableFiles.value[0]
          if (firstFile.value) {
            const newId = makeFileId(firstFile.source, firstFile.value)
            localSelectedFile.value = newId
            emit('update:selectedFile', newId)
            emit('file-selected', { filename: firstFile.value, source: firstFile.source })
          }
        } else {
          localSelectedFile.value = ''
          emit('update:selectedFile', '')
        }
      } else {
        emit('file-selected', { filename: fileStillExists.value, source: fileStillExists.source })
      }
    }
  } catch (e: unknown) {
    console.error("资源加载流程异常", e)
    internalStatus.value = 'failed'
    internalMessage.value = '加载失败'
  }
}

// 切换文件
const executeFileSwitch = async (filename: string, source?: string) => {
  const normSource = source ? source.replace(/\\/g, '/').toLowerCase() : ''
  let target = availableFiles.value.find((f: ResourceFileInfo) => {
    const fSource = f.source ? f.source.replace(/\\/g, '/').toLowerCase() : ''
    if (source) {
      return f.value === filename && fSource === normSource
    }
    return f.value === filename
  })

  if (target) {
    const newId = makeFileId(target.source, target.value)
    localSelectedFile.value = newId
    emit('update:selectedFile', newId)
    emit('file-selected', { filename: target.value, source: target.source })
  } else {
    ElMessage.error(`无法切换: 未找到文件 ${filename}`)
  }
}

// 处理文件选择变化
const handleFileSelectChange = (newFileId: PropertyKey) => {
  const fileId = String(newFileId)
  const curFile = props.selectedFile ?? localSelectedFile.value
  if (fileId === curFile) return
  const fileObj = findFileById(fileId)
  if (!fileObj || !fileObj.value) return

  localSelectedFile.value = fileId
  emit('update:selectedFile', fileId)
  emit('file-selected', {
    filename: fileObj.value,
    source: fileObj.source
  })
}

// 设置 profiles
const setProfiles = (profiles: EditableProfile[]) => {
  localProfiles.value = profiles
  emit('update:profiles', profiles)
}

const setProfileIndex = (index: number) => {
  localProfileIndex.value = index
  emit('update:profileIndex', index)
}

const setMessage = (msg: string) => {
  internalMessage.value = msg
}

// 暴露方法
defineExpose({
  handleResourceLoad,
  executeFileSwitch,
  setProfiles,
  setProfileIndex,
  normalizeProfiles,
  makeFileId,
  parseFileId,
  findFileById,
  status,
  message,
  setMessage,
  fileOptions,
  currentProfile,
  availableFiles,
  resourceProfiles,
  selectedProfileIndex,
  selectedResourceFile
})

// 配置切换时重新加载
watch(selectedProfileIndex, (nv, ov) => {
  if (nv === ov) return
  emit('config-changed')
  handleResourceLoad()
})
</script>

<template>
  <section class="space-y-2">
    <div class="flex items-center justify-between text-xs mb-1">
      <div class="flex items-center gap-1.5 font-bold text-slate-700">
        <Database
          :size="14"
          class="text-emerald-500"
        />
        资源配置
      </div>
      <StatusIndicator :status="status" />
    </div>
    <div class="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-3 shadow-sm">
      <div class="flex gap-2">
        <Dropdown
          :model-value="selectedProfileIndex"
          :options="profileOptions"
          placeholder="选择资源配置"
          class="flex-1"
          @update:model-value="emit('update:profileIndex', $event); emit('config-changed')"
        />
        <button
          class="btn-icon"
          @click="$emit('open-settings')"
        >
          <Settings :size="16" />
        </button>
      </div>
      <div class="flex gap-2">
        <button
          :disabled="status === 'connecting'"
          class="flex-1 btn-primary bg-emerald-500 shadow-emerald-100"
          @click="handleResourceLoad"
        >
          <component
            :is="status === 'connecting' ? RefreshCw : HardDrive"
            :size="12"
            :class="{'animate-spin': status === 'connecting'}"
          />
          <span>{{ status === 'connected' ? '重新加载' : '加载资源' }}</span>
        </button>
        <button
          :disabled="resourceProfiles.length === 0"
          class="btn-icon px-3"
          @click="$emit('open-create-file')"
        >
          <FilePlus :size="16" />
        </button>
      </div>
      <div
        v-if="status === 'connected'"
        class="animate-in fade-in slide-in-from-top-2"
      >
        <Dropdown
          :model-value="selectedResourceFile"
          :options="fileOptions"
          placeholder="选择文件"
          @update:model-value="handleFileSelectChange"
        />
      </div>
    </div>
  </section>
</template>

<style scoped>
.btn-primary {
  @apply flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold text-white rounded-lg shadow-sm hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed;
}

.btn-icon {
  @apply p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 hover:border-slate-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed;
}
</style>
