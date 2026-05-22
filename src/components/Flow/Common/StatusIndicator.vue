<script setup lang="ts">
import { computed } from 'vue'
import { CheckCircle2, XCircle, Loader2, Circle } from 'lucide-vue-next'

const props = withDefaults(defineProps<{
  status?: string
  size?: number
}>(), {
  status: 'disconnected',
  size: 16
})

const iconComponent = computed(() => {
  if (props.status === 'connected') return CheckCircle2
  if (props.status === 'connecting' || props.status === 'disconnecting') return Loader2
  if (props.status === 'failed') return XCircle
  return Circle
})

const iconClass = computed(() => {
  if (props.status === 'connected') return 'text-emerald-500 fill-emerald-50'
  if (props.status === 'connecting' || props.status === 'disconnecting') return 'text-blue-500 animate-spin'
  if (props.status === 'failed') return 'text-red-500'
  return 'text-slate-300'
})
</script>

<template>
  <component
    :is="iconComponent"
    :size="size"
    :class="iconClass"
  />
</template>
