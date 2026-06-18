<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, type Component } from 'vue'
import { Check, ChevronDown } from 'lucide-vue-next'

interface ToolbarOption {
  label: string
  value: PropertyKey
  icon?: Component
  disabled?: boolean
}

const props = defineProps<{
  modelValue: PropertyKey
  options: ToolbarOption[]
  title: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: PropertyKey): void
}>()

const isOpen = ref(false)
const dropdownRef = ref<HTMLDivElement | null>(null)

const selectedOption = computed(() =>
  props.options.find(option => option.value === props.modelValue)
)

const toggleDropdown = () => {
  if (props.disabled) return
  isOpen.value = !isOpen.value
}

const selectOption = (option: ToolbarOption) => {
  if (option.disabled) return
  emit('update:modelValue', option.value)
  isOpen.value = false
}

const handleClickOutside = (event: MouseEvent) => {
  if (dropdownRef.value && !dropdownRef.value.contains(event.target as Node)) {
    isOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <div
    ref="dropdownRef"
    class="relative"
  >
    <button
      type="button"
      :disabled="disabled"
      class="flex h-7 w-10 items-center justify-center gap-0.5 rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
      :class="{ 'border-indigo-300 bg-indigo-50 text-indigo-600': isOpen }"
      :title="title"
      @click="toggleDropdown"
    >
      <component
        :is="selectedOption?.icon"
        v-if="selectedOption?.icon"
        :size="14"
      />
      <ChevronDown
        :size="10"
        class="shrink-0 transition-transform"
        :class="{ 'rotate-180': isOpen }"
      />
    </button>

    <Transition
      enter-active-class="transition ease-out duration-100"
      enter-from-class="transform opacity-0 scale-95"
      enter-to-class="transform opacity-100 scale-100"
      leave-active-class="transition ease-in duration-75"
      leave-from-class="transform opacity-100 scale-100"
      leave-to-class="transform opacity-0 scale-95"
    >
      <div
        v-if="isOpen"
        class="absolute right-0 z-50 mt-1 w-44 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg"
      >
        <button
          v-for="option in options"
          :key="option.value"
          type="button"
          :disabled="option.disabled"
          class="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs transition-colors"
          :class="{
            'bg-indigo-50 text-indigo-700': option.value === modelValue,
            'text-slate-600 hover:bg-slate-50': option.value !== modelValue && !option.disabled,
            'cursor-not-allowed text-slate-400': option.disabled
          }"
          @click="selectOption(option)"
        >
          <span class="flex min-w-0 items-center gap-2">
            <component
              :is="option.icon"
              v-if="option.icon"
              :size="14"
              class="shrink-0"
            />
            <span class="truncate">{{ option.label }}</span>
          </span>
          <Check
            v-if="option.value === modelValue"
            :size="14"
            class="shrink-0 text-indigo-600"
          />
        </button>
      </div>
    </Transition>
  </div>
</template>
