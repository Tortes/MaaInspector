<script setup lang="ts">
import type { NodeFormMethods } from '../../../utils/nodeLogic'

const props = defineProps<{
  currentRecognition: string
  form: NodeFormMethods
}>()

const { getValue, setValue, getJsonValue, setJsonValue } = props.form

const getInputValue = (event: Event) => (event.target as HTMLInputElement | HTMLTextAreaElement | null)?.value ?? ''
</script>

<template>
  <div>
    <div class="space-y-1">
      <label class="text-[10px] font-semibold text-slate-500 uppercase">模型路径</label>
      <input
        :value="getValue('model', '')"
        class="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:border-indigo-400 font-mono"
        :placeholder="currentRecognition === 'NeuralNetworkClassify' ? 'model/classify/' : 'model/detect/'"
        @input="setValue('model', getInputValue($event))"
      >
    </div>
    <div class="grid grid-cols-2 gap-2">
      <div class="space-y-1">
        <label class="text-[10px] font-semibold text-slate-500 uppercase">期望标签 ID</label>
        <input
          :value="getJsonValue('expected')"
          class="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:border-indigo-400 font-mono"
          placeholder="0 或 [0,1,2]"
          @input="setJsonValue('expected', getInputValue($event), true)"
        >
      </div>
      <div
        v-if="currentRecognition === 'NeuralNetworkDetect'"
        class="space-y-1"
      >
        <label class="text-[10px] font-semibold text-slate-500 uppercase">匹配阈值</label>
        <input
          :value="getJsonValue('threshold')"
          class="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:border-indigo-400"
          placeholder="0.3 或 [0.5, 0.6]"
          @input="setJsonValue('threshold', getInputValue($event))"
        >
      </div>
    </div>
    <div class="space-y-1">
      <label class="text-[10px] font-semibold text-slate-500 uppercase">标签列表 (Labels)</label>
      <input
        :value="getJsonValue('labels')"
        class="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:border-indigo-400 font-mono"
        placeholder="[&quot;Cat&quot;,&quot;Dog&quot;]"
        @input="setJsonValue('labels', getInputValue($event))"
      >
    </div>
  </div>
</template>
