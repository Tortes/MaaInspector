<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import {
  X, Bug, PlayCircle, PauseCircle
} from 'lucide-vue-next'
import { debugApi } from '@/services/api'
import type { FlowNode } from '@/utils/flowTypes'
import DebugNodeSelector from './DebugPanel/DebugNodeSelector.vue'
import DebugEventTimeline from './DebugPanel/DebugEventTimeline.vue'
import DebugDetailPanel from './DebugPanel/DebugDetailPanel.vue'
import ImagePreviewOverlay from './DebugPanel/ImagePreviewOverlay.vue'
import { useDebugPanelState } from '@/composables/useDebugPanelState'
import type { NextChild, DebugEventRecord, NodeStatusPayload } from '@/composables/useDebugPanelState'

const props = defineProps<{
  visible?: boolean
  nodes?: FlowNode[]
  currentFilename?: string
  currentSource?: string
  initialNodeId?: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'locate-node', id: string): void
  (e: 'debug-node', id: string): void
  (e: 'update-node-status', payload: { nodeId: string; status: 'success' | 'error' | 'running' | 'ignored' | null }): void
}>()

const {
  STATUS,
  panelWidth,
  events,
  isStreamRunning,
  previewUrl,
  loadPanelWidth,
  startWidthResize,
  stopWidthResize,
  startPreviewAutoRefresh,
  stopPreviewAutoRefresh,
  startRealtimeStream,
  stopRealtimeStream,
  handlePauseDebug,
  copyText,
  clearEvents
} = useDebugPanelState()

const searchValue = ref('')
const selectedNodeId = ref('')
const previewActiveThumbIdx = ref<number | null>(null)
const fullImagePreview = ref<{ visible: boolean; src: string }>({ visible: false, src: '' })
const selectedDetail = ref<{
  record: DebugEventRecord
  child: NextChild
  mainImage: string
  drawImages: string[]
  fields: Array<{ label: string; text: string; raw: unknown }>
  results: Array<{ label: string; text: string; raw: unknown; flags?: string[] }>
  meta?: {
    algorithm?: string | null
    hit?: boolean
    box?: Record<string, unknown> | null
  }
} | null>(null)

const nodeOptions = computed(() => (props.nodes || []).map(node => ({
  id: node.id,
  label: node.data?.data?.id || node.id
})))

const showPreviewPanel = computed(() => !selectedDetail.value)

const handleOptionSelect = (opt: { id: string }) => {
  searchValue.value = opt.id
  selectedNodeId.value = opt.id
}

const handleDebugNow = () => {
  const targetId = (searchValue.value || selectedNodeId.value || '').trim()
  if (!targetId) return
  emit('debug-node', targetId)
}

const handleLocate = (id: string) => {
  const targetId = id || selectedNodeId.value || searchValue.value
  if (targetId) emit('locate-node', targetId)
}

const handleResetStream = () => {
  clearEvents()
  selectedDetail.value = null
  if (isStreamRunning.value) {
    startRealtimeStream(
      (payload: NodeStatusPayload) => emit('update-node-status', payload),
      props.nodes
    )
  }
}

const handleActionButton = async () => {
  handleDebugNow()
}

interface DetailChild {
  name?: string
  status?: string
  jump_back?: boolean
  debug_image?: string
  image?: string
  screenshot?: string
  draw_images?: string[]
  detailList?: Array<{ label: string; text: string; raw: unknown }>
  details?: Array<{ label: string; text: string; raw: unknown }>
  [key: string]: unknown
}

interface RecoDetail {
  raw_image?: string
  debug_image?: string
  image?: string
  draw_images?: unknown[]
  algorithm?: string
  hit?: boolean
  box?: Record<string, unknown> | null
  all_results?: unknown[]
  filtered_results?: unknown[]
  best_result?: unknown
  [key: string]: unknown
}

const normalizeDetailFields = (child: DetailChild | null | undefined) => {
  if (!child) return []
  if (Array.isArray(child.detailList)) return child.detailList
  if (Array.isArray(child.details)) return child.details
  const skipKeys = [
    'name', 'status', 'jump_back', 'debug_image', 'image', 'screenshot',
    'draw_images', 'raw_image', 'raw_detail', 'all_results', 'filtered_results', 'best_result'
  ]
  return Object.entries(child)
    .filter(([k]) => !skipKeys.includes(k))
    .map(([label, value]) => {
      let text = ''
      if (typeof value === 'object') {
        try {
          text = JSON.stringify(value, null, 2)
        } catch (_) {
          text = String(value ?? '')
        }
      } else {
        text = String(value ?? '')
      }
      return { label, text, raw: value }
    })
}

