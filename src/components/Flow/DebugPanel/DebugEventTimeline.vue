<script setup lang="ts">
import { computed } from 'vue'
import { MapPin, Activity, Loader2, CheckCircle2, XCircle } from 'lucide-vue-next'

export interface NextChild {
  name: string
  status: string
  reco_id?: string | null
  jump_back?: boolean
  anchor?: boolean
  [key: string]: unknown
}

export interface DebugEventRecord {
  recordId: string
  taskId: string | number
  name: string
  nextList: NextChild[]
  timestamp: number
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

const getChildStatusClass = (child: NextChild) => {
  const STATUS = props.statusConstants
  const baseClasses = child.jump_back
    ? 'bg-purple-50 text-purple-600 border-purple-100'
    : 'bg-blue-50 text-blue-600 border-blue-100'

  let statusClass = ''
  if (child.status === STATUS.UNKNOWN) {
    statusClass = 'opacity-60'
  } else if (child.status === STATUS.STARTING) {
    statusClass = 'ring-1 ring-amber-200'
  } else if (child.status === STATUS.SUCCEEDED) {
    statusClass = child.jump_back ? 'ring-1 ring-purple-200' : 'ring-1 ring-blue-200'
  } else {
    statusClass = 'ring-1 ring-rose-200'
  }

  return `${baseClasses} ${statusClass}`
}

const getStatusIcon = (child: NextChild) => {
  const STATUS = props.statusConstants
  if (child.status === STATUS.UNKNOWN) {
    return { component: Activity, size: 14, class: 'text-slate-400' }
  }
  if (child.status === STATUS.STARTING) {
    return { component: Loader2, size: 12, class: 'animate-spin text-amber-600' }
  }
  if (child.status === STATUS.SUCCEEDED) {
    return { component: CheckCircle2, size: 14, class: 'text-emerald-600' }
  }
  return { component: XCircle, size: 14, class: 'text-rose-600' }
}
</script>

<template>
  <div class="flex-1 overflow-y-auto bg-slate-50 p-4 space-y-3 custom-scrollbar min-h-0">
    <div
      v-if="sortedEvents.length === 0"
      class="h-full w-full flex items-center justify-center text-slate-400 text-sm"
    >
      等待调试结果流入...
    </div>

    <div
      v-for="item in sortedEvents"
      :key="item.recordId || `${item.taskId}-${item.timestamp}`"
      class="bg-white rounded-lg border border-slate-200 shadow-sm p-3 space-y-2"
    >
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="px-2 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-semibold border border-amber-100">
            任务 #{{ item.taskId }}
          </span>
          <span class="text-sm font-mono text-slate-700">主节点：{{ item.name }}</span>
          <span class="text-[11px] text-slate-400">时间 {{ formatTime(item.timestamp) }}</span>
        </div>
        <div class="flex items-center gap-2">
          <button
            class="px-2 py-1 text-[12px] rounded bg-blue-50 text-blue-600 border border-blue-100 hover:bg-blue-100 flex items-center gap-1"
            @click="handleLocate(item.name)"
          >
            <MapPin :size="14" /> 定位节点
          </button>
        </div>
      </div>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="(child, idx) in item.nextList"
          :key="child.name + idx"
          class="px-2 py-1 rounded-full text-[12px] font-mono border transition-colors flex items-center gap-2"
          :class="getChildStatusClass(child)"
          @click="handleChildClick(child, item)"
        >
          <span>{{ child.name }}</span>
          <span class="text-[11px] flex items-center gap-1">
            <component
              :is="getStatusIcon(child).component"
              :size="getStatusIcon(child).size"
              :class="getStatusIcon(child).class"
            />
          </span>
        </button>
      </div>
    </div>
  </div>
</template>
