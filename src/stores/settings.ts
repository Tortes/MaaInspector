import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { EdgeType } from '../utils/flowOptions'
import type { LayoutAlgorithm, LayoutDirection, SpacingKey } from '../utils/flowTypes'

export const useSettingsStore = defineStore('settings', () => {
  const edgeType = ref<EdgeType>('smoothstep')
  const spacing = ref<SpacingKey>('normal')
  const layoutAlgorithm = ref<LayoutAlgorithm>('layered')
  const layoutDirection = ref<LayoutDirection>('TB')
  const pipelineVersion = ref<'V1' | 'V2'>('V1')
  const restoreWorkspaceOnStart = ref(true)
  const lowMemoryMode = ref(false)

  function updateSettings(payload: Partial<{
    edgeType: EdgeType
    spacing: SpacingKey
    layoutAlgorithm: LayoutAlgorithm
    layoutDirection: LayoutDirection
    pipelineVersion: 'V1' | 'V2'
    restoreWorkspaceOnStart: boolean
    lowMemoryMode: boolean
  }>) {
    if (payload.edgeType !== undefined) edgeType.value = payload.edgeType
    if (payload.spacing !== undefined) spacing.value = payload.spacing
    if (payload.layoutAlgorithm !== undefined) layoutAlgorithm.value = payload.layoutAlgorithm
    if (payload.layoutDirection !== undefined) layoutDirection.value = payload.layoutDirection
    if (payload.pipelineVersion !== undefined) pipelineVersion.value = payload.pipelineVersion
    if (payload.restoreWorkspaceOnStart !== undefined) restoreWorkspaceOnStart.value = payload.restoreWorkspaceOnStart
    if (payload.lowMemoryMode !== undefined) lowMemoryMode.value = payload.lowMemoryMode
  }

  return {
    edgeType,
    spacing,
    layoutAlgorithm,
    layoutDirection,
    pipelineVersion,
    restoreWorkspaceOnStart,
    lowMemoryMode,
    updateSettings
  }
})
