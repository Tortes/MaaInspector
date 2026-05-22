import { ref } from 'vue'
import type { EdgeMouseEvent, NodeMouseEvent } from '@vue-flow/core'
import type { FlowNode, FlowEdge, FlowBusinessData, SpacingKey, LayoutAlgorithm, LayoutDirection, MenuType } from '@/utils/flowTypes'
import type { EdgeType } from '@/utils/flowOptions'
import { isEdgeType, isSpacingKey, isLayoutAlgorithm, isLayoutDirection } from '@/utils/typeGuards'

type MenuData = FlowNode | FlowEdge | null

export interface MenuState {
  visible: boolean
  x: number
  y: number
  type: MenuType
  data: MenuData
  flowPos: { x: number; y: number } | null
}

export interface EditorActionsDeps {
  nodes: { value: FlowNode[] }
  edges: { value: FlowEdge[] }
  currentEdgeType: { value: EdgeType }
  currentSpacing: { value: SpacingKey }
  currentAlgorithm: { value: LayoutAlgorithm }
  currentDirection: { value: LayoutDirection }
  isFileLoaded: { value: boolean }
  createNodeObject: (id: string, rawContent: FlowBusinessData, isMissing?: boolean, originalId?: string) => FlowNode
  applyLayout: (options?: Partial<{ algorithm: LayoutAlgorithm; direction: LayoutDirection; spacing: SpacingKey }>) => Promise<void>
  removeEdges: (ids: string[]) => void
  setEdgeJumpBack: (edgeId: string, isJumpBack: boolean) => void
  layoutChainFromNode: (startId: string, spacingKey?: SpacingKey, algorithm?: LayoutAlgorithm) => Promise<void>
  markDataChanged: () => void
  fitView: (options?: Record<string, unknown>) => void
  screenToFlowCoordinate: (pos: { x: number; y: number }) => { x: number; y: number }
  snapshotState: () => void
  onDebugNode: (nodeId: string, mode: 'standard' | 'recognition_only') => void
  onOpenDebugPanel: (payload?: { nodeId?: string }) => void
  onCloseDebugPanel: () => void
  onIncrementCloseAllDetails: () => void
}

