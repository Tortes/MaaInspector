import type { Ref } from 'vue'
import type { FlowNode, FlowEdge, SpacingKey, LayoutAlgorithm } from '../../utils/flowTypes'
import type { LayoutOptions } from '../useLayout'

export const layoutTaskChain = async (
  nodes: Ref<FlowNode[]>,
  edges: Ref<FlowEdge[]>,
  rootId: string,
  applyOrderedChainLayout: (
    nodesRef: Ref<FlowNode[]>,
    edgesRef: Ref<FlowEdge[]>,
    rootId: string,
    options: LayoutOptions
  ) => Promise<{ chainIds: Set<string> } | null>,
  currentAlgorithm: LayoutAlgorithm,
  currentDirection: LayoutOptions['direction'],
  currentSpacing: SpacingKey,
  fitView: (options: { nodes: string[]; padding: number; duration: number }) => void
) => {
  const layoutOptions: LayoutOptions = {
    algorithm: currentAlgorithm,
    direction: currentDirection,
    spacing: currentSpacing
  }
  const result = await applyOrderedChainLayout(nodes, edges, rootId, layoutOptions)
  if (!result) return

  const { chainIds } = result
  setTimeout(() => fitView({ nodes: Array.from(chainIds), padding: 0.25, duration: 600 }), 50)
}

export const layoutChainFromNode = async (
  startId: string,
  nodes: Ref<FlowNode[]>,
  edges: Ref<FlowEdge[]>,
  applyOrderedChainLayout: (
    nodesRef: Ref<FlowNode[]>,
    edgesRef: Ref<FlowEdge[]>,
    rootId: string,
    options: LayoutOptions
  ) => Promise<{ chainIds: Set<string> } | null>,
  currentDirection: LayoutOptions['direction'],
  spacingKey: SpacingKey,
  algorithm: LayoutAlgorithm,
  fitView: (options: { nodes: string[]; padding: number; duration: number }) => void
) => {
  const layoutOptions: LayoutOptions = {
    algorithm,
    direction: currentDirection,
    spacing: spacingKey
  }
  const result = await applyOrderedChainLayout(nodes, edges, startId, layoutOptions)
  if (!result) return

  const { chainIds } = result
  setTimeout(() => fitView({ nodes: Array.from(chainIds), padding: 0.25, duration: 600 }), 50)
}
