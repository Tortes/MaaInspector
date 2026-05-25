<script setup lang="ts">
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
      <div class="flex flex-col gap-0.5">
        <span class="text-sm font-medium text-slate-700">{{ detail.child.name }}</span>
        <div class="flex items-center gap-1.5">
          <span class="text-xs text-slate-400">#{{ detail.record.taskId }}</span>
          <span
            v-if="detail.meta?.algorithm"
            class="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-xs"
          >
            {{ detail.meta.algorithm }}
          </span>
          <span
            v-if="detail.meta?.hit !== undefined"
            class="px-1.5 py-0.5 rounded text-xs"
            :class="detail.meta.hit ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'"
          >
            {{ detail.meta.hit ? '命中' : '未命中' }}
          </span>
        </div>
      </div>
      <button
        class="px-2 py-1 rounded border border-slate-200 text-xs text-slate-600 hover:bg-slate-100"
        @click="emit('close')"
      >
        返回
      </button>
    </div>

    <div class="flex-1 overflow-y-auto custom-scrollbar">
      <div class="p-3 space-y-3">
        <div class="text-xs font-medium text-slate-500">调试快照</div>

        <div
          class="relative w-full aspect-[4/5] bg-slate-50 border border-slate-200 rounded overflow-hidden"
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
            class="w-full h-full flex items-center justify-center text-slate-400 text-xs"
          >
            暂无截图
          </div>
        </div>

        <div
          v-if="detail.drawImages && detail.drawImages.length"
          class="grid grid-cols-3 gap-1.5"
        >
          <div
            v-for="(img, idx) in detail.drawImages"
            :key="idx"
            class="relative overflow-hidden rounded border bg-slate-50 h-16 flex items-center justify-center cursor-pointer"
            :class="activeThumbIdx === idx ? 'border-slate-400' : 'border-slate-200 hover:border-slate-300'"
            @click="handleThumbClick(img, idx)"
          >
            <img
              :src="img"
              class="w-full h-full object-contain"
              :alt="`draw-${idx}`"
            >
          </div>
        </div>

        <div v-if="detail.fields.length" class="space-y-2">
          <div class="text-xs font-medium text-slate-500">调试结果</div>
          <div class="grid gap-1.5">
            <div
              v-for="(field, idx) in detail.fields"
              :key="idx"
              class="p-2 rounded border border-slate-200 bg-white group"
            >
              <div class="flex items-center justify-between gap-2 mb-1">
                <div class="text-xs text-slate-500 truncate">
                  {{ field.label }}
                </div>
                <button
                  class="text-xs text-slate-400 opacity-0 group-hover:opacity-100 transition"
                  @click.stop="emit('copy', field.text || '')"
                >
                  复制
                </button>
              </div>
              <div
                v-if="field.raw && typeof field.raw === 'object'"
                class="space-y-0.5 text-xs text-slate-700"
              >
                <div
                  v-for="(val, key) in field.raw"
                  :key="String(key)"
                  class="flex items-start gap-1.5"
                >
                  <span class="text-slate-400 shrink-0">{{ key }}:</span>
                  <span class="font-mono break-all text-slate-700">
                    {{ typeof val === 'object' ? JSON.stringify(val) : String(val) }}
                  </span>
                </div>
              </div>
              <div
                v-else
                class="text-sm text-slate-700 break-words font-mono"
              >
                {{ field.text || '—' }}
              </div>
            </div>
          </div>
        </div>

        <div
          v-if="detail.results && detail.results.length"
          class="space-y-2"
        >
          <div class="text-xs font-medium text-slate-500">识别结果</div>
          <div class="grid gap-1.5">
            <div
              v-for="(res, idx) in detail.results"
              :key="idx"
              class="p-2 rounded border border-slate-200 bg-white group"
            >
              <div class="flex items-center justify-between gap-2 mb-1.5">
                <div class="flex items-center gap-1.5 overflow-hidden">
                  <span class="text-xs font-medium text-slate-700 truncate">{{ res.label }}</span>
                  <span
                    v-for="flag in res.flags || []"
                    :key="flag"
                    class="px-1.5 py-0.5 rounded border text-xs shrink-0"
                    :class="flag === 'best'
                      ? 'bg-amber-50 text-amber-600 border-amber-200'
                      : 'bg-slate-50 text-slate-600 border-slate-200'"
                  >
                    {{ flag }}
                  </span>
                </div>
                <button
                  class="text-xs text-slate-400 opacity-0 group-hover:opacity-100 transition"
                  @click.stop="emit('copy', res.text || '')"
                >
                  复制
                </button>
              </div>
              <pre
                class="text-xs text-slate-700 font-mono whitespace-pre-wrap break-words bg-slate-50 border border-slate-200 rounded p-1.5"
              >{{ res.text || '—' }}</pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
