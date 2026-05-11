<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import {
  Database, HardDrive, Settings, RefreshCw, FilePlus, Loader2,
  CheckCircle2, XCircle, Circle
} from 'lucide-vue-next'
import { resourceApi } from '../../../services/api'
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

import { h } from 'vue'

type EditableProfile = ResourceProfile & { paths: string[] }

defineProps<{
  currentFilename?: string
  currentSource?: string
}>()

const emit = defineEmits<{
  'load-nodes': [payload: { filename: string; source: string }]
  'load-images': [payload: Record<string, unknown>]
  'request-switch-file': [payload: { filename: string; source: string }]
}>()

// 状态
const status = ref<'disconnected' | 'connecting' | 'connected' | 'failed'>('disconnected')
const message = ref('资源未连接')

// 资源配置
const resourceProfiles = ref<EditableProfile[]>([])
const selectedProfileIndex = ref(0)
const selectedResourceFile = ref('')
const availableFiles = ref<ResourceFileInfo[]>([])

// 弹窗状态
const showResourceSettings = ref(false)
const showCreateFileModal = ref(false)

// 当前配置
const currentProfile = computed<EditableProfile>(() => 
  resourceProfiles.value[selectedProfileIndex.value] || { name: 'None', paths: [] }
)

// 工具函数
const makeFileId = (source: string, filename: string | null) => `${source}|${filename ?? ''}`
const parseFileId = (id: string) => {
  if (!id) return { source: '', filename: '' }
  const sepIndex = id.lastIndexOf('|')
  if (sepIndex === -1) return { source: '', filename: id }
  return { source: id.slice(0, sepIndex), filename: id.slice(sepIndex + 1) }
}
const getFileObjById = (id: string) => availableFiles.value.find((f: ResourceFileInfo) => makeFileId(f.source, f.value) === id)

// 下拉框选项
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

// 规范化配置
const normalizeProfiles = (profiles?: ResourceProfile[]): EditableProfile[] =>
  (profiles || []).map(p => ({
    ...p,
    paths: Array.isArray((p as any).paths) ? [...(p as any).paths] : []
  }))

// 加载资源
const handleResourceLoad = async () => {
  try {
    status.value = 'connecting'
    message.value = '加载中...'

    const res = await resourceApi.load(currentProfile.value, {
      context: { feature: 'resource', action: 'load', component: 'ResourceManager' }
    })

    const ok = (res as any)?.r ?? (res as any)?.success ?? true
    if (!ok) {
      status.value = 'failed'
      message.value = (res as any)?.message || '资源加载失败'
      return
    }

    status.value = 'connected'
    message.value = '已就绪'

    if ((res as any).list) {
      availableFiles.value = (res.list || []) as ResourceFileInfo[]
      let fileStillExists = selectedResourceFile.value ? getFileObjById(selectedResourceFile.value) : null

      if (!fileStillExists && selectedResourceFile.value && !selectedResourceFile.value.includes('|')) {
        const matchByName = availableFiles.value.find(f => f.value === selectedResourceFile.value)
        if (matchByName) {
          selectedResourceFile.value = makeFileId(matchByName.source, matchByName.value)
          fileStillExists = matchByName
        }
      }

      if (!selectedResourceFile.value || !fileStillExists) {
        if (availableFiles.value.length > 0) {
          const firstFile = availableFiles.value[0]
          if (firstFile.value) {
            await executeFileSwitch(firstFile.value, firstFile.source)
          }
        } else {
          selectedResourceFile.value = ''
        }
      } else {
        await fetchAndEmitNodes()
      }
    }
  } catch (e: any) {
    console.error("资源加载流程异常", e)
    status.value = 'failed'
    message.value = '加载失败'
  }
}

// 获取并发送节点数据
const fetchAndEmitNodes = async () => {
  if (!selectedResourceFile.value) return
  const fileObj = getFileObjById(selectedResourceFile.value)
  if (!fileObj || !fileObj.value) return

  try {
    message.value = '加载节点中...'
    const res = await resourceApi.getFileNodes<Record<string, unknown>>(fileObj.source, fileObj.value, {
      context: { feature: 'resource', action: 'get_nodes', component: 'ResourceManager' }
    })
    const nodes = res.nodes || {}

    emit('load-nodes', { filename: fileObj.value, source: fileObj.source })
    message.value = `已加载: ${Object.keys(nodes).length} 节点`

    try {
      const imgRes = await resourceApi.getTemplateImages(fileObj.source, fileObj.value, {
        context: { feature: 'resource', action: 'get_templates', component: 'ResourceManager' }
      })
      if (imgRes.results) emit('load-images', imgRes.results as Record<string, unknown>)
    } catch (imgError) {
      console.warn("图片加载失败", imgError)
    }
  } catch (e: any) {
    console.error("加载节点失败", e)
    message.value = '节点加载失败'
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
    selectedResourceFile.value = makeFileId(target.source, target.value)
    await fetchAndEmitNodes()
  } else {
    alert(`无法切换: 未找到文件 ${filename}`)
  }
}

// 处理文件选择变化
const handleFileSelectChange = (newFileId: string) => {
  if (newFileId === selectedResourceFile.value) return
  const fileObj = getFileObjById(newFileId)
  if (!fileObj || !fileObj.value) return

  emit('request-switch-file', {
    filename: fileObj.value,
    source: fileObj.source
  })
}

// 暴露方法
defineExpose({
  handleResourceLoad,
  executeFileSwitch,
  resourceProfiles,
  selectedProfileIndex,
  selectedResourceFile,
  availableFiles,
  normalizeProfiles,
  makeFileId,
  parseFileId,
  getFileObjById,
  status,
  message
})

// 配置切换时重新加载
watch(selectedProfileIndex, () => handleResourceLoad())
</script>

<template>
  <section class="space-y-2">
    <div class="flex items-center justify-between text-xs mb-1">
      <div class="flex items-center gap-1.5 font-bold text-slate-700">
        <Database :size="14" class="text-emerald-500"/>
        资源配置
      </div>
      <StatusIndicator :status="status"/>
    </div>
    <div class="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-3 shadow-sm">
      <div class="flex gap-2">
        <Dropdown
          v-model="selectedProfileIndex"
          :options="profileOptions"
          placeholder="选择资源配置"
          class="flex-1"
        />
        <button @click="showResourceSettings = true" class="btn-icon">
          <Settings :size="16"/>
        </button>
      </div>
      <div class="flex gap-2">
        <button @click="handleResourceLoad" :disabled="status === 'connecting'"
                class="flex-1 btn-primary bg-emerald-500 shadow-emerald-100">
          <component :is="status === 'connecting' ? RefreshCw : HardDrive" :size="12"
                     :class="{'animate-spin': status === 'connecting'}"/>
          <span>{{ status === 'connected' ? '重新加载' : '加载资源' }}</span>
        </button>
        <button @click="showCreateFileModal = true" :disabled="resourceProfiles.length === 0"
                class="btn-icon px-3">
          <FilePlus :size="16"/>
        </button>
      </div>
      <div v-if="status === 'connected'" class="animate-in fade-in slide-in-from-top-2">
        <Dropdown
          :model-value="selectedResourceFile"
          @update:model-value="handleFileSelectChange"
          :options="fileOptions"
          placeholder="选择文件"
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
