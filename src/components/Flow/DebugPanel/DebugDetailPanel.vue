<script setup lang="ts">
import { Bug, Terminal, Activity } from 'lucide-vue-next'

export interface DetailField {
  label: string
  text: string
  raw: unknown
}

export interface DetailResult {
  label: string
  text: string
  raw: unknown
  flags?: string[]
}

export interface DetailMeta {
  algorithm?: string | null
  hit?: boolean
  box?: Record<string, unknown> | null
}

export interface NextChild {
  name?: string
  status?: string
  jump_back?: boolean
  debug_image?: string
  image?: string
  screenshot?: string
  draw_images?: string[]
  detailList?: DetailField[]
  details?: DetailField[]
  [key: string]: unknown
}

export interface DebugEventRecord {
  recordId: string
  taskId: string | number
  name: string
  nextList: NextChild[]
  timestamp: number
}

export interface DetailData {
  record: DebugEventRecord
  child: NextChild
  mainImage: string
  drawImages: string[]
  fields: DetailField[]
  results: DetailResult[]
  meta?: DetailMeta
}

const props = defineProps<{
  detail: DetailData
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'thumb-click', img: string, idx: number): void
  (e: 'image-preview', src: string): void
  (e: 'copy', text: string): void
}>()

const activeThumbIdx = defineModel<number | null>('activeThumbIdx', { default: null })

const handleThumbClick = (img: string, idx: number) => {
  emit('thumb-click', img, idx)
}

const handleImageClick = () => {
  if (props.detail.mainImage) {
    emit('image-preview', props.detail.mainImage)
  }
}
</script>

