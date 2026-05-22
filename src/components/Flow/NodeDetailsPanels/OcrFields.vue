<script setup lang="ts">
import { ScanText } from 'lucide-vue-next'
import type { NodeFormMethods } from '../../../utils/nodeLogic'

const props = defineProps<{
  form: NodeFormMethods
}>()

const emit = defineEmits<{
  (e: 'open-picker', field: string, referenceField: string, referenceLabel: string): void
}>()

const { getValue, setValue, getJsonValue, setJsonValue } = props.form

const getInputValue = (event: Event) => (event.target as HTMLInputElement | HTMLTextAreaElement | null)?.value ?? ''
const getChecked = (event: Event) => (event.target as HTMLInputElement | null)?.checked ?? false
</script>

<template>
  <div>
    <div class="space-y-1">
      <label class="text-[10px] font-semibold text-slate-500 uppercase">期望文本</label>
      <div class="flex gap-1">
        <input
          :value="getJsonValue('expected')"
          class="flex-1 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:border-indigo-400"
          placeholder="期望文本或正则"
          @input="setJsonValue('expected', getInputValue($event), true)"
        >
        <button
          class="px-2 bg-purple-50 text-purple-600 border border-purple-200 hover:bg-purple-100 rounded-lg flex items-center justify-center"
          title="OCR 识别取词"
          @click="emit('open-picker', 'expected', 'roi', 'ROI区域')"
        >
          <ScanText :size="12" />
        </button>
      </div>
    </div>
    <div class="grid grid-cols-2 gap-2">
      <div class="space-y-1">
        <label class="text-[10px] font-semibold text-slate-500 uppercase">匹配阈值</label>
        <input
          type="number"
          step="0.1"
          min="0"
          max="1"
          :value="getValue('threshold', 0.3)"
          class="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:border-indigo-400"
          @input="setValue('threshold', parseFloat(getInputValue($event)) || 0.3)"
        >
      </div>
      <div class="space-y-1">
        <label class="text-[10px] font-semibold text-slate-500 uppercase">模型路径</label>
        <input
          :value="getValue('model', '')"
          class="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:border-indigo-400 font-mono"
          placeholder="model/ocr/"
          @input="setValue('model', getInputValue($event))"
        >
      </div>
    </div>
    <div class="space-y-1">
      <label class="text-[10px] font-semibold text-slate-500 uppercase">文本替换</label>
      <input
        :value="getJsonValue('replace')"
        class="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:border-indigo-400 font-mono"
        placeholder="[[&quot;原&quot;,&quot;替&quot;]]"
        @input="setJsonValue('replace', getInputValue($event))"
      >
    </div>
    <label class="inline-flex items-center gap-1.5 cursor-pointer">
      <input
        type="checkbox"
        :checked="getValue('only_rec', false)"
        class="w-3.5 h-3.5 rounded text-indigo-600"
        @change="setValue('only_rec', getChecked($event))"
      >
      <span class="text-[11px] text-slate-600">仅识别</span>
    </label>
  </div>
</template>