const handleChildClick = async (child: NextChild, item: DebugEventRecord) => {
  if (child.status !== STATUS.SUCCEEDED && child.status !== STATUS.FAILED) return
  let mainImage =
    (typeof child.debug_image === 'string' && child.debug_image) ||
    (typeof child.image === 'string' && child.image) ||
    (typeof child.screenshot === 'string' && child.screenshot) ||
    ''
  let drawImages: string[] = []
  let fields = normalizeDetailFields(child)
  let meta: { algorithm?: string; hit?: boolean; box?: Record<string, unknown> | null } | undefined
  let results: Array<{ label: string; text: string; raw: unknown; flags?: string[] }> = []

  if (child.reco_id !== undefined && child.reco_id !== null) {
    try {
      const res = await debugApi.getRecoDetails(child.reco_id)
      const detail = (res as Record<string, unknown>)?.detail as RecoDetail | undefined
      if (detail) {
        const rawImage = typeof detail.raw_image === 'string' ? detail.raw_image : ''
        const debugImage = typeof detail.debug_image === 'string' ? detail.debug_image : ''
        const imageField = typeof detail.image === 'string' ? detail.image : ''
        const fallback = mainImage
        mainImage = rawImage || debugImage || imageField || fallback
        if (Array.isArray(detail.draw_images)) {
          drawImages = detail.draw_images.filter((x: unknown): x is string => typeof x === 'string')
          if (!mainImage && drawImages.length) mainImage = drawImages[0]
        }
        meta = {
          algorithm: detail.algorithm ?? undefined,
          hit: typeof detail.hit === 'boolean' ? detail.hit : undefined,
          box: detail.box ?? undefined
        }
        const detailFields = normalizeDetailFields(detail as DetailChild)
        if (detailFields.length) {
          fields = [...fields, ...detailFields]
        }

        const allList = Array.isArray(detail.all_results) ? detail.all_results : []
        const filteredList = Array.isArray(detail.filtered_results) ? detail.filtered_results : []
        const bestItem = detail.best_result

        const keyOf = (item: unknown) => {
          try {
            return JSON.stringify(item)
          } catch (_) {
            return String(item)
          }
        }

        const filteredSet = new Set(filteredList.map(keyOf))
        const bestKey = bestItem ? keyOf(bestItem) : null

        const markFlags = (item: unknown) => {
          const k = keyOf(item)
          const flags: string[] = []
          if (bestKey && k === bestKey) flags.push('best')
          if (filteredSet.has(k)) flags.push('filtered')
          return flags
        }

        const merged = allList.length ? allList : (bestItem ? [bestItem] : filteredList)
        merged.forEach((item: unknown, idx: number) => {
          const flags = markFlags(item)
          const label = `all[${idx}]`
          let text = ''
          try {
            text = JSON.stringify(item, null, 2)
          } catch (_) {
            text = String(item)
          }
          results.push({ label, text, raw: item, flags })
        })

        if (bestItem && !allList.length && merged.indexOf(bestItem) === -1) {
          let text = ''
          try {
            text = JSON.stringify(bestItem, null, 2)
          } catch (_) {
            text = String(bestItem)
          }
          results.push({ label: 'best_result', text, raw: bestItem, flags: ['best'] })
        }
      }
    } catch (err) {
      console.warn('[DebugPanel] 获取识别详情失败', err)
    }
  }

  selectedDetail.value = {
    record: item,
    child,
    mainImage,
    drawImages,
    fields,
    results,
    meta
  }
  previewActiveThumbIdx.value = null
}

const handleDetailClose = () => {
  selectedDetail.value = null
  previewActiveThumbIdx.value = null
  closeImagePreview()
}

const handleThumbClick = (img: string, idx: number) => {
  if (!selectedDetail.value) return
  selectedDetail.value = { ...selectedDetail.value, mainImage: img }
  previewActiveThumbIdx.value = idx
}

const openImagePreview = (src: string) => {
  if (!src) return
  fullImagePreview.value = { visible: true, src }
}

const closeImagePreview = () => {
  fullImagePreview.value = { visible: false, src: '' }
}

watch(() => props.visible, (val) => {
  if (val) {
    panelWidth.value = loadPanelWidth()
    selectedNodeId.value = props.initialNodeId || ''
    searchValue.value = props.initialNodeId || ''
    startPreviewAutoRefresh()
    startRealtimeStream(
      (payload: NodeStatusPayload) => emit('update-node-status', payload),
      props.nodes
    )
  } else {
    stopPreviewAutoRefresh()
    stopRealtimeStream()
  }
})

