<script setup lang="ts">
import { Clock } from 'lucide-vue-next'
import type { NodeFormMethods } from '@/composables/useNodeForm'

type ValueGetter = NodeFormMethods['getValue']
type ValueSetter = NodeFormMethods['setValue']

const props = defineProps<{
  getValue: ValueGetter
  setValue: ValueSetter
}>()

const { getValue, setValue } = props

const getInputValue = (event: Event) => (event.target as HTMLInputElement | null)?.value ?? ''
const getChecked = (event: Event) => (event.target as HTMLInputElement | null)?.checked ?? false
const parseOptionalInt = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) return null
  const num = parseInt(trimmed, 10)
  return Number.isNaN(num) ? null : num
}
</script>

<template>
  <div class="p-3 space-y-3">
    <div class="grid grid-cols-2 gap-2">
      <div class="space-y-1">
        <label class="text-[10px] font-semibold text-slate-500 uppercase">速率 (ms)</label>
        <input
          type="number"
          :value="getValue('rate_limit', 1000)"
          class="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 outline-none focus:border-indigo-400"
          @input="setValue('rate_limit', parseInt(getInputValue($event)) || 1000)"
        >
      </div>
      <div class="space-y-1">
        <label class="text-[10px] font-semibold text-slate-500 uppercase">超时 (ms)</label>
        <input
          type="number"
          :value="getValue('timeout', 20000)"
          class="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 outline-none focus:border-indigo-400"
          @input="setValue('timeout', parseInt(getInputValue($event)) || 20000)"
        >
      </div>
    </div>

    <div class="flex flex-wrap gap-3 pt-1">
      <label class="inline-flex items-center gap-1.5 cursor-pointer group">
        <input
          type="checkbox"
          :checked="getValue('inverse', false)"
          class="w-3.5 h-3.5 rounded text-indigo-600"
          @change="setValue('inverse', getChecked($event))"
        >
        <span class="text-[11px] text-slate-600">反转结果</span>
      </label>
      <label class="inline-flex items-center gap-1.5 cursor-pointer group">
        <input
          type="checkbox"
          :checked="getValue('enabled', true)"
          class="w-3.5 h-3.5 rounded text-indigo-600"
          @change="setValue('enabled', getChecked($event))"
        >
        <span class="text-[11px] text-slate-600">启用</span>
      </label>
    </div>

    <div class="h-px bg-slate-100 my-1 w-full" />

    <div class="grid grid-cols-2 gap-2">
      <div class="space-y-1">
        <label class="text-[10px] font-semibold text-slate-500 uppercase flex items-center gap-1">
          <Clock
            :size="10"
            class="text-violet-500"
          />
          前延迟 (ms)
        </label>
        <input
          type="number"
          :value="getValue('pre_delay', 200)"
          class="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 outline-none focus:border-indigo-400"
          @input="setValue('pre_delay', parseInt(getInputValue($event)) || 200)"
        >
      </div>
      <div class="space-y-1">
        <label class="text-[10px] font-semibold text-slate-500 uppercase flex items-center gap-1">
          <Clock
            :size="10"
            class="text-violet-500"
          />
          后延迟 (ms)
        </label>
        <input
          type="number"
          :value="getValue('post_delay', 200)"
          class="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 outline-none focus:border-indigo-400"
          @input="setValue('post_delay', parseInt(getInputValue($event)) || 200)"
        >
      </div>
      <div class="space-y-1">
        <label class="text-[10px] font-semibold text-slate-500 uppercase">前等待冻结</label>
        <input
          type="number"
          :value="getValue('pre_wait_freezes', 0)"
          class="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 outline-none focus:border-indigo-400"
          @input="setValue('pre_wait_freezes', parseInt(getInputValue($event)) || 0)"
        >
      </div>
      <div class="space-y-1">
        <label class="text-[10px] font-semibold text-slate-500 uppercase">后等待冻结</label>
        <input
          type="number"
          :value="getValue('post_wait_freezes', 0)"
          class="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 outline-none focus:border-indigo-400"
          @input="setValue('post_wait_freezes', parseInt(getInputValue($event)) || 0)"
        >
      </div>
    </div>

    <div class="h-px bg-slate-100 my-1 w-full" />

    <div class="grid grid-cols-2 gap-2">
      <div class="space-y-1">
        <label class="text-[10px] font-semibold text-slate-500 uppercase">最大命中次数</label>
        <input
          type="number"
          :value="getValue('max_hit', '')"
          class="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 outline-none focus:border-indigo-400"
          placeholder="留空表示无限制"
          @input="setValue('max_hit', parseOptionalInt(getInputValue($event)))"
        >
      </div>
      <div class="space-y-1">
        <label class="text-[10px] font-semibold text-slate-500 uppercase">重复次数</label>
        <input
          type="number"
          :value="getValue('repeat', 1)"
          class="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 outline-none focus:border-indigo-400"
          @input="setValue('repeat', parseInt(getInputValue($event)) || 1)"
        >
      </div>
      <div class="space-y-1">
        <label class="text-[10px] font-semibold text-slate-500 uppercase">重复延迟 (ms)</label>
        <input
          type="number"
          :value="getValue('repeat_delay', 0)"
          class="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 outline-none focus:border-indigo-400"
          @input="setValue('repeat_delay', parseInt(getInputValue($event)) || 0)"
        >
      </div>
      <div class="space-y-1">
        <label class="text-[10px] font-semibold text-slate-500 uppercase">重复等待冻结 (ms)</label>
        <input
          type="number"
          :value="getValue('repeat_wait_freezes', 0)"
          class="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 outline-none focus:border-indigo-400"
          @input="setValue('repeat_wait_freezes', parseInt(getInputValue($event)) || 0)"
        >
      </div>
    </div>
  </div>
</template>
