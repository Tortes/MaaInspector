import { describe, it, expect, vi } from 'vitest'
import { useFlowGraph } from '@/composables/useFlowGraph'

// Mock the dependencies
vi.mock('@vue-flow/core', () => ({
  useVueFlow: () => ({
    addEdges: vi.fn(),
    removeEdges: vi.fn(),
    findNode: vi.fn(),
    fitView: vi.fn(),
  }),
  MarkerType: {
    ArrowClosed: 'arrowclosed',
  },
}))

vi.mock('../composables/useLayout', () => ({
  useLayout: () => ({
    elkLayout: vi.fn().mockImplementation((nodes: unknown, _edges: unknown, _options: unknown) => {
      return Promise.resolve(nodes)
    }),
    applyLayoutOnRefs: vi.fn(),
    applyOrderedChainLayout: vi.fn(),
  }),
}))

vi.mock('../composables/useImageManager', () => ({
  useImageManager: () => ({
    getImageData: vi.fn(),
    clearTempImageData: vi.fn(),
    deleteImage: vi.fn(),
    addTempImage: vi.fn(),
    restoreImage: vi.fn(),
    setNodeImages: vi.fn(),
    resetForFile: vi.fn(),
    commitPendingImageChanges: vi.fn(),
    migrateNodeState: vi.fn(),
    removeNodeState: vi.fn(),
    exportState: vi.fn(() => ({ nodeImageStates: [] })),
    restoreState: vi.fn(),
  }),
}))

