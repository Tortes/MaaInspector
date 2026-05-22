import type { FlowNode, NodeStatus } from '../utils/flowTypes'
import { debugApi } from '../services/api'

type DebugMode = 'standard' | 'recognition_only'

export interface DebugRunnerDeps {
  findNode: (id: string) => FlowNode | undefined
  nodes: { value: FlowNode[] }
  currentSource: { value: string }
  currentFilename: { value: string }
  onSaveNodes: (config: { source: string; filename: string }, onSnapshotState: () => void) => Promise<void>
  onSnapshotState: () => void
  setNodeStatus: (nodeId: string, status: NodeStatus) => void
}

export function useDebugRunner(deps: DebugRunnerDeps) {
  const { findNode, nodes, currentSource, currentFilename, onSaveNodes, onSnapshotState, setNodeStatus } = deps

  const handleDebugNode = async (nodeId: string, mode: DebugMode = 'standard') => {
    const node = findNode(nodeId)
    if (!node || !node.data) return
    node.data._result = null

    try {
      await onSaveNodes({ source: currentSource.value, filename: currentFilename.value }, onSnapshotState)
      await debugApi.runNode({
        node: node.data.data,
        debug_mode: mode,
        context: { source: currentSource.value, filename: currentFilename.value }
      })
    } catch (error: unknown) {
      const err = error as { message?: string }
      console.error('Debug failed:', error)
      node.data._result = { success: false, error: err?.message || 'Network/Server Error' }
    } finally {
      nodes.value = [...nodes.value]
      onSnapshotState()
    }
  }

  const handleUpdateNodeStatus = ({ nodeId, status }: { nodeId: string; status: NodeStatus }) => {
    if (!nodeId || status === undefined) return
    setNodeStatus(nodeId, status)
    onSnapshotState()
  }

  const handleDebugNodeFromPanel = (nodeId: string) => handleDebugNode(nodeId, 'standard')

  return {
    handleDebugNode,
    handleUpdateNodeStatus,
    handleDebugNodeFromPanel
  }
}