watch(() => props.initialNodeId, (val) => {
  if (props.visible && val) {
    selectedNodeId.value = val
    searchValue.value = val
  }
})

onUnmounted(() => {
  stopWidthResize()
  stopRealtimeStream()
  stopPreviewAutoRefresh()
})
</script>

<template>
  <transition
    enter-active-class="transition ease-out duration-200"
    enter-from-class="translate-x-full opacity-0"
    enter-to-class="translate-x-0 opacity-100"
    leave-active-class="transition ease-in duration-150"
    leave-from-class="translate-x-0 opacity-100"
    leave-to-class="translate-x-full opacity-0"
  >
    <div
      v-if="visible"
      class="fixed right-0 top-0 bottom-0 z-[120] bg-white shadow-2xl border-l border-slate-200 overflow-hidden select-none flex flex-col"
      :style="{ width: `${panelWidth}px` }"
      @mousedown.stop
    >
      <div
        class="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-amber-400/60 z-[130] transition-colors"
        title="拖动调整调试面板宽度"
        @mousedown.stop="startWidthResize"
      />
      <div
        class="flex items-center justify-between px-3 py-2 bg-white border-b border-slate-200 shrink-0"
      >
        <div class="flex items-center gap-2">
          <Bug
            :size="15"
            class="text-slate-600"
          />
          <span class="font-medium text-slate-700 text-sm">调试</span>
          <span
            v-if="currentFilename"
            class="text-xs text-slate-400 truncate max-w-[200px]"
          >{{ currentFilename }}</span>
        </div>
        <button
          class="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600"
          @click.stop="$emit('close')"
        >
          <X :size="15" />
        </button>
      </div>

      <div class="flex flex-1 min-h-0">
        <div
          v-if="showPreviewPanel"
          class="w-[220px] bg-slate-50 border-r border-slate-200 flex flex-col shrink-0"
        >
          <div class="p-2 border-b border-slate-200">
            <div class="relative w-full aspect-[4/5] bg-white border border-slate-200 rounded overflow-hidden">
              <img
                v-if="previewUrl"
                :src="previewUrl"
                alt="preview"
                class="w-full h-full object-contain"
              >
              <div
                v-else
                class="w-full h-full flex items-center justify-center text-slate-400 text-xs"
              >
                无预览
              </div>
            </div>
          </div>
        </div>

        <div class="flex-1 flex flex-col min-h-0 w-0">
          <div class="p-2 border-b border-slate-200 bg-white flex items-center gap-2 shrink-0">
            <DebugNodeSelector
              v-model="searchValue"
              :options="nodeOptions"
              placeholder="节点 ID..."
              @select="handleOptionSelect"
              @submit="handleDebugNow"
            />
            <button
              class="flex items-center gap-1 px-2.5 py-1.5 rounded text-white text-xs font-medium bg-slate-700 hover:bg-slate-800 transition-colors shrink-0"
              @click="handleActionButton"
            >
              <PlayCircle :size="14" />
              <span>调试</span>
            </button>
            <button
              class="flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 shrink-0"
              @click="handlePauseDebug"
            >
              <PauseCircle :size="14" />
              <span>暂停</span>
            </button>
            <button
              class="px-2 py-1.5 rounded text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-100 ml-auto shrink-0"
              @click="handleResetStream"
            >
              清空
            </button>
          </div>

          <DebugEventTimeline
            :events="events"
            :status-constants="STATUS"
            @locate-node="handleLocate"
            @child-click="handleChildClick"
          />
        </div>

        <transition name="detail-slide">
          <DebugDetailPanel
            v-if="selectedDetail"
            v-model:active-thumb-idx="previewActiveThumbIdx"
            :detail="selectedDetail"
            @close="handleDetailClose"
            @thumb-click="handleThumbClick"
            @image-preview="openImagePreview"
            @copy="copyText"
          />
        </transition>
      </div>
    </div>
  </transition>

  <ImagePreviewOverlay
    :visible="fullImagePreview.visible"
    :src="fullImagePreview.src"
    @close="closeImagePreview"
  />
</template>

<style scoped>
.detail-slide-enter-active,
.detail-slide-leave-active {
  transition: all 180ms ease;
}
.detail-slide-enter-from,
.detail-slide-leave-to {
  opacity: 0;
  transform: translateX(12px);
}
</style>