export function useEditorActions(deps: EditorActionsDeps) {
  const {
    nodes, edges, currentEdgeType, currentSpacing, currentAlgorithm, currentDirection,
    isFileLoaded, createNodeObject, applyLayout, removeEdges, setEdgeJumpBack,
    layoutChainFromNode, markDataChanged, fitView, screenToFlowCoordinate,
    snapshotState, onDebugNode, onOpenDebugPanel, onCloseDebugPanel, onIncrementCloseAllDetails
  } = deps

  const menu = ref<MenuState>({ visible: false, x: 0, y: 0, type: 'pane', data: null, flowPos: { x: 0, y: 0 } })
  const searchVisible = ref(false)

  const closeMenu = () => { menu.value.visible = false }

  const getEvent = (params: MouseEvent | NodeMouseEvent | EdgeMouseEvent): MouseEvent => {
    if ('event' in params && params.event instanceof MouseEvent) return params.event
    return params as MouseEvent
  }

  const onPaneContextMenu = (params: MouseEvent) => {
    if (!isFileLoaded.value) return
    const event = getEvent(params)
    event.preventDefault()
    menu.value = {
      visible: true, x: event.clientX, y: event.clientY, type: 'pane', data: null,
      flowPos: screenToFlowCoordinate({ x: event.clientX, y: event.clientY })
    }
  }

  const onNodeContextMenu = (params: NodeMouseEvent) => {
    const event = getEvent(params)
    event.preventDefault()
    menu.value = { visible: true, x: event.clientX, y: event.clientY, type: 'node', data: params.node, flowPos: null }
  }

  const onEdgeContextMenu = (params: EdgeMouseEvent) => {
    const event = getEvent(params)
    event.preventDefault()
    menu.value = { visible: true, x: event.clientX, y: event.clientY, type: 'edge', data: params.edge, flowPos: null }
  }

  const isFlowNodeData = (value: MenuData): value is FlowNode => !!value && 'position' in value

  type MenuAction = {
    action: string
    type: MenuType
    data: FlowNode | FlowEdge | null
    payload?: string | EdgeType | SpacingKey | LayoutAlgorithm | LayoutDirection | null
  }

  const handleMenuAction = ({ action, type, data, payload }: MenuAction) => {
    closeMenu()
    switch (action) {
      case 'add': {
        const recognition = typeof payload === 'string' ? payload : undefined
        const newId = `N-${Date.now()}`
        const newNode = createNodeObject(newId, { id: newId, recognition: recognition || 'DirectHit' })
        if (menu.value.flowPos) newNode.position = { ...menu.value.flowPos }
        nodes.value = [...nodes.value, newNode]
        markDataChanged()
        break
      }
      case 'add_anchor': {
        const anchorId = `A-${Date.now()}`
        const anchorNode = createNodeObject(anchorId, { id: anchorId, recognition: 'Anchor', anchor: true })
        if (menu.value.flowPos) anchorNode.position = { ...menu.value.flowPos }
        anchorNode.data = { ...(anchorNode.data || {}), type: 'Anchor', id: anchorId }
        nodes.value = [...nodes.value, anchorNode]
        markDataChanged()
        break
      }
      case 'debug_this_node':
        if (type === 'node' && isFlowNodeData(data) && data.id) onDebugNode(String(data.id), 'standard')
        break
      case 'debug_this_node_reco':
        if (type === 'node' && isFlowNodeData(data) && data.id) onDebugNode(String(data.id), 'recognition_only')
        break
      case 'debug_in_panel':
        if (type === 'node' && isFlowNodeData(data) && data.id) onOpenDebugPanel({ nodeId: String(data.id) })
        break
      case 'edit':
        break
      case 'duplicate':
        if (type === 'node' && isFlowNodeData(data) && data.data?.data && data.position) {
          const copyId = `N-${Date.now()}`
          const sourceData = data.data.data
          const sourceMeta = data.data
          const copyData: FlowBusinessData = { ...JSON.parse(JSON.stringify(sourceData)), id: copyId }
          delete (copyData as Record<string, unknown>).next
          delete (copyData as Record<string, unknown>).on_error
          const copyNode = createNodeObject(copyId, copyData)
          if (sourceMeta._images?.length && copyNode.data) {
            copyNode.data._images = JSON.parse(JSON.stringify(sourceMeta._images))
          }
          copyNode.position = { x: data.position.x + 50, y: data.position.y + 50 }
          nodes.value = [...nodes.value, copyNode]
          markDataChanged()
        }
        break
      case 'delete':
        if (type === 'node' && data?.id) {
          const edgeIds = edges.value.filter(e => e.source === data.id || e.target === data.id).map(e => e.id)
          removeEdges(edgeIds)
          nodes.value = nodes.value.filter(n => n.id !== data.id)
          markDataChanged()
        } else if (type === 'edge' && data?.id) {
          removeEdges([data.id])
          markDataChanged()
        }
        break
      case 'setJumpBack':
        if (type === 'edge' && data?.id) setEdgeJumpBack(data.id, true)
        break
      case 'setNormalLink':
        if (type === 'edge' && data?.id) setEdgeJumpBack(data.id, false)
        break
      case 'layout_chain':
        if (type === 'node' && isFlowNodeData(data) && data.id) layoutChainFromNode(data.id, currentSpacing.value)
        break
      case 'layout_chain_with_algo':
        if (type === 'node' && isFlowNodeData(data) && data.id && isLayoutAlgorithm(payload)) {
          layoutChainFromNode(data.id, currentSpacing.value, payload)
        }
        break
      case 'layout':
        applyLayout()
        break
      case 'changeAlgorithm':
        if (isLayoutAlgorithm(payload)) { currentAlgorithm.value = payload; applyLayout({ algorithm: payload }) }
        break
      case 'changeDirection':
        if (isLayoutDirection(payload)) { currentDirection.value = payload; applyLayout({ direction: payload }) }
        break
      case 'changeSpacing':
        if (isSpacingKey(payload)) { currentSpacing.value = payload; applyLayout({ spacing: payload }) }
        break
      case 'changeEdgeType':
        if (isEdgeType(payload)) { currentEdgeType.value = payload; edges.value = edges.value.map(e => ({ ...e, type: payload })) }
        break
      case 'reset':
        fitView({ padding: 0.2, duration: 500 })
        break
      case 'clear':
        nodes.value = []
        edges.value = []
        break
      case 'search':
        searchVisible.value = true
        break
      case 'closeSearch':
        searchVisible.value = false
        break
      case 'openDebugPanel':
        onOpenDebugPanel({ nodeId: type === 'node' && isFlowNodeData(data) ? String(data.id) : '' })
        break
      case 'closeDebugPanel':
        onCloseDebugPanel()
        break
      case 'closeAllDetails':
        onIncrementCloseAllDetails()
        break
    }
    snapshotState()
  }

  return {
    menu,
    searchVisible,
    closeMenu,
    onPaneContextMenu,
    onNodeContextMenu,
    onEdgeContextMenu,
    handleMenuAction,
    isFlowNodeData
  }
}
