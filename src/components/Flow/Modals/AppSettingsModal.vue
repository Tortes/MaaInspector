<script setup lang="ts">
import { ref, watch } from 'vue'
import { Settings, Save, RotateCcw } from 'lucide-vue-next'
import { LAYOUT_ALGORITHM_OPTIONS, LAYOUT_DIRECTION_OPTIONS } from '../../../utils/flowOptions'
import type { EdgeType } from '../../../utils/flowOptions'
import type { LayoutAlgorithm, LayoutDirection, SpacingKey } from '../../../utils/flowTypes'

export type PipelineVersion = 'V1' | 'V2'

interface AppSettingsProps {
  visible: boolean
  defaultEdgeType?: EdgeType
  defaultSpacing?: SpacingKey
  defaultLayoutAlgorithm?: LayoutAlgorithm
  defaultLayoutDirection?: LayoutDirection
  defaultPipelineVersion?: PipelineVersion
  defaultRestoreWorkspaceOnStart?: boolean
  defaultLowMemoryMode?: boolean
}

const props = withDefaults(defineProps<AppSettingsProps>(), {
  visible: false,
  defaultEdgeType: 'smoothstep',
  defaultSpacing: 'normal',
  defaultLayoutAlgorithm: 'layered',
  defaultLayoutDirection: 'TB',
  defaultPipelineVersion: 'V1',
  defaultRestoreWorkspaceOnStart: true,
  defaultLowMemoryMode: false
})

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'save', payload: {
    edgeType: EdgeType
    spacing: SpacingKey
    layoutAlgorithm: LayoutAlgorithm
    layoutDirection: LayoutDirection
    pipelineVersion: PipelineVersion
    restoreWorkspaceOnStart: boolean
    lowMemoryMode: boolean
  }): void
}>()

const edgeType = ref<EdgeType>(props.defaultEdgeType)
const spacing = ref<SpacingKey>(props.defaultSpacing)
const layoutAlgorithm = ref<LayoutAlgorithm>(props.defaultLayoutAlgorithm)
const layoutDirection = ref<LayoutDirection>(props.defaultLayoutDirection)
const pipelineVersion = ref<PipelineVersion>(props.defaultPipelineVersion)
const restoreWorkspaceOnStart = ref<boolean>(props.defaultRestoreWorkspaceOnStart)
const lowMemoryMode = ref<boolean>(props.defaultLowMemoryMode)

watch(() => props.visible, (val: boolean) => {
  if (val) {
    edgeType.value = props.defaultEdgeType
    spacing.value = props.defaultSpacing
    layoutAlgorithm.value = props.defaultLayoutAlgorithm
    layoutDirection.value = props.defaultLayoutDirection
    pipelineVersion.value = props.defaultPipelineVersion
    restoreWorkspaceOnStart.value = props.defaultRestoreWorkspaceOnStart
    lowMemoryMode.value = props.defaultLowMemoryMode
  }
})

const handleSave = () => {
  emit('save', {
    edgeType: edgeType.value,
    spacing: spacing.value,
    layoutAlgorithm: layoutAlgorithm.value,
    layoutDirection: layoutDirection.value,
    pipelineVersion: pipelineVersion.value,
    restoreWorkspaceOnStart: restoreWorkspaceOnStart.value,
    lowMemoryMode: lowMemoryMode.value
  })
}

const handleReset = () => {
  edgeType.value = 'smoothstep'
  spacing.value = 'normal'
  layoutAlgorithm.value = 'layered'
  layoutDirection.value = 'TB'
  pipelineVersion.value = 'V1'
  restoreWorkspaceOnStart.value = true
  lowMemoryMode.value = false
}
</script>

