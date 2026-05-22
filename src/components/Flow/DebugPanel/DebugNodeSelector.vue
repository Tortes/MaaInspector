<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Search as SearchIcon } from 'lucide-vue-next'

export interface NodeOption {
  id: string
  label: string
}

const props = defineProps<{
  options: NodeOption[]
  modelValue?: string
  placeholder?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'select', option: NodeOption): void
  (e: 'submit'): void
}>()

const isOptionOpen = ref(false)

const searchValue = computed({
  get: () => props.modelValue || '',
  set: (val) => emit('update:modelValue', val)
})

const filteredOptions = computed(() => {
  const keyword = searchValue.value.trim().toLowerCase()
  if (!keyword) return props.options
  return props.options.filter(opt =>
    opt.id.toLowerCase().includes(keyword) || opt.label.toLowerCase().includes(keyword))
})

const handleSelect = (opt: NodeOption) => {
  emit('select', opt)
  isOptionOpen.value = false
}

const toggleList = () => {
  isOptionOpen.value = !isOptionOpen.value
}

const closeList = () => {
  setTimeout(() => {
    isOptionOpen.value = false
  }, 120)
}

watch(() => props.modelValue, (val) => {
  if (val) {
    isOptionOpen.value = false
  }
})
</script>

<template>
  <div class="relative flex-1">
    <SearchIcon
      :size="14"
      class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
    />
    <input
      v-model="searchValue"
      type="text"
      :placeholder="placeholder || '输入或选择节点 ID...'"
      class="w-full pl-9 pr-10 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 transition-all font-mono"
      @focus="isOptionOpen = true"
      @blur="closeList"
      @keyup.enter="emit('submit')"
    >
    <button
      class="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 rounded-md text-xs border border-slate-200 text-slate-500 hover:bg-white"
      type="button"
      @mousedown.prevent
      @click="toggleList"
    >
      列表
    </button>
    <div
      v-if="isOptionOpen && filteredOptions.length"
      class="absolute z-10 mt-1 w-full max-h-52 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-sm custom-scrollbar"
    >
      <button
        v-for="opt in filteredOptions"
        :key="opt.id"
        type="button"
        class="w-full text-left px-3 py-2 hover:bg-amber-50 text-sm text-slate-700 flex justify-between items-center"
        @mousedown.prevent
        @click="handleSelect(opt)"
      >
        <span class="font-mono">{{ opt.label }}</span>
        <span class="text-[11px] text-slate-400">{{ opt.id }}</span>
      </button>
    </div>
  </div>
</template>
