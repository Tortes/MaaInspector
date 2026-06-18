import { describe, expect, it } from 'vitest'
import { collectReachableNodeIds, filterSubgraphEdges } from '@/utils/flowSubgraph'
import type { FlowEdge, FlowNode } from '@/utils/flowTypes'

const node = (id: string): FlowNode => ({
  id,
  type: 'custom',
  position: { x: 0, y: 0 },
  data: { id, type: 'DirectHit', data: { id } }
})

const edge = (source: string, target: string, label = 'next'): FlowEdge => ({
  id: `e-${source}-${target}-${label}`,
  source,
  target,
  sourceHandle: label === 'next' ? 'source-a' : 'source-c',
  targetHandle: 'in',
  label
})

describe('flowSubgraph', () => {
  it('collects the target node, descendants, and timeout/error branches from actual outgoing edges', () => {
    const nodes = ['root', 'nextChild', 'errorChild', 'timeoutChild', 'grandChild', 'unrelated'].map(node)
    const edges = [
      edge('root', 'nextChild', 'next'),
      edge('root', 'errorChild', 'on_error'),
      edge('root', 'timeoutChild', 'timeout_next'),
      edge('nextChild', 'grandChild', 'next'),
      edge('unrelated', 'root', 'next')
    ]

    expect(Array.from(collectReachableNodeIds('root', nodes, edges)).sort()).toEqual([
      'errorChild',
      'grandChild',
      'nextChild',
      'root',
      'timeoutChild'
    ])
  })

  it('does not loop forever on cyclic chains', () => {
    const nodes = ['a', 'b', 'c'].map(node)
    const edges = [
      edge('a', 'b'),
      edge('b', 'c'),
      edge('c', 'a')
    ]

    expect(Array.from(collectReachableNodeIds('a', nodes, edges)).sort()).toEqual(['a', 'b', 'c'])
  })

  it('filters edges to only connections where both endpoints are visible', () => {
    const edges = [
      edge('a', 'b'),
      edge('b', 'c'),
      edge('a', 'hidden')
    ]

    expect(filterSubgraphEdges(edges, new Set(['a', 'b', 'c'])).map(item => item.id)).toEqual([
      'e-a-b-next',
      'e-b-c-next'
    ])
  })
})
