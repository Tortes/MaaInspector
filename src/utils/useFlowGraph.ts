// src/composables/useFlowGraph.ts
import { ref, shallowRef, triggerRef, markRaw, computed } from 'vue'
import { useVueFlow, MarkerType } from '@vue-flow/core'
import { useLayout, type LayoutOptions } from './useLayout'
import { useImageManager } from './useImageManager'
import { SPACING_OPTIONS, type EdgeType } from './flowOptions'
import type {
  FlowBusinessData,
  FlowConnection,
  FlowEdge,
  FlowEdgeChange,
  FlowNode,
  FlowNodeMeta,
  ImageDataPayload,
  LoadNodesPayload,
  NodeStatus,
  NodeUpdatePayload,
  SpacingKey,
  LayoutAlgorithm,
  LayoutDirection,
  TemplateImage
} from './flowTypes'
import CustomNode from '../components/Flow/CustomNode.vue'

type EdgeStyleResult = Pick<FlowEdge, 'style' | 'animated' | 'type' | 'markerEnd' | 'data'>

interface PortMapping {
  field: 'next' | 'on_error' | 'timeout_next'
  type: 'array'
  color: string
}

export function useFlowGraph() {
  const nodes = shallowRef<FlowNode[]>([])
  const edges = shallowRef<FlowEdge[]>([])
  const currentEdgeType = ref<EdgeType>('smoothstep')
  const currentSpacing = ref<SpacingKey>('normal')
  const currentAlgorithm = ref<LayoutAlgorithm>('layered')
  const currentDirection = ref<LayoutDirection>('TB')
  const currentFilename = ref('')
  const currentSource = ref('')
  const originalDataSnapshot = ref('')
  const dataSnapshot = ref('')
  const selectedNodeId = ref<string | null>(null)

  const nodeTypes = { custom: markRaw(CustomNode) }
  
  const imageManager = useImageManager()

  const PORT_MAPPING: Record<string, PortMapping> = {
    'source-a': { field: 'next', type: 'array', color: '#3b82f6' },
    'source-c': { field: 'on_error', type: 'array', color: '#f43f5e' }
  }

  const { addEdges, removeEdges, findNode, fitView } = useVueFlow()
  const {
    elkLayout,
    applyLayoutOnRefs,
    applyOrderedChainLayout
  } = useLayout()

  const ensureNodeMeta = (node?: FlowNode | null): FlowNodeMeta | null => {
    if (!node) return null
    if (!node.data) node.data = { id: node.id, type: 'Unknown', data: {} }
    if (!node.data.data) node.data.data = {}
    return node.data
  }

  const getNodesData = (): Record<string, FlowBusinessData> => {
    const result: Record<string, FlowBusinessData> = {}
    nodes.value.forEach(node => {
      if (node.data?._isMissing) return
      if (node.data?.type === 'Unknown') return

      const nodeData = { ...(node.data?.data || {}) } as FlowBusinessData
      // 仅锚点节点类型不导出，普通节点的 anchor 属性需正常导出
      if (node.data?.type === 'Anchor') return

      delete (nodeData as Record<string, unknown>).id
      delete (nodeData as Record<string, unknown>).interrupt
      result[node.id] = nodeData
    })
    return result
  }

  const isDirty = computed(() => {
    if (!originalDataSnapshot.value) return false
    return dataSnapshot.value !== originalDataSnapshot.value
  })

  const recalcDataSnapshot = () => {
    dataSnapshot.value = JSON.stringify(getNodesData())
    return dataSnapshot.value
  }

  const markDataChanged = () => {
    recalcDataSnapshot()
  }

  const clearDirty = () => {
    recalcDataSnapshot()
    originalDataSnapshot.value = dataSnapshot.value
  }

  const setNodeStatus = (nodeId: string, status: NodeStatus) => {
    if (!nodeId || status === undefined) return false
    const nextStatus: string | undefined = status ?? undefined
    const index = nodes.value.findIndex((n) => {
      const dataId = (n.data?.data as FlowBusinessData | undefined)?.id
      return n.id === nodeId || dataId === nodeId
    })
    if (index < 0) return false
    const node = nodes.value[index]
    const meta = ensureNodeMeta(node)
    if (!meta || meta.status === nextStatus) return false
    nodes.value[index] = { ...node, data: { ...meta, status: nextStatus } }
    triggerRef(nodes)
    return true
  }

  const selectNodeById = (nodeId?: string | null) => {
    const nextId = nodeId || null
    if (selectedNodeId.value === nextId) return false
    let changed = false

    if (selectedNodeId.value) {
      const prevIndex = nodes.value.findIndex(n => n.id === selectedNodeId.value)
      if (prevIndex >= 0) {
        const prevNode = nodes.value[prevIndex]
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(nodes.value as any)[prevIndex] = { ...prevNode, selected: false }
        changed = true
      }
    }

    if (nextId) {
      const nextIndex = nodes.value.findIndex(n => n.id === nextId)
      if (nextIndex >= 0) {
        const nextNode = nodes.value[nextIndex]
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(nodes.value as any)[nextIndex] = { ...nextNode, selected: true }
        changed = true
      }
    }

    selectedNodeId.value = nextId
    if (changed) triggerRef(nodes)
    return changed
  }

  const getEdgeStyle = (handleId: string, isJumpBack = false): EdgeStyleResult => {
    const config = PORT_MAPPING[handleId] || { color: '#94a3b8' }
    const strokeColor = isJumpBack ? '#a855f7' : config.color

    return {
      style: {
        stroke: strokeColor,
        strokeWidth: 2,
        strokeDasharray: '5 5'
      },
      animated: true,
      type: currentEdgeType.value,
      markerEnd: MarkerType.ArrowClosed,
      data: { isJumpBack }
    }
  }

  const stripPrefix = (val: string) => val.replace(/\[(Anchor|JumpBack)\]/g, '')
  const buildLinkId = (targetId: string, isAnchor: boolean, isJumpBack: boolean) => {
    let id = targetId
    // 统一顺序：Anchor 在前，JumpBack 在后；但解析允许任意顺序
    if (isAnchor) id = `[Anchor]${id}`
    if (isJumpBack) id = `[JumpBack]${id}`
    return id
  }
  const parseLinkFlags = (val?: string) => ({
    anchor: !!val && val.includes('[Anchor]'),
    jumpBack: !!val && val.includes('[JumpBack]'),
    id: val ? stripPrefix(val) : ''
  })
  const isAnchorNode = (node?: FlowNode | null) =>
    !!(node?.data?.type === 'Anchor' || (node?.data?.data as FlowBusinessData | undefined)?.anchor)

  const normalizeLinksAcrossNodes = (targetNodes: FlowNode[]) => {
    const anchorIds = new Set(targetNodes.filter(n => isAnchorNode(n)).map(n => n.id))
    const normalizeItem = (item: unknown) => {
      if (typeof item !== 'string') return item
      const flags = parseLinkFlags(item)
      const targetId = flags.id || item
      const isAnchorTarget = anchorIds.has(targetId) || flags.anchor
      return buildLinkId(targetId, isAnchorTarget, flags.jumpBack)
    }
    const normalizeField = (val: unknown) => {
      if (Array.isArray(val)) return val.map(normalizeItem).filter(Boolean)
      if (typeof val === 'string') return normalizeItem(val)
      return val
    }

    targetNodes.forEach(n => {
      const meta = ensureNodeMeta(n)
      if (!meta?.data) return
      const data = meta.data as FlowBusinessData
      ;(['next', 'on_error', 'timeout_next'] as const).forEach(field => {
        const rawVal = (data as Record<string, unknown>)[field]
        const normalized = normalizeField(rawVal)
        if (normalized === undefined || normalized === null || (Array.isArray(normalized) && normalized.length === 0)) {
          delete (data as Record<string, unknown>)[field]
        } else {
          (data as Record<string, unknown>)[field] = normalized as any
        }
      })
    })
  }

  const onValidateConnection = (connection: FlowConnection) => {
    if (connection.source === connection.target) return false
    if (connection.sourceHandle === 'in') return false
    return connection.targetHandle === 'in'
  }

  const createNodeObject = (id: string, rawContent: FlowBusinessData, isMissing = false, originalId?: string): FlowNode => {
    const sanitizedContent = { ...rawContent }
    delete (sanitizedContent as Record<string, unknown>).interrupt

    let logicType = sanitizedContent.recognition || 'DirectHit'
    if (isMissing) logicType = 'Unknown'
    const isUnknown = logicType === 'Unknown'

    return {
      id,
      type: 'custom',
      position: { x: 0, y: 0 },
      data: {
        id,
        type: logicType,
        data: isUnknown
          ? { id, ...(sanitizedContent.anchor ? { anchor: sanitizedContent.anchor } : {}) }
          : { ...sanitizedContent, id, recognition: logicType },
        _isMissing: isMissing,
        _originalId: originalId,
        status: 'idle'
      }
    }
  }

  const updateNodeDataConnection = (
    sourceNode: FlowNode,
    field: PortMapping['field'],
    targetId: string,
    isArrayType: boolean,
    isAdd: boolean,
    isJumpBack = false,
    isAnchorTarget = false
  ) => {
    const sourceMeta = ensureNodeMeta(sourceNode)
    if (!sourceMeta || !sourceMeta.data) return
    const data = sourceMeta.data as FlowBusinessData
    // For duplicate missing nodes, use the original ID (without suffix) for storage
    const targetNode = findNode(targetId)
    const actualTargetId = (targetNode?.data?._isMissing && targetNode?.data?._originalId) ? targetNode.data._originalId : targetId
    const storedId = buildLinkId(actualTargetId, isAnchorTarget, isJumpBack)

    if (isArrayType) {
      if (!Array.isArray(data[field])) data[field] = []

      const existingIndex = (data[field] as unknown[]).findIndex(id =>
        typeof id === 'string' && stripPrefix(id) === targetId
      )

      if (isAdd) {
        if (existingIndex === -1) {
          (data[field] as unknown[]).push(storedId)
        } else {
          (data[field] as unknown[])[existingIndex] = storedId
        }
      } else if (existingIndex > -1) {
        (data[field] as unknown[]).splice(existingIndex, 1)
      }
    } else {
      if (isAdd) {
        data[field] = storedId
      } else {
        const currentVal = (data as Record<string, unknown>)[field] as string | undefined
        if (typeof currentVal === 'string' && stripPrefix(currentVal) === targetId) {
          delete (data as Record<string, unknown>)[field]
        }
      }
    }
  }

  const handleConnect = (params: FlowConnection) => {
    const existingEdge = edges.value.find(e =>
      e.source === params.source && e.target === params.target && e.sourceHandle === params.sourceHandle
    )
    const portConfig = PORT_MAPPING[params.sourceHandle || '']
    const sourceNode = findNode(params.source)
    const targetNode = findNode(params.target)
    const isAnchorTarget = isAnchorNode(targetNode)
    let changed = false

    if (existingEdge) {
      removeEdges([existingEdge.id])
      if (sourceNode && portConfig) {
        updateNodeDataConnection(sourceNode, portConfig.field, params.target, portConfig.type === 'array', false, false, isAnchorTarget)
        changed = true
      }
    } else {
      addEdges({ ...params, ...getEdgeStyle(params.sourceHandle || '', false), label: portConfig?.field })
      if (sourceNode && portConfig) {
        updateNodeDataConnection(sourceNode, portConfig.field, params.target, portConfig.type === 'array', true, false, isAnchorTarget)
        changed = true
      }
    }
    if (changed) markDataChanged()
  }

  const handleEdgesChange = (changes: FlowEdgeChange[]) => {
    let changed = false
    changes.forEach(change => {
      if (change.type === 'remove') {
        const edge = edges.value.find(e => e.id === change.id)
        if (edge) {
          const sourceNode = findNode(edge.source)
          const portConfig = PORT_MAPPING[edge.sourceHandle || '']
          if (sourceNode && portConfig) {
            const targetNode = findNode(edge.target)
            const isAnchorTarget = isAnchorNode(targetNode)
            updateNodeDataConnection(sourceNode, portConfig.field, edge.target, portConfig.type === 'array', false, false, isAnchorTarget)
            changed = true
          }
        }
      }
    })
    if (changed) markDataChanged()
  }

  const setEdgeJumpBack = (edgeId: string, isJumpBack: boolean) => {
    const edge = edges.value.find(e => e.id === edgeId)
    if (!edge) return

    const sourceNode = findNode(edge.source)
    const portConfig = PORT_MAPPING[edge.sourceHandle || '']
    const targetNode = findNode(edge.target)
    const isAnchorTarget = isAnchorNode(targetNode)

    edge.data = { ...edge.data, isJumpBack }
    edge.label = isJumpBack ? 'JumpBack' : (portConfig?.field || '')

    const newStyle = getEdgeStyle(edge.sourceHandle || '', isJumpBack)
    edge.style = newStyle.style
    edge.animated = newStyle.animated

    triggerRef(edges)

      if (sourceNode && portConfig) {
        updateNodeDataConnection(sourceNode, portConfig.field, edge.target, portConfig.type === 'array', true, isJumpBack, isAnchorTarget)
        markDataChanged()
      }
    }

  const handleNodeUpdate = ({ oldId, newId, newType, newData }: NodeUpdatePayload) => {
    const node = findNode(oldId)
    if (!node) return
    const nodeMeta = ensureNodeMeta(node)
    if (!nodeMeta) return

    if (newData && (newData as Record<string, unknown>)._action) {
      handleSpecialAction(node, newData)
      triggerRef(nodes)
      markDataChanged()
      return
    }

    if (oldId !== newId) {
      if (findNode(newId)) { alert(`ID "${newId}" already exists!`); return }

      node.id = newId
      nodeMeta.id = newId
      if (nodeMeta.data) nodeMeta.data.id = newId

      edges.value = edges.value.map(e => {
        const update: Partial<FlowEdge> = {}
        if (e.source === oldId) update.source = newId
        if (e.target === oldId) update.target = newId
        return (update.source || update.target) ? { ...e, ...update, id: e.id.replace(oldId, newId) } : e
      })
      triggerRef(edges)

      const replaceLinkVal = (val: unknown) => {
        if (typeof val !== 'string') return val
        const flags = parseLinkFlags(val)
        const targetId = flags.id || val
        // For duplicate missing nodes, also check if the stored ID matches the original ID
        const oldNode = findNode(oldId)
        const originalId = oldNode?.data?._originalId
        if (targetId !== oldId && targetId !== originalId) return val
        // Use the new ID directly (without suffix) for storage
        return buildLinkId(newId, flags.anchor, flags.jumpBack)
      }
      const replaceField = (d: Record<string, unknown>, field: string) => {
        const fieldVal = d[field]
        if (Array.isArray(fieldVal)) {
          d[field] = fieldVal.map(replaceLinkVal) as unknown[]
        } else if (typeof fieldVal === 'string') {
          const newVal = replaceLinkVal(fieldVal)
          d[field] = newVal as unknown
        }
      }

      nodes.value.forEach(n => {
        if (!n.data?.data) return
        const d = n.data.data as Record<string, unknown>
        ;['next', 'on_error', 'timeout_next'].forEach(f => replaceField(d, f))
      })
    }

    nodeMeta.type = newType
    if (newData) nodeMeta.data = { ...newData, id: node.id, recognition: newType }
    else if (nodeMeta.data) nodeMeta.data.recognition = newType

    normalizeLinksAcrossNodes(nodes.value)
    triggerRef(nodes)
    markDataChanged()
  }

  const modifyTemplatePath = (nodeData: FlowNodeMeta, path: string, mode: 'add' | 'remove' = 'add') => {
    if (!nodeData.data) nodeData.data = {}
    const tpl = (nodeData.data as FlowBusinessData).template

    let paths: Array<string> = []
    if (Array.isArray(tpl)) paths = [...tpl] as string[]
    else if (typeof tpl === 'string' && tpl) paths = [tpl]

    if (mode === 'add') {
      if (!paths.includes(path)) paths.push(path)
    } else if (mode === 'remove') {
      paths = paths.filter(p => p !== path)
    }
    ;(nodeData.data as FlowBusinessData).template = paths
  }

  const normalizeTemplateList = (val: unknown): string[] => {
    if (Array.isArray(val)) return val.map(v => String(v)).filter(Boolean)
    if (typeof val === 'string' && val.trim()) return [val.trim()]
    return []
  }

  const updateCompositeTemplate = (
    meta: FlowNodeMeta,
    target: { compositeKey: 'all_of' | 'any_of'; compositeIndex: number },
    updater: (current: string[]) => string[]
  ) => {
    if (!meta.data) meta.data = {}
    const data = meta.data as Record<string, unknown>

    const applyUpdate = (list: unknown, assign: (nextList: unknown[]) => void) => {
      if (!Array.isArray(list) || target.compositeIndex < 0 || target.compositeIndex >= list.length) return
      const item = list[target.compositeIndex]
      if (!item || typeof item !== 'object') return
      const itemObj = { ...(item as Record<string, unknown>) }
      const current = normalizeTemplateList(itemObj.template)
      const next = updater(current)
      if (!next.length) delete itemObj.template
      else if (next.length === 1) itemObj.template = next[0]
      else itemObj.template = next
      const nextList = [...list]
      nextList[target.compositeIndex] = itemObj
      assign(nextList)
    }

    applyUpdate(data[target.compositeKey], (nextList) => {
      data[target.compositeKey] = nextList
    })

    const recognition = data.recognition
    if (recognition && typeof recognition === 'object' && !Array.isArray(recognition)) {
      const param = (recognition as Record<string, unknown>).param
      if (param && typeof param === 'object' && !Array.isArray(param)) {
        applyUpdate((param as Record<string, unknown>)[target.compositeKey], (nextList) => {
          ;(param as Record<string, unknown>)[target.compositeKey] = nextList
        })
      }
    }
  }

  const handleSpecialAction = (node: FlowNode, actionData: FlowBusinessData) => {
    const meta = ensureNodeMeta(node)
    if (!meta) return
    const action = (actionData as Record<string, unknown>)._action as string | undefined
    const templateTarget = (actionData as Record<string, unknown>).templateTarget as
      | { compositeKey: 'all_of' | 'any_of'; compositeIndex: number }
      | undefined

    if (action === 'delete_images' || (action === 'save_screenshot' && Array.isArray((actionData as Record<string, unknown>).deletePaths))) {
      const deletePaths = (actionData as Record<string, unknown>).deletePaths as string[] || []
      if (!deletePaths.length) return
      
      deletePaths.forEach(path => imageManager.deleteImage(node.id, path))
      
      if (templateTarget) {
        deletePaths.forEach(path => {
          updateCompositeTemplate(meta, templateTarget, current => current.filter(p => p !== path))
        })
      } else {
        deletePaths.forEach(path => modifyTemplatePath(meta, path, 'remove'))
      }
    }

    if (action === 'add_temp_image') {
      const { imagePath, imageBase64 } = actionData as Record<string, string>
      if (!imagePath || !imageBase64) return
      
      imageManager.addTempImage(node.id, imagePath, imageBase64)
      
      if (templateTarget) {
        updateCompositeTemplate(meta, templateTarget, current => current.includes(imagePath) ? current : [...current, imagePath])
      } else {
        modifyTemplatePath(meta, imagePath, 'add')
      }
    }

    if (action === 'restore_image') {
      const { imagePath } = actionData as Record<string, string>
      imageManager.restoreImage(node.id, imagePath)
      
      if (templateTarget) {
        updateCompositeTemplate(meta, templateTarget, current => current.includes(imagePath) ? current : [...current, imagePath])
      } else {
        modifyTemplatePath(meta, imagePath, 'add')
      }
    }

    if (action === 'save_image_changes') {
      const { validPaths, images, tempImages } = actionData as Record<string, unknown> & {
        validPaths?: string[]
        images?: TemplateImage[]
        tempImages?: TemplateImage[]
      }
      
      const allImages = [...(images || []), ...(tempImages || [])]
      imageManager.setNodeImages(node.id, allImages)
      
      if (!meta.data) meta.data = {}
      if (templateTarget) {
        updateCompositeTemplate(meta, templateTarget, () => (validPaths && validPaths.length ? [...validPaths] : []))
      } else {
        ;(meta.data as FlowBusinessData).template = validPaths && validPaths.length ? [...validPaths] : []
      }
    }
  }

  const loadNodes = ({ filename, source, nodes: rawNodesData }: LoadNodesPayload) => {
    const newNodes: FlowNode[] = []
    const newEdges: FlowEdge[] = []
    const createdNodeIds = new Set<string>()
    const missingNodeCount = new Map<string, number>()

    for (const [nodeId, nodeContent] of Object.entries(rawNodesData)) {
      newNodes.push(createNodeObject(nodeId, nodeContent))
      createdNodeIds.add(nodeId)
    }

    for (const [nodeId, nodeContent] of Object.entries(rawNodesData)) {
      const linkFields: Array<{ key: 'next' | 'on_error' | 'timeout_next'; handle: keyof typeof PORT_MAPPING }> = [
        { key: 'next', handle: 'source-a' },
        { key: 'on_error', handle: 'source-c' },
        { key: 'timeout_next', handle: 'source-c' }
      ]

      linkFields.forEach(({ key, handle }) => {
        const targetVal = (nodeContent as Record<string, unknown>)[key]
        if (targetVal) {
          const rawTargets = Array.isArray(targetVal) ? targetVal : [targetVal]

          rawTargets.forEach(rawTargetId => {
            if (!rawTargetId) return
            const flags = parseLinkFlags(String(rawTargetId))
            let targetId = flags.id || String(rawTargetId)
            const isJumpBack = flags.jumpBack
            const isAnchorTarget = flags.anchor

            // Only reuse existing node if it's a real (non-missing) node
            const isRealNode = rawNodesData[targetId] !== undefined

            if (!isRealNode) {
              let currentCount = missingNodeCount.get(targetId) || 0
              missingNodeCount.set(targetId, currentCount + 1)

              if (currentCount === 0) {
                newNodes.push(createNodeObject(targetId, isAnchorTarget ? { id: targetId, anchor: true } as FlowBusinessData : {}, true))
                createdNodeIds.add(targetId)
              } else {
                let uniqueId = `${targetId}_${currentCount + 1}`
                while (createdNodeIds.has(uniqueId) || rawNodesData[uniqueId] !== undefined) {
                  currentCount++
                  uniqueId = `${targetId}_${currentCount + 1}`
                }
                newNodes.push(createNodeObject(uniqueId, isAnchorTarget ? { id: targetId, anchor: true } as FlowBusinessData : {}, true, targetId))
                createdNodeIds.add(uniqueId)
                targetId = uniqueId
              }
            }

            newEdges.push({
              id: `e-${nodeId}-${targetId}-${key}`,
              source: nodeId,
              target: targetId,
              sourceHandle: handle,
              targetHandle: 'in',
              label: isJumpBack ? 'JumpBack' : key,
              ...getEdgeStyle(handle, isJumpBack)
            })
          })
        }
      })
    }

    normalizeLinksAcrossNodes(newNodes)

    const layoutOptions: LayoutOptions = {
      algorithm: currentAlgorithm.value,
      direction: currentDirection.value,
      spacing: currentSpacing.value
    }
    elkLayout(newNodes, newEdges, layoutOptions).then(layoutedNodes => {
      nodes.value = layoutedNodes
      edges.value = newEdges
      triggerRef(nodes)
      triggerRef(edges)

      currentFilename.value = filename || ''
      currentSource.value = source || ''

      const snapshot = JSON.stringify(getNodesData())
      dataSnapshot.value = snapshot
      originalDataSnapshot.value = snapshot
      selectedNodeId.value = null
      setTimeout(() => fitView({ padding: 0.2, duration: 800 }), 50)
    })
  }

  const layoutTaskChain = async (rootId: string) => {
    const layoutOptions: LayoutOptions = {
      algorithm: currentAlgorithm.value,
      direction: currentDirection.value,
      spacing: currentSpacing.value
    }
    const result = await applyOrderedChainLayout(nodes, edges, rootId, layoutOptions)
    if (!result) return

    const { chainIds } = result
    setTimeout(() => fitView({ nodes: Array.from(chainIds), padding: 0.25, duration: 600 }), 50)
  }

  const getImageData = (): ImageDataPayload => {
    return imageManager.getImageData()
  }

  const clearTempImageData = () => {
    imageManager.clearTempImageData()
  }

  const layoutChainFromNode = async (startId: string, spacingKey: SpacingKey = currentSpacing.value) => {
    const layoutOptions: LayoutOptions = {
      algorithm: currentAlgorithm.value,
      direction: currentDirection.value,
      spacing: spacingKey
    }
    const result = await applyOrderedChainLayout(nodes, edges, startId, layoutOptions)
    if (!result) return

    const { chainIds } = result
    setTimeout(() => fitView({ nodes: Array.from(chainIds), padding: 0.25, duration: 600 }), 50)
  }

  return {
    nodes,
    edges,
    nodeTypes,
    currentEdgeType,
    currentSpacing,
    currentAlgorithm,
    currentDirection,
    isDirty,
    currentFilename,
    currentSource,
    SPACING_OPTIONS,
    createNodeObject,
    onValidateConnection,
    handleConnect,
    handleEdgesChange,
    handleNodeUpdate,
    loadNodes,
    getNodesData,
    getImageData,
    clearTempImageData,
    setEdgeJumpBack,
    layoutTaskChain,
    clearDirty,
    markDataChanged,
    setNodeStatus,
    selectNodeById,
    elkLayout,
    applyLayout: async (options?: Partial<LayoutOptions>) => {
      const layoutOptions: LayoutOptions = {
        algorithm: options?.algorithm || currentAlgorithm.value,
        direction: options?.direction || currentDirection.value,
        spacing: options?.spacing || currentSpacing.value
      }
      await applyLayoutOnRefs(nodes, edges, layoutOptions)
      setTimeout(() => fitView({ padding: 0.2, duration: 500 }), 50)
    },
    layoutChainFromNode,
    imageManager
  }
}

