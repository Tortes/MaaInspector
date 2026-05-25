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
    ? 'bg-purple-50 text-purple-700 border-purple-200'
    : 'bg-slate-50 text-slate-700 border-slate-200'

  let statusClass = ''
  if (child.status === STATUS.UNKNOWN) {
    statusClass = 'opacity-50'
  } else if (child.status === STATUS.STARTING) {
    statusClass = 'border-amber-300'
  } else if (child.status === STATUS.SUCCEEDED) {
    statusClass = child.jump_back ? 'border-purple-300' : 'border-emerald-300'
  } else {
    statusClass = 'border-rose-300'
  }

  return `${baseClasses} ${statusClass}`
}

const getStatusIcon = (child: NextChild) => {
  const STATUS = props.statusConstants
  if (child.status === STATUS.UNKNOWN) {
    return { component: Activity, size: 12, class: 'text-slate-400' }
  }
  if (child.status === STATUS.STARTING) {
    return { component: Loader2, size: 11, class: 'animate-spin text-amber-500' }
  }
  if (child.status === STATUS.SUCCEEDED) {
    return { component: CheckCircle2, size: 12, class: 'text-emerald-500' }
  }
  return { component: XCircle, size: 12, class: 'text-rose-500' }
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
        <div class="flex items-center gap-2">
          <span class="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-xs font-medium">
            #{{ item.taskId }}
          </span>
          <span class="text-sm font-mono text-slate-700">{{ item.name }}</span>
          <span class="text-xs text-slate-400">{{ formatTime(item.timestamp) }}</span>
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
          class="px-2 py-1 rounded text-xs font-mono border transition-colors flex items-center gap-1.5"
          :class="getChildStatusClass(child)"
          @click="handleChildClick(child, item)"
        >
          <span>{{ child.name }}</span>
          <component
            :is="getStatusIcon(child).component"
            :size="getStatusIcon(child).size"
            :class="getStatusIcon(child).class"
          />
        </button>
      </div>
    </div>
  </div>
</template>
