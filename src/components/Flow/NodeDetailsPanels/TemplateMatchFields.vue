<script setup lang="ts">
import { Plus, Trash2, ImageIcon } from 'lucide-vue-next'
import type { NodeFormMethods } from '../../../utils/nodeLogic'

const props = defineProps<{
  form: NodeFormMethods
}>()

const emit = defineEmits<{
  (e: 'open-image-manager'): void
}>()

const { getValue, setValue } = props.form

const getInputValue = (event: Event) => (event.target as HTMLInputElement | HTMLTextAreaElement | null)?.value ?? ''
const getChecked = (event: Event) => (event.target as HTMLInputElement | null)?.checked ?? false

const getTemplateList = (): string[] => {
  const val = getValue<unknown>('template', '')
  if (Array.isArray(val)) return val.map(v => (v === null || v === undefined) ? '' : String(v))
  if (val && typeof val === 'string') return [val]
  if (val === '' || val === null) return ['']
  return []
}

const setTemplateList = (list: string[]) => {
  const normalized = (list || []).map(v => (v === null || v === undefined) ? '' : String(v))
  if (normalized.length === 0) {
    setValue('template', null)
    return
  }
  if (normalized.length === 1) {
    const single = normalized[0]
    if (!single || !single.trim()) {
      setValue('template', [''])
    } else {
      setValue('template', single.trim())
    }
    return
  }
  setValue('template', normalized.map(v => v.trim()))
}

const addTemplate = () => {
  const current = getTemplateList()
  setTemplateList([...current, ''])
}

const removeTemplate = (index: number) => {
  const current = getTemplateList()
  current.splice(index, 1)
  setTemplateList(current)
}

const updateTemplate = (index: number, value: string) => {
  const current = getTemplateList()
  current[index] = value
  setTemplateList(current)
}
</script>

<template>
  <div>
    <div class="space-y-1">
      <label class="text-[10px] font-semibold text-slate-500 uppercase">模板图片</label>
      <div class="space-y-1.5">
        <div
          v-for="(template, idx) in getTemplateList()"
          :key="idx"
          class="flex gap-1"
        >
          <input
            :value="template"
            class="flex-1 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 outline-none focus:border-indigo-400 font-mono min-w-0"
            placeholder="image/..."
            @input="updateTemplate(idx, getInputValue($event))"
          >
          <button
            v-if="getTemplateList().length > 1"
            class="px-2 bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100 rounded-lg flex items-center justify-center"
            title="删除此模板"
            @click="removeTemplate(idx)"
          >
            <Trash2 :size="12" />
          </button>
        </div>
        <div
          v-if="getTemplateList().length === 0"
          class="flex gap-1"
        >
          <input
            value=""
            class="flex-1 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 outline-none focus:border-indigo-400 font-mono min-w-0"
            placeholder="image/..."
            @input="updateTemplate(0, getInputValue($event))"
          >
        </div>
        <div class="flex gap-1">
          <button
            class="flex items-center gap-1 px-2 py-1.5 text-xs rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-600 hover:bg-indigo-100"
            @click="addTemplate"
          >
            <Plus :size="12" />
            添加模板
          </button>
          <button
            class="flex items-center gap-1 px-2 py-1.5 text-xs rounded-lg border border-pink-200 bg-pink-50 text-pink-600 hover:bg-pink-100"
            title="管理/截取模板图片"
            @click="emit('open-image-manager')"
          >
            <ImageIcon :size="12" />
            管理图片
          </button>
        </div>
      </div>
    </div>
    <label class="inline-flex items-center gap-1.5 cursor-pointer">
      <input
        type="checkbox"
        :checked="getValue('green_mask', false)"
        class="w-3.5 h-3.5 rounded text-indigo-600"
        @change="setValue('green_mask', getChecked($event))"
      >
      <span class="text-[11px] text-slate-600">绿色掩码 (忽略绿色部分)</span>
    </label>
  </div>
</template>