<template>
  <div class="w-[320px] border-l border-slate-200 bg-white flex flex-col min-h-0 shrink-0">
    <div class="flex items-center justify-between px-3 py-2 border-b border-slate-200 bg-slate-50">
      <div class="flex flex-col">
        <span class="text-sm font-semibold text-slate-700">{{ detail.child.name }}</span>
        <span class="text-[11px] text-slate-500">任务 #{{ detail.record.taskId }}</span>
        <div
          v-if="detail.meta"
          class="flex items-center gap-2 pt-1"
        >
          <span
            v-if="detail.meta.algorithm"
            class="px-2 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-100 text-[11px]"
          >
            算法 {{ detail.meta.algorithm }}
          </span>
          <span
            v-if="detail.meta.hit !== undefined"
            class="px-2 py-0.5 rounded text-[11px] border"
            :class="detail.meta.hit ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-rose-50 text-rose-700 border-rose-100'"
          >
            {{ detail.meta.hit ? '命中' : '未命中' }}
          </span>
        </div>
      </div>
      <button
        class="px-2 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-100"
        @click="emit('close')"
      >
        返回
      </button>
    </div>

    <div class="flex-1 overflow-y-auto custom-scrollbar">
      <div class="p-3 space-y-3">
        <div class="text-xs text-slate-500 font-semibold flex items-center gap-2">
          <Activity
            :size="14"
            class="text-amber-500"
          /> 调试快照
          <span
            v-if="detail.meta?.box"
            class="text-[11px] text-slate-400"
          >
            Box: {{ JSON.stringify(detail.meta.box) }}
          </span>
        </div>

        <div
          class="relative w-full aspect-[4/5] bg-slate-50 border border-dashed border-slate-200 rounded-lg overflow-hidden flex items-center justify-center"
          :class="detail.mainImage ? 'cursor-zoom-in' : ''"
          @click="handleImageClick"
        >
          <img
            v-if="detail.mainImage"
            :src="detail.mainImage"
            alt="debug detail"
            class="w-full h-full object-contain"
          >
          <div
            v-else
            class="text-xs text-slate-400 flex flex-col items-center gap-1"
          >
            <Bug
              :size="18"
              class="text-amber-500"
            />
            <span>暂无调试截图</span>
          </div>
        </div>

        <div
          v-if="detail.drawImages && detail.drawImages.length"
          class="grid grid-cols-3 gap-2"
        >
          <div
            v-for="(img, idx) in detail.drawImages"
            :key="idx"
            class="relative overflow-hidden rounded border bg-slate-50 h-20 flex items-center justify-center cursor-pointer transition"
            :class="activeThumbIdx === idx ? 'border-amber-300 ring-2 ring-amber-100' : 'border-slate-200 hover:border-amber-200'"
            @click="handleThumbClick(img, idx)"
          >
            <img
              :src="img"
              class="w-full h-full object-contain"
              :alt="`draw-${idx}`"
            >
          </div>
        </div>

        <div class="text-xs text-slate-500 font-semibold flex items-center gap-2 pt-2">
          <Terminal
            :size="14"
            class="text-amber-500"
          /> 调试结果
        </div>

        <div
          class="grid gap-2"
          style="grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));"
        >
          <div
            v-for="(field, idx) in detail.fields"
            :key="idx"
            class="p-2 rounded border border-slate-200 bg-white shadow-sm group relative"
          >
            <div class="flex items-center justify-between gap-2">
              <div class="text-[11px] text-slate-500 truncate">
                {{ field.label }}
              </div>
              <button
                class="text-[11px] text-amber-600 opacity-0 group-hover:opacity-100 transition"
                @click.stop="emit('copy', field.text || '')"
              >
                复制
              </button>
            </div>
            <div
              v-if="field.raw && typeof field.raw === 'object'"
              class="space-y-1 text-[12px] text-slate-700"
            >
              <div
                v-for="(val, key) in field.raw"
                :key="String(key)"
                class="flex items-start gap-2"
              >
                <span class="text-slate-500">{{ key }}:</span>
                <span class="font-mono break-all whitespace-pre-wrap text-slate-800">
                  {{ typeof val === 'object' ? JSON.stringify(val) : String(val) }}
                </span>
                <button
                  class="text-[10px] text-amber-600 opacity-0 group-hover:opacity-100 transition ml-auto"
                  @click.stop="emit('copy', typeof val === 'object' ? JSON.stringify(val) : String(val))"
                >
                  复制
                </button>
              </div>
            </div>
            <div
              v-else
              class="text-sm text-slate-700 break-words whitespace-pre-wrap flex items-start gap-2"
            >
              <span class="font-mono break-all">{{ field.text || '—' }}</span>
              <button
                class="text-[11px] text-amber-600 opacity-0 group-hover:opacity-100 transition ml-auto"
                @click.stop="emit('copy', field.text || '')"
              >
                复制
              </button>
            </div>
          </div>
          <div
            v-if="!detail.fields || detail.fields.length === 0"
            class="text-xs text-slate-400"
          >
            暂无可显示的调试结果。
          </div>
        </div>

        <div
          v-if="detail.results && detail.results.length"
          class="pt-3 space-y-3"
        >
          <div class="text-xs text-slate-500 font-semibold flex items-center gap-2">
            <Activity
              :size="14"
              class="text-amber-500"
            /> 识别结果列表
          </div>
          <div
            class="grid gap-2"
            style="grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));"
          >
            <div
              v-for="(res, idx) in detail.results"
              :key="idx"
              class="p-3 rounded border border-slate-200 bg-white shadow-sm group"
            >
              <div class="flex items-center justify-between gap-2 mb-2">
                <div class="flex items-center gap-2 overflow-hidden">
                  <span class="text-[12px] font-semibold text-slate-700 truncate">{{ res.label }}</span>
                  <div class="flex items-center gap-1">
                    <span
                      v-for="flag in res.flags || []"
                      :key="flag"
                      class="px-2 py-0.5 rounded-full border text-[11px] font-semibold whitespace-nowrap"
                      :class="flag === 'best'
                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : 'bg-sky-50 text-sky-700 border-sky-200'"
                    >
                      {{ flag }}
                    </span>
                  </div>
                </div>
                <button
                  class="text-[11px] text-amber-600 opacity-0 group-hover:opacity-100 transition"
                  @click.stop="emit('copy', res.text || '')"
                >
                  复制
                </button>
              </div>
              <div
                v-if="res.raw && typeof res.raw === 'object'"
                class="space-y-1 text-[12px] text-slate-700"
              >
                <div
                  v-for="(val, key) in res.raw"
                  :key="String(key)"
                  class="flex items-start gap-2"
                >
                  <span class="text-slate-500">{{ key }}:</span>
                  <span class="font-mono break-all whitespace-pre-wrap text-slate-800">
                    {{ typeof val === 'object' ? JSON.stringify(val) : String(val) }}
                  </span>
                  <button
                    class="text-[10px] text-amber-600 opacity-0 group-hover:opacity-100 transition ml-auto"
                    @click.stop="emit('copy', typeof val === 'object' ? JSON.stringify(val) : String(val))"
                  >
                    复制
                  </button>
                </div>
              </div>
              <pre
                v-else
                class="text-[12px] text-slate-800 font-mono whitespace-pre-wrap break-words bg-slate-50 border border-slate-200 rounded p-2 flex items-start gap-2"
              >
                <span>{{ res.text || '—' }}</span>
                <button
                  class="text-[11px] text-amber-600 opacity-0 group-hover:opacity-100 transition ml-auto"
                  @click.stop="emit('copy', res.text || '')"
                >复制</button>
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