describe('Duplicate Missing Nodes', () => {
  it('should create separate instances for duplicate missing nodes', () => {
    const { loadNodes, nodes } = useFlowGraph()
    
    const testData = {
      NodeA: { next: 'MissingNode' },
      NodeB: { next: 'MissingNode' },
      NodeC: { next: 'MissingNode' },
    }

    loadNodes({
      filename: 'test.json',
      source: JSON.stringify(testData),
      nodes: testData,
    })

    // Check that three separate missing nodes are created
    const missingNodes = nodes.value.filter(n => n.data?._isMissing)
    expect(missingNodes).toHaveLength(3)

    // Check that all missing nodes have unique IDs
    const missingNodeIds = missingNodes.map(n => n.id)
    expect(missingNodeIds).toContain('MissingNode')
    expect(missingNodeIds).toContain('MissingNode_2')
    expect(missingNodeIds).toContain('MissingNode_3')

    // Check that duplicate missing nodes have _originalId set to "MissingNode"
    const duplicateNodes = missingNodes.filter(n => n.id !== 'MissingNode')
    duplicateNodes.forEach(node => {
      expect(node.data?._originalId).toBe('MissingNode')
    })
    
    // First missing node should not have _originalId
    const firstMissingNode = missingNodes.find(n => n.id === 'MissingNode')
    expect(firstMissingNode?.data?._originalId).toBeUndefined()
  })

  it('should create edges from each source node to its corresponding missing node', () => {
    const { loadNodes, edges } = useFlowGraph()
    
    const testData = {
      NodeA: { next: 'MissingNode' },
      NodeB: { next: 'MissingNode' },
      NodeC: { next: 'MissingNode' },
    }

    loadNodes({
      filename: 'test.json',
      source: JSON.stringify(testData),
      nodes: testData,
    })

    // Check that edges are created correctly
    expect(edges.value).toHaveLength(3)
    
    const edgeTargets = edges.value.map(e => e.target)
    expect(edgeTargets).toContain('MissingNode')
    expect(edgeTargets).toContain('MissingNode_2')
    expect(edgeTargets).toContain('MissingNode_3')
  })

  it('should handle single missing node without suffix', () => {
    const { loadNodes, nodes } = useFlowGraph()
    
    const testData = {
      NodeA: { next: 'MissingNode' },
    }

    loadNodes({
      filename: 'test.json',
      source: JSON.stringify(testData),
      nodes: testData,
    })

    const missingNodes = nodes.value.filter(n => n.data?._isMissing)
    expect(missingNodes).toHaveLength(1)
    expect(missingNodes[0].id).toBe('MissingNode')
    expect(missingNodes[0].data?._originalId).toBeUndefined()
  })

  it('should handle multiple different missing nodes', () => {
    const { loadNodes, nodes } = useFlowGraph()
    
    const testData = {
      NodeA: { next: 'MissingNode1' },
      NodeB: { next: 'MissingNode2' },
    }

    loadNodes({
      filename: 'test.json',
      source: JSON.stringify(testData),
      nodes: testData,
    })

    const missingNodes = nodes.value.filter(n => n.data?._isMissing)
    expect(missingNodes).toHaveLength(2)
    
    const missingNodeIds = missingNodes.map(n => n.id)
    expect(missingNodeIds).toContain('MissingNode1')
    expect(missingNodeIds).toContain('MissingNode2')
  })

  it('should export nodes without missing nodes', () => {
    const { loadNodes, getNodesData } = useFlowGraph()
    
    const testData = {
      NodeA: { next: 'MissingNode' },
      NodeB: { next: 'MissingNode' },
      NodeC: { next: 'MissingNode' },
    }

    loadNodes({
      filename: 'test.json',
      source: JSON.stringify(testData),
      nodes: testData,
    })

    const exportedData = getNodesData()
    
    // Missing nodes should not be included in export
    expect(exportedData).not.toHaveProperty('MissingNode')
    expect(exportedData).not.toHaveProperty('MissingNode_2')
    expect(exportedData).not.toHaveProperty('MissingNode_3')
    
    // Original nodes should be included
    expect(exportedData).toHaveProperty('NodeA')
    expect(exportedData).toHaveProperty('NodeB')
    expect(exportedData).toHaveProperty('NodeC')
  })

  it('should create duplicate missing nodes for on_error field', () => {
    const { loadNodes, nodes, edges } = useFlowGraph()
    
    const testData = {
      NodeA: { on_error: 'MissingNode' },
      NodeB: { on_error: 'MissingNode' },
    }

    loadNodes({
      filename: 'test.json',
      source: JSON.stringify(testData),
      nodes: testData,
    })

    const missingNodes = nodes.value.filter(n => n.data?._isMissing)
    expect(missingNodes).toHaveLength(2)

    const missingNodeIds = missingNodes.map(n => n.id)
    expect(missingNodeIds).toContain('MissingNode')
    expect(missingNodeIds).toContain('MissingNode_2')

    // Check edges point to correct targets
    const edgeTargets = edges.value.map(e => e.target)
    expect(edgeTargets).toContain('MissingNode')
    expect(edgeTargets).toContain('MissingNode_2')
  })

  it('should create duplicate missing nodes for timeout_next field', () => {
    const { loadNodes, nodes, edges } = useFlowGraph()
    
    const testData = {
      NodeA: { timeout_next: 'MissingNode' },
      NodeB: { timeout_next: 'MissingNode' },
    }

    loadNodes({
      filename: 'test.json',
      source: JSON.stringify(testData),
      nodes: testData,
    })

    const missingNodes = nodes.value.filter(n => n.data?._isMissing)
    expect(missingNodes).toHaveLength(2)

    const missingNodeIds = missingNodes.map(n => n.id)
    expect(missingNodeIds).toContain('MissingNode')
    expect(missingNodeIds).toContain('MissingNode_2')

    // Check edges point to correct targets
    const edgeTargets = edges.value.map(e => e.target)
    expect(edgeTargets).toContain('MissingNode')
    expect(edgeTargets).toContain('MissingNode_2')
  })

  it('should handle array-type targets with duplicate missing nodes', () => {
    const { loadNodes, nodes, edges } = useFlowGraph()
    
    const testData = {
      NodeA: { next: ['MissingNode', 'MissingNode'] },
      NodeB: { next: 'MissingNode' },
    }

    loadNodes({
      filename: 'test.json',
      source: JSON.stringify(testData),
      nodes: testData,
    })

    const missingNodes = nodes.value.filter(n => n.data?._isMissing)
    expect(missingNodes).toHaveLength(3)

    const missingNodeIds = missingNodes.map(n => n.id)
    expect(missingNodeIds).toContain('MissingNode')
    expect(missingNodeIds).toContain('MissingNode_2')
    expect(missingNodeIds).toContain('MissingNode_3')

    // Check edges point to correct targets
    const edgeTargets = edges.value.map(e => e.target)
    expect(edgeTargets).toContain('MissingNode')
    expect(edgeTargets).toContain('MissingNode_2')
    expect(edgeTargets).toContain('MissingNode_3')
  })
})
