import type { FlowEdge, FlowNode } from './flowTypes'

export const collectReachableNodeIds = (
  rootId: string,
  nodes: FlowNode[],
  edges: FlowEdge[]
): Set<string> => {
  const nodeIds = new Set(nodes.map(node => node.id))
  const visited = new Set<string>()
  const queue: string[] = []

  if (!rootId || !nodeIds.has(rootId)) return visited

  visited.add(rootId)
  queue.push(rootId)

  while (queue.length > 0) {
    const currentId = queue.shift()
    if (!currentId) continue

    edges
      .filter(edge => edge.source === currentId && nodeIds.has(edge.target))
      .forEach(edge => {
        if (visited.has(edge.target)) return
        visited.add(edge.target)
        queue.push(edge.target)
      })
  }

  return visited
}

export const filterSubgraphEdges = (
  edges: FlowEdge[],
  visibleNodeIds: Set<string>
): FlowEdge[] => edges.filter(edge => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target))