<template>
  <div v-if="visible"
       class="fixed inset-0 z-[100] flex items-center justify-center bg-black/20 backdrop-blur-sm animate-in fade-in duration-200">
    <div class="bg-white rounded-xl shadow-2xl border border-slate-200 flex overflow-hidden w-[500px]">
      <div class="flex-1 flex flex-col bg-white">
        <div class="flex items-center justify-between p-4 border-b border-slate-100">
          <h3 class="font-bold text-slate-700 flex items-center gap-2">
            <Settings :size="16"/>
            应用设置
          </h3>
          <div class="flex items-center gap-2">
            <button
                @click="handleReset"
                class="px-2.5 py-1.5 text-[11px] font-medium text-slate-500 hover:bg-slate-100 rounded-lg transition-colors flex items-center gap-1">
              <RotateCcw :size="12"/>
              重置默认
            </button>
          </div>
        </div>

        <div class="flex-1 p-5 overflow-y-auto custom-scrollbar">
          <div class="space-y-6">
            <!-- 画布默认配置 -->
            <div class="space-y-3">
              <div class="flex items-center gap-2 pb-2 border-b border-slate-100">
                <div class="w-1 h-4 bg-indigo-500 rounded"></div>
                <h4 class="text-sm font-bold text-slate-700">画布默认配置</h4>
              </div>

              <!-- 连线类型 -->
              <div class="space-y-2">
                <label class="text-[11px] font-bold text-slate-500 uppercase block">连线类型</label>
                <div class="grid grid-cols-2 gap-2">
                  <button
                      @click="edgeType = 'smoothstep'"
                      class="py-2.5 px-3 text-xs font-medium rounded-lg border-2 transition-all"
                      :class="edgeType === 'smoothstep'
                        ? 'bg-indigo-500 text-white border-indigo-500 shadow-sm'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'">
                    直角连线
                  </button>
                  <button
                      @click="edgeType = 'default'"
                      class="py-2.5 px-3 text-xs font-medium rounded-lg border-2 transition-all"
                      :class="edgeType === 'default'
                        ? 'bg-indigo-500 text-white border-indigo-500 shadow-sm'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'">
                    贝塞尔曲线
                  </button>
                </div>
                <p class="text-[10px] text-slate-400 mt-1">
                  新建流程图时使用的默认连线样式
                </p>
              </div>

              <!-- 节点间距 -->
              <div class="space-y-2">
                <label class="text-[11px] font-bold text-slate-500 uppercase block">节点间距</label>
                <div class="grid grid-cols-3 gap-2">
                  <button
                      @click="spacing = 'compact'"
                      class="py-2.5 px-3 text-xs font-medium rounded-lg border-2 transition-all"
                      :class="spacing === 'compact'
                        ? 'bg-indigo-500 text-white border-indigo-500 shadow-sm'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'">
                    紧凑
                  </button>
                  <button
                      @click="spacing = 'normal'"
                      class="py-2.5 px-3 text-xs font-medium rounded-lg border-2 transition-all"
                      :class="spacing === 'normal'
                        ? 'bg-indigo-500 text-white border-indigo-500 shadow-sm'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'">
                    默认
                  </button>
                  <button
                      @click="spacing = 'loose'"
                      class="py-2.5 px-3 text-xs font-medium rounded-lg border-2 transition-all"
                      :class="spacing === 'loose'
                        ? 'bg-indigo-500 text-white border-indigo-500 shadow-sm'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'">
                    宽松
                  </button>
                </div>
                <p class="text-[10px] text-slate-400 mt-1">
                  自动布局时节点之间的默认间距
                </p>
              </div>

              <!-- 布局算法 -->
              <div class="space-y-2">
                <label class="text-[11px] font-bold text-slate-500 uppercase block">布局算法</label>
                <div class="grid grid-cols-3 gap-2">
                  <button
                    v-for="option in LAYOUT_ALGORITHM_OPTIONS"
                    :key="option.value"
                    @click="layoutAlgorithm = option.value"
                    class="py-2.5 px-3 text-xs font-medium rounded-lg border-2 transition-all"
                    :class="layoutAlgorithm === option.value
                      ? 'bg-indigo-500 text-white border-indigo-500 shadow-sm'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'">
                    {{ option.label }}
                  </button>
                </div>
              </div>

              <!-- 布局方向 -->
              <div class="space-y-2">
                <label class="text-[11px] font-bold text-slate-500 uppercase block">布局方向</label>
                <div class="grid grid-cols-2 gap-2">
                  <button
                    v-for="option in LAYOUT_DIRECTION_OPTIONS"
                    :key="option.value"
                    @click="layoutDirection = option.value"
                    class="py-2.5 px-3 text-xs font-medium rounded-lg border-2 transition-all"
                    :class="layoutDirection === option.value
                      ? 'bg-indigo-500 text-white border-indigo-500 shadow-sm'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'">
                    {{ option.label }}
                  </button>
                </div>
              </div>

              <!-- 保存时的 pipeline 版本 -->
              <div class="space-y-2">
                <label class="text-[11px] font-bold text-slate-500 uppercase block">保存时的 pipeline 版本</label>
                <div class="grid grid-cols-2 gap-2">
                  <button
                      @click="pipelineVersion = 'V1'"
                      class="py-2.5 px-3 text-xs font-medium rounded-lg border-2 transition-all"
                      :class="pipelineVersion === 'V1'
                        ? 'bg-indigo-500 text-white border-indigo-500 shadow-sm'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'">
                    V1
                  </button>
                  <button
                      @click="pipelineVersion = 'V2'"
                      class="py-2.5 px-3 text-xs font-medium rounded-lg border-2 transition-all"
                      :class="pipelineVersion === 'V2'
                        ? 'bg-indigo-500 text-white border-indigo-500 shadow-sm'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'">
                    V2
                  </button>
                </div>
                <p class="text-[10px] text-slate-400 mt-1">
                  保存 pipeline 文件时使用的格式版本
                </p>
              </div>

              <!-- 工作区恢复 -->
              <div class="space-y-2">
                <label class="text-[11px] font-bold text-slate-500 uppercase block">启动时恢复工作区</label>
                <button
                  @click="restoreWorkspaceOnStart = !restoreWorkspaceOnStart"
                  class="w-full py-2.5 px-3 text-xs font-medium rounded-lg border-2 transition-all text-left"
                  :class="restoreWorkspaceOnStart
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-300'">
                  {{ restoreWorkspaceOnStart ? '已开启：启动时恢复标签页与快照' : '已关闭：仅恢复应用默认设置' }}
                </button>
              </div>

              <!-- 低消耗模式 -->
              <div class="space-y-2">
                <label class="text-[11px] font-bold text-slate-500 uppercase block">标签页切换模式</label>
                <button
                  @click="lowMemoryMode = !lowMemoryMode"
                  class="w-full py-2.5 px-3 text-xs font-medium rounded-lg border-2 transition-all text-left"
                  :class="lowMemoryMode
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : 'bg-indigo-50 text-indigo-700 border-indigo-200'">
                  <div class="flex flex-col gap-1">
                    <span class="font-semibold">
                      {{ lowMemoryMode ? '低消耗模式' : '快速切换模式' }}
                    </span>
                    <span class="text-[10px] opacity-75">
                      {{ lowMemoryMode
                        ? '切换时重建编辑器实例,占用内存更少但速度较慢'
                        : '切换时保留所有编辑器实例,速度更快但占用更多内存' }}
                    </span>
                  </div>
                </button>
              </div>
            </div>

            <!-- 更多设置(预留) -->
            <div class="space-y-3 opacity-50">
              <div class="flex items-center gap-2 pb-2 border-b border-slate-100">
                <div class="w-1 h-4 bg-slate-300 rounded"></div>
                <h4 class="text-sm font-bold text-slate-500">更多设置</h4>
              </div>
              <p class="text-xs text-slate-400 text-center py-4">
                更多功能开发中...
              </p>
            </div>
          </div>
        </div>

        <div class="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
          <button @click="$emit('close')"
                  class="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-200 rounded-lg transition-colors">
            取消
          </button>
          <button @click="handleSave"
                  class="px-4 py-2 text-xs font-bold bg-indigo-500 text-white rounded-lg shadow-sm hover:bg-indigo-600 transition-colors flex items-center gap-1.5">
            <Save :size="14"/>
            保存设置
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.custom-scrollbar {
  scrollbar-width: thin;
  scrollbar-color: rgb(203 213 225) transparent;
}

.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: rgb(203 213 225);
  border-radius: 3px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background-color: rgb(148 163 184);
}
</style>
