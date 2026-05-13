import type { Ref } from 'vue'
import ELK from 'elkjs/lib/elk.bundled.js'
import { useVueFlow } from '@vue-flow/core'
import type { FlowEdge, FlowNode, SpacingKey, LayoutAlgorithm, LayoutDirection } from './flowTypes'
import { SPACING_OPTIONS } from './flowOptions'

export interface LayoutOptions {
  algorithm: LayoutAlgorithm
  direction: LayoutDirection
  spacing: SpacingKey
}

export const NODE_SIZE_PADDING = {
  fallbackWidth: 280,
  fallbackHeight: 150,
  extraWidth: 20,
  extraHeight: 20
}

const elk = new ELK()

const getSpacingConfig = (key: SpacingKey = 'normal') =>
  SPACING_OPTIONS[key] || SPACING_OPTIONS.normal

const directionToElk = (direction: LayoutDirection): string => {
  return direction === 'LR' ? 'RIGHT' : 'DOWN'
}

export function useLayout() {
  const { findNode } = useVueFlow()

  const elkLayout = async (
    nodes: FlowNode[],
    edges: FlowEdge[],
    options: LayoutOptions = { algorithm: 'layered', direction: 'TB', spacing: 'normal' }
  ): Promise<FlowNode[]> => {
    const spacing = getSpacingConfig(options.spacing)
    const elkDirection = directionToElk(options.direction)

    const layoutOptions: Record<string, string> = {
      'elk.algorithm': options.algorithm,
      'elk.direction': elkDirection,
    }

    if (options.algorithm === 'stress') {
      layoutOptions['elk.stress.desiredEdgeLength'] = String(spacing.nodeSpacing)
    } else if (options.algorithm === 'mrtree') {
      layoutOptions['elk.spacing.nodeNode'] = String(spacing.nodeSpacing)
      layoutOptions['elk.spacing.edgeEdge'] = String(spacing.edgeSpacing)
    } else {
      layoutOptions['elk.spacing.nodeNode'] = String(spacing.nodeSpacing)
      layoutOptions['elk.spacing.edgeEdge'] = String(spacing.edgeSpacing)
      layoutOptions['elk.layered.spacing.nodeNodeBetweenLayers'] = String(spacing.nodeSpacing)
      layoutOptions['elk.edgeRouting'] = 'ORTHOGONAL'
    }

    const elkGraph = {
      id: 'root',
      layoutOptions,
      children: nodes.map((node) => {
        const nodeEl = findNode(node.id)
        const width = (nodeEl?.dimensions?.width ?? NODE_SIZE_PADDING.fallbackWidth) + NODE_SIZE_PADDING.extraWidth
        const height = (nodeEl?.dimensions?.height ?? NODE_SIZE_PADDING.fallbackHeight) + NODE_SIZE_PADDING.extraHeight
        return {
          id: node.id,
          width,
          height
        }
      }),
      edges: edges.map((edge) => ({
        id: edge.id,
        sources: [edge.source],
        targets: [edge.target]
      }))
    }

    const handleOrder: Record<string, number> = {
      'source-a': 1,
      'source-c': 3
    }

    elkGraph.edges.sort((a, b) => {
      const edgeA = edges.find(e => e.id === a.id)
      const edgeB = edges.find(e => e.id === b.id)
      const weightA = handleOrder[edgeA?.sourceHandle ?? ''] ?? 2
      const weightB = handleOrder[edgeB?.sourceHandle ?? ''] ?? 2
      return weightA - weightB
    })

    try {
      const layouted = await elk.layout(elkGraph)
      return nodes.map((node) => {
        const elkNode = layouted.children?.find(c => c.id === node.id)
        return {
          ...node,
          position: {
            x: elkNode?.x ?? 0,
            y: elkNode?.y ?? 0
          }
        }
      })
    } catch (error) {
      console.error('[useLayout] ELK layout failed:', error)
      return nodes
    }
  }

  const applyLayoutOnRefs = async (
    nodesRef: Ref<FlowNode[]>,
    edgesRef: Ref<FlowEdge[]>,
    options: LayoutOptions = { algorithm: 'layered', direction: 'TB', spacing: 'normal' }
  ): Promise<FlowNode[]> => {
    const layouted = await elkLayout(nodesRef.value, edgesRef.value, options)
    nodesRef.value = layouted
    return layouted
  }

  const normalizeChainTargets = (val: unknown): string[] => {
    if (val === 0) return ['0']
    if (!val && val !== 0) return []
    const list = Array.isArray(val) ? val : [val]
    return list
      .map(v => (typeof v === 'string' && v.startsWith('[JumpBack]')) ? v.replace('[JumpBack]', '') : v)
      .map(v => (v !== null && v !== undefined) ? String(v) : '')
      .filter(Boolean)
  }

  const computeOrderedChainLayout = async (
    rootId: string,
    nodesRef: Ref<FlowNode[]>,
    edgesRef: Ref<FlowEdge[]>,
    options: LayoutOptions = { algorithm: 'layered', direction: 'TB', spacing: 'normal' }
  ) => {
    if (!rootId) return null
    const root = findNode(rootId)
    if (!root) return null
    const spacing = getSpacingConfig(options.spacing)

    const visited = new Set<string>([rootId])
    const levels: Array<string[]> = []
    let currentLevel: string[] = [rootId]

    while (currentLevel.length) {
      levels.push(currentLevel)
      const nextLevel: string[] = []

      currentLevel.forEach(nodeId => {
        const node = findNode(nodeId)
        const data = node?.data?.data || {}
        const orderedChildren = [
          ...normalizeChainTargets((data as Record<string, unknown>).next),
          ...normalizeChainTargets((data as Record<string, unknown>).on_error)
        ]
        orderedChildren.forEach(childId => {
          if (visited.has(childId)) return
          visited.add(childId)
          nextLevel.push(childId)
        })
      })

      currentLevel = nextLevel
    }

    if (!levels.length) return null

    const isHorizontal = options.direction === 'LR'
    const chainPositions: Record<string, { x: number; y: number }> = {}
    levels.forEach((levelNodes, depth) => {
      const totalSize = (levelNodes.length - 1) * spacing.nodeSpacing
      const start = -totalSize / 2
      levelNodes.forEach((nodeId, index) => {
        chainPositions[nodeId] = isHorizontal
          ? { x: depth * spacing.nodeSpacing, y: start + index * spacing.nodeSpacing }
          : { x: start + index * spacing.nodeSpacing, y: depth * spacing.nodeSpacing }
      })
    })

    const remainingNodes = nodesRef.value.filter(n => !visited.has(n.id))
    const remainingPositions: Record<string, { x: number; y: number }> = {}
    if (remainingNodes.length) {
      const remainingIds = new Set(remainingNodes.map(n => n.id))
      const remainingEdges = edgesRef.value.filter(e => remainingIds.has(e.source) && remainingIds.has(e.target))
      const layouted = await elkLayout(remainingNodes, remainingEdges, options)
      const chainXs = Object.values(chainPositions).map(p => p.x)
      const offsetX = isHorizontal
        ? (chainXs.length ? Math.max(...chainXs) : 0) + spacing.nodeSpacing * 2
        : (chainXs.length ? Math.max(...chainXs) : 0) + spacing.nodeSpacing * 2
      layouted.forEach(n => {
        remainingPositions[n.id] = {
          x: (n.position?.x || 0) + offsetX,
          y: n.position?.y || 0
        }
      })
    }

    return { chainPositions, remainingPositions, chainIds: visited }
  }

  const applyOrderedChainLayout = async (
    nodesRef: Ref<FlowNode[]>,
    edgesRef: Ref<FlowEdge[]>,
    rootId: string,
    options: LayoutOptions = { algorithm: 'layered', direction: 'TB', spacing: 'normal' }
  ) => {
    const result = await computeOrderedChainLayout(rootId, nodesRef, edgesRef, options)
    if (!result) return null

    const { chainPositions, remainingPositions } = result
    nodesRef.value = nodesRef.value.map(n => {
      if (chainPositions[n.id]) return { ...n, position: chainPositions[n.id] }
      if (remainingPositions[n.id]) return { ...n, position: remainingPositions[n.id] }
      return n
    })
    return result
  }

  return {
    elkLayout,
    applyLayoutOnRefs,
    computeOrderedChainLayout,
    applyOrderedChainLayout,
    getSpacingConfig,
    SPACING_OPTIONS,
    NODE_SIZE_PADDING
  }
}
