import type { useFlowGraph } from '../composables/useFlowGraph'
import type { EdgeType } from './flowOptions'
import type { LayoutAlgorithm, LayoutDirection, SpacingKey } from './flowTypes'

export interface FlowEditorSnapshot {
  flowState?: ReturnType<ReturnType<typeof useFlowGraph>['exportState']>
  defaultFlowConfig?: {
    edgeType: EdgeType
    spacing: SpacingKey
    layoutAlgorithm: LayoutAlgorithm
    layoutDirection: LayoutDirection
  }
  pipelineVersion?: 'V1' | 'V2'
  loadedFileVersion?: 'V1' | 'V2' | ''
  isDeviceConnected?: boolean
  viewport?: {
    x: number
    y: number
    zoom: number
  }
  selectedResourceFile?: string
}

export interface FlowAppSettings {
  edgeType: EdgeType
  spacing: SpacingKey
  layoutAlgorithm: LayoutAlgorithm
  layoutDirection: LayoutDirection
  pipelineVersion: 'V1' | 'V2'
  restoreWorkspaceOnStart: boolean
  lowMemoryMode: boolean
}

export interface FlowWorkspaceState {
  tabs: Array<{
    id: string
    title: string
    snapshot: FlowEditorSnapshot
  }>
  activeTabId: string
  appSettings: FlowAppSettings
}

export interface FlowInitialFile {
  filename: string
  source: string
}
