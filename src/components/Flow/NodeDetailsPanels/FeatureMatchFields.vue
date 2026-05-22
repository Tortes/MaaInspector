<script setup lang="ts">
import { ref } from 'vue'
import { ChevronDown } from 'lucide-vue-next'
import { detectorOptions } from '../../../utils/nodeLogic'
import type { NodeFormMethods } from '../../../utils/nodeLogic'

const props = defineProps<{
  form: NodeFormMethods
}>()

const { getValue, setValue } = props.form

const getInputValue = (event: Event) => (event.target as HTMLInputElement | HTMLTextAreaElement | null)?.value ?? ''

const isDetectorDropdownOpen = ref(false)

const selectDetector = (val: string) => {
  setValue('detector', val)
  isDetectorDropdownOpen.value = false
}
</script>

<template>
  <div class="grid grid-cols-3 gap-2">
    <div class="space-y-1">
      <label class="text-[10px] font-semibold text-slate-500 uppercase">特征点数</label>
      <input
        type="number"
        min="1"
        :value="getValue('count', 4)"
        class="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:border-indigo-400"
        @input="setValue('count', parseInt(getInputValue($event)) || 4)"
      >
    </div>
    <div class="space-y-1 relative">
      <label class="text-[10px] font-semibold text-slate-500 uppercase">检测器</label>
      <button
        class="w-full flex items-center justify-between px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 outline-none focus:border-indigo-400 text-left"
        @click="isDetectorDropdownOpen = !isDetectorDropdownOpen"
      >
        <span class="truncate">{{ getValue('detector', 'SIFT') }}</span>
        <ChevronDown
          :size="12"
          class="text-slate-400"
          :class="{ 'rotate-180': isDetectorDropdownOpen }"
        />
      </button>
      <div
        v-if="isDetectorDropdownOpen"
        class="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-[160px] overflow-y-auto custom-scrollbar-dark z-50 flex flex-col py-1"
      >
        <button
          v-for="opt in detectorOptions"
          :key="opt"
          class="px-3 py-1.5 text-xs text-left hover:bg-slate-50 transition-colors"
          :class="getValue('detector', 'SIFT') === opt ? 'text-indigo-600 bg-indigo-50/50' : 'text-slate-700'"
          @click="selectDetector(opt)"
        >
          {{ opt }}
        </button>
      </div>
    </div>
    <div class="space-y-1">
      <label class="text-[10px] font-semibold text-slate-500 uppercase">距离比</label>
      <input
        type="number"
        step="0.1"
        min="0"
        max="1"
        :value="getValue('ratio', 0.6)"
        class="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:border-indigo-400"
        @input="setValue('ratio', parseFloat(getInputValue($event)) || 0.6)"
      >
    </div>
  </div>
</template>
