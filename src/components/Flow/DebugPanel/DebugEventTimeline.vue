<script setup lang="ts">
import { computed } from 'vue'
import { MapPin, Activity, Loader2, CheckCircle2, XCircle, MousePointerClick, ScanEye } from 'lucide-vue-next'

export interface NextChild {
  name: string
  status: string
  recognitionStatus?: string
  actionStatus?: string
  reco_id?: string | number | null
  action_id?: string | number | null
  node_id?: string | number | null
  jump_back?: boolean
  anchor?: boolean
  [key: string]: unknown
}

export interface DebugEventRecord {
  recordId: string
  attemptId: string
  taskId: string | number
  name: string
  status: string
  nextList: NextChild[]
  timestamp: number
  completedAt?: number
}

const props = defineProps<{
  events: DebugEventRecord[]
  statusConstants: Record<string, string>
}>()

const emit = defineEmits<{
  (e: 'locate-node', id: string): void
  (e: 'child-click', child: NextChild, event: DebugEventRecord): void
}>()

const sortedEvents = computed(() => [...props.events].sort((a, b) => b.timestamp - a.timestamp))

const formatTime = (ts: number | string) => {
  const d = new Date(ts)
  return d.toLocaleTimeString()
}

const handleLocate = (id: string) => {
  emit('locate-node', id)
}

const handleChildClick = (child: NextChild, item: DebugEventRecord) => {
  emit('child-click', child, item)
}

const statusLabel = (status?: string) => {
  const STATUS = props.statusConstants
  if (status === STATUS.STARTING) return '进行中'
  if (status === STATUS.SUCCEEDED) return '成功'
  if (status === STATUS.FAILED) return '失败'
  return '等待'
}

const getTimelineStatusClass = (status?: string) => {
  const STATUS = props.statusConstants
  if (status === STATUS.STARTING) return 'bg-amber-50 text-amber-600 border-amber-200'
  if (status === STATUS.SUCCEEDED) return 'bg-emerald-50 text-emerald-600 border-emerald-200'
  if (status === STATUS.FAILED) return 'bg-rose-50 text-rose-600 border-rose-200'
  return 'bg-slate-50 text-slate-500 border-slate-200'
}

const getChildStatusClass = (child: NextChild) => {
  const STATUS = props.statusConstants
  const baseClasses = child.jump_back
    ? 'bg-purple-50 text-purple-700 border-purple-200'
    : 'bg-slate-50 text-slate-700 border-slate-200'

  const status = child.status || child.actionStatus || child.recognitionStatus
  let statusClass = ''
  if (!status || status === STATUS.UNKNOWN) {
    statusClass = 'opacity-50'
  } else if (status === STATUS.STARTING) {
    statusClass = 'border-amber-300'
  } else if (status === STATUS.SUCCEEDED) {
    statusClass = child.jump_back ? 'border-purple-300' : 'border-emerald-300'
  } else {
    statusClass = 'border-rose-300'
  }

  return `${baseClasses} ${statusClass}`
}

const getStatusIcon = (status?: string) => {
  const STATUS = props.statusConstants
  if (!status || status === STATUS.UNKNOWN) {
    return { component: Activity, size: 12, class: 'text-slate-400' }
  }
  if (status === STATUS.STARTING) {
    return { component: Loader2, size: 11, class: 'animate-spin text-amber-500' }
  }
  if (status === STATUS.SUCCEEDED) {
    return { component: CheckCircle2, size: 12, class: 'text-emerald-500' }
  }
  return { component: XCircle, size: 12, class: 'text-rose-500' }
}

const getStepStatusClass = (status?: string) => {
  const STATUS = props.statusConstants
  if (!status || status === STATUS.UNKNOWN) return 'bg-white text-slate-400 border-slate-200'
  if (status === STATUS.STARTING) return 'bg-amber-50 text-amber-600 border-amber-200'
  if (status === STATUS.SUCCEEDED) return 'bg-emerald-50 text-emerald-600 border-emerald-200'
  return 'bg-rose-50 text-rose-600 border-rose-200'
}
</script>

<template>
  <div class="flex-1 overflow-y-auto bg-slate-50 p-3 space-y-2 custom-scrollbar min-h-0">
    <div
      v-if="sortedEvents.length === 0"
      class="h-full flex items-center justify-center text-slate-400 text-sm"
    >
      等待调试事件...
    </div>

    <div
      v-for="item in sortedEvents"
      :key="item.recordId || `${item.taskId}-${item.timestamp}`"
      class="bg-white rounded border border-slate-200 p-2.5 space-y-2"
    >
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2 min-w-0">
          <span class="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-xs font-medium">
            #{{ item.taskId }}
          </span>
          <span
            class="px-1.5 py-0.5 rounded border text-xs font-medium"
            :class="getTimelineStatusClass(item.status)"
          >
            {{ statusLabel(item.status) }}
          </span>
          <span class="text-sm font-mono text-slate-700 truncate">{{ item.name }}</span>
          <span class="text-xs text-slate-400 shrink-0">
            {{ formatTime(item.timestamp) }}
            <template v-if="item.completedAt"> - {{ formatTime(item.completedAt) }}</template>
          </span>
        </div>
        <button
          class="px-2 py-1 text-xs rounded text-slate-500 hover:text-slate-700 hover:bg-slate-100 flex items-center gap-1"
          @click="handleLocate(item.name)"
        >
          <MapPin :size="12" />
          定位
        </button>
      </div>
      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="(child, idx) in item.nextList"
          :key="child.name + idx"
          class="px-2 py-1.5 rounded text-xs font-mono border transition-colors flex items-center gap-2 max-w-full"
          :class="getChildStatusClass(child)"
          @click="handleChildClick(child, item)"
        >
          <span class="truncate max-w-[220px]">{{ child.name }}</span>
          <span class="flex items-center gap-1">
            <span
              class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] leading-none"
              :class="getStepStatusClass(child.recognitionStatus || child.status)"
              title="识别状态"
            >
              <ScanEye :size="10" />
              <component
                :is="getStatusIcon(child.recognitionStatus || child.status).component"
                :size="getStatusIcon(child.recognitionStatus || child.status).size"
                :class="getStatusIcon(child.recognitionStatus || child.status).class"
              />
            </span>
            <span
              class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] leading-none"
              :class="getStepStatusClass(child.actionStatus)"
              title="动作状态"
            >
              <MousePointerClick :size="10" />
              <component
                :is="getStatusIcon(child.actionStatus).component"
                :size="getStatusIcon(child.actionStatus).size"
                :class="getStatusIcon(child.actionStatus).class"
              />
            </span>
          </span>
        </button>
      </div>
    </div>
  </div>
</template>
