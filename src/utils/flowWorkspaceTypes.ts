import type { useFlowGraph } from '@/composables/useFlowGraph'
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
  lowMemoryMode: boolean
}

export interface TabResourceInfo {
  id: string
  title: string
  resourceFile: string
}

export interface DeviceState {
  connected: boolean
  type: 'adb' | 'win32' | ''
  config: Record<string, unknown>
}

export interface AgentState {
  connected: boolean
  socketId: string
}

export interface ResourceState {
  profileIndex: number
  loaded: boolean
}

export interface MainAppState {
  device: DeviceState
  agent: AgentState
  resource: ResourceState
  tabs: TabResourceInfo[]
  activeTabId: string
}

export interface FlowWorkspaceState {
  tabs: TabResourceInfo[]
  activeTabId: string
  appSettings: FlowAppSettings
}
