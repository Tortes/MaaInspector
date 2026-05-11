<script setup lang="ts">
import { ref, computed } from 'vue'
import { Bot, Loader2, CheckCircle2, XCircle, Circle } from 'lucide-vue-next'
import { agentApi } from '../../../services/api'

// 状态指示器组件
const StatusIndicator = {
  props: { status: String, size: { type: Number, default: 16 } },
  setup(props: { status?: string; size: number }) {
    return () => {
      if (props.status === 'connected') return h(CheckCircle2, { size: props.size, class: 'text-emerald-500 fill-emerald-50' })
      if (props.status === 'connecting') return h(Loader2, { size: props.size, class: 'text-blue-500 animate-spin' })
      if (props.status === 'failed') return h(XCircle, { size: props.size, class: 'text-red-500' })
      return h(Circle, { size: props.size, class: 'text-slate-300' })
    }
  }
}

import { h } from 'vue'

// 状态
const status = ref<'disconnected' | 'connecting' | 'connected' | 'failed'>('disconnected')
const message = ref('Agent 未连接')
const currentAgentSocket = ref<string>('')

// 按钮标签
const agentButtonLabel = computed(() => status.value === 'connected' ? '重新连接 Agent' : '启动 Agent')

// 连接 Agent
const handleAgentConnect = async () => {
  if (status.value === 'connecting') return
  status.value = 'connecting'
  message.value = '连接中...'

  try {
    const res = await agentApi.connect(currentAgentSocket.value, {
      context: { feature: 'agent', action: 'connect', component: 'AgentManager' }
    })

    const ok = res?.success ?? true
    const msg = res?.message || (ok ? 'Agent 已连接' : '连接失败')

    if (!ok) {
      status.value = 'failed'
      message.value = msg
      setTimeout(() => {
        if (status.value === 'failed') status.value = 'disconnected'
      }, 3000)
      return
    }

    status.value = 'connected'
    message.value = msg
  } catch (e: any) {
    status.value = 'failed'
    message.value = '连接失败: ' + (e?.message || '未知错误')
    setTimeout(() => {
      if (status.value === 'failed') status.value = 'disconnected'
    }, 3000)
  }
}

// 暴露方法
defineExpose({
  currentAgentSocket,
  status,
  message
})
</script>

<template>
  <section class="space-y-2">
    <div class="flex items-center justify-between text-xs mb-1">
      <div class="flex items-center gap-1.5 font-bold text-slate-700">
        <Bot :size="14" class="text-violet-500"/>
        Agent
      </div>
      <StatusIndicator :status="status"/>
    </div>
    <div class="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-3 shadow-sm">
      <input v-model="currentAgentSocket" type="text" placeholder="Socket ID..."
             class="input-base focus:border-violet-500 focus:ring-violet-100 w-full"
             @keyup.enter="handleAgentConnect"/>
      <button @click="handleAgentConnect"
              :disabled="status === 'connecting'"
              class="w-full btn-primary bg-violet-500 shadow-violet-100">
        <component :is="status === 'connecting' ? Loader2 : Bot" :size="14"
                   :class="{'animate-spin': status === 'connecting'}"/>
        {{ agentButtonLabel }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.input-base {
  @apply w-full bg-white border border-slate-200 rounded-lg py-2 px-3 text-xs text-slate-600 outline-none transition-all shadow-sm focus:border-indigo-300 focus:ring-2 focus:ring-indigo-50;
}

.btn-primary {
  @apply flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold text-white rounded-lg shadow-sm hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed;
}
</style>
