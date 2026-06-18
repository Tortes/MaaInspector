<script setup lang="ts">
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { SelectionMode, VueFlow, useVueFlow, type EdgeMouseEvent, type NodeMouseEvent, type NodeTypesObject } from '@vue-flow/core'
import { Maximize2, Move, RefreshCw, X } from 'lucide-vue-next'
import { computed, nextTick, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue'
import ContextMenu from './ContextMenu.vue'
import { useEditorActions } from '@/composables/useEditorActions'
import { useFloatingPanel } from '@/composables/useFloatingPanel'
import { useLayout } from '@/composables/useLayout'
import { LAYOUT_ALGORITHM_OPTIONS } from '@/utils/flowOptions'
import { collectReachableNodeIds, filterSubgraphEdges } from '@/utils/flowSubgraph'
import type { EdgeType } from '@/utils/flowOptions'
import type {
  FlowBusinessData,
  FlowConnection,
  FlowEdge,
  FlowEdgeChange,
  FlowNode,
  LayoutAlgorithm,
  LayoutDirection,
  NodeUpdatePayload,
  SpacingKey,
  TemplateImage
} from '@/utils/flowTypes'

const props = defineProps<{
  visible: boolean
  rootNodeId: string
  initialAlgorithm?: LayoutAlgorithm
  nodes: FlowNode[]
  edges: FlowEdge[]
  nodeTypesObject: NodeTypesObject
  currentEdgeType: EdgeType
  currentSpacing: SpacingKey
  currentAlgorithm: LayoutAlgorithm
  currentDirection: LayoutDirection
  currentFilename: string
  isFileLoaded: boolean
  onValidateConnection: (connection: FlowConnection) => boolean
  handleConnect: (connection: FlowConnection) => void
  handleEdgesChange: (changes: FlowEdgeChange[]) => void
  handleNodeUpdate: (payload: NodeUpdatePayload) => void
  createNodeObject: (id: string, rawContent: FlowBusinessData, isMissing?: boolean, originalId?: string) => FlowNode
  removeEdges: (ids: string[]) => void
  setEdgeJumpBack: (edgeId: string, isJumpBack: boolean) => void
  markDataChanged: () => void
  imageManager: {
    getNodeImages: (nodeId: string) => TemplateImage[]
    setNodeImages: (nodeId: string, images: TemplateImage[]) => void
    removeNodeState?: (nodeId: string) => void
  }
  handleDebugNode: (nodeId: string, mode: 'standard' | 'recognition_only') => void
  handleOpenDebugPanel: (payload?: { nodeId?: string }) => void
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'root-renamed', nodeId: string): void
}>()

const flowId = `sub-canvas-${Math.random().toString(36).slice(2)}`
const closeAllDetailsSignal = ref(0)
const sessionNodeIds = ref<Set<string>>(new Set())
const localNodeState = ref<Record<string, Partial<FlowNode>>>({})
const activeAlgorithm = ref<LayoutAlgorithm>(props.initialAlgorithm || props.currentAlgorithm)

const {
  fitView,
  screenToFlowCoordinate,
  getSelectedNodes,
  getSelectedEdges
} = useVueFlow(flowId)
const { elkLayout } = useLayout()

const panel = useFloatingPanel({
  storageKey: 'maa-inspector-sub-canvas-panel',
  defaultWidth: 980,
  defaultHeight: 680,
  minWidth: 560,
  minHeight: 360,
  edgeGap: 24
})

const baseVisibleNodeIds = ref<Set<string>>(new Set())
const edgeStructureKey = computed(() =>
  props.edges.map(edge => `${edge.id}:${edge.source}:${edge.target}`).join('|')
)

const refreshVisibleNodeIds = () => {
  baseVisibleNodeIds.value = collectReachableNodeIds(props.rootNodeId, props.nodes, props.edges)
}

const visibleNodeIds = computed(() => new Set([...baseVisibleNodeIds.value, ...sessionNodeIds.value]))
const visibleNodeIdList = computed(() => Array.from(visibleNodeIds.value))

const createRemoveChanges = (edgeIds: string[]): FlowEdgeChange[] =>
  edgeIds.map(id => ({ id, type: 'remove' }) as FlowEdgeChange)

const removeMainEdges = (edgeIds: string[]) => {
  if (!edgeIds.length) return
  props.handleEdgesChange(createRemoveChanges(edgeIds))
  props.removeEdges(edgeIds)
}

const removeMainNodes = (nodeIds: Set<string>) => {
  if (nodeIds.size === 0) return

  const edgeIds = props.edges
    .filter(edge => nodeIds.has(edge.source) || nodeIds.has(edge.target))
    .map(edge => edge.id)
  removeMainEdges(edgeIds)
  props.nodes.splice(0, props.nodes.length, ...props.nodes.filter(node => !nodeIds.has(node.id)))
  nodeIds.forEach(id => props.imageManager.removeNodeState?.(id))
  sessionNodeIds.value = new Set([...sessionNodeIds.value].filter(id => !nodeIds.has(id)))

  const nextLocalState = { ...localNodeState.value }
  nodeIds.forEach(id => { delete nextLocalState[id] })
  localNodeState.value = nextLocalState
  refreshVisibleNodeIds()
}

const subNodes = computed<FlowNode[]>({
  get: () => props.nodes
    .filter(node => visibleNodeIds.value.has(node.id))
    .map(node => {
      const local = localNodeState.value[node.id] || {}
      return {
        ...node,
        ...local,
        data: node.data,
        position: local.position || node.position
      }
    }),
  set: (nextNodes) => {
    const nextById = new Map(nextNodes.map(node => [node.id, node]))
    const existingIds = new Set(props.nodes.map(node => node.id))
    const removedVisibleIds = new Set(
      props.nodes
        .filter(node => visibleNodeIds.value.has(node.id) && !nextById.has(node.id))
        .map(node => node.id)
    )
    if (removedVisibleIds.size > 0) {
      removeMainNodes(removedVisibleIds)
    }

    const nextLocalState = { ...localNodeState.value }
    nextNodes.forEach(node => {
      nextLocalState[node.id] = {
        ...(nextLocalState[node.id] || {}),
        position: node.position ? { ...node.position } : undefined
      }
    })

    const addedNodes: FlowNode[] = []
    nextNodes.forEach(node => {
      if (!existingIds.has(node.id)) {
        addedNodes.push(node)
        sessionNodeIds.value = new Set([...sessionNodeIds.value, node.id])
      }
    })

    if (addedNodes.length > 0) {
      props.nodes.splice(0, props.nodes.length, ...props.nodes, ...addedNodes)
      props.markDataChanged()
    }
    localNodeState.value = nextLocalState
  }
})

const subEdges = computed<FlowEdge[]>({
  get: () => filterSubgraphEdges(props.edges, visibleNodeIds.value),
  set: (nextEdges) => {
    const visibleIds = visibleNodeIds.value
    const nextEdgeIds = new Set(nextEdges.map(edge => edge.id))
    const removedEdgeIds = props.edges
      .filter(edge => visibleIds.has(edge.source) && visibleIds.has(edge.target) && !nextEdgeIds.has(edge.id))
      .map(edge => edge.id)
    if (removedEdgeIds.length > 0) {
      props.handleEdgesChange(createRemoveChanges(removedEdgeIds))
    }

    const hiddenEdges = props.edges.filter(edge => !(visibleIds.has(edge.source) && visibleIds.has(edge.target)))
    const merged = [
      ...hiddenEdges,
      ...nextEdges.filter(edge => visibleIds.has(edge.source) && visibleIds.has(edge.target))
    ]
    props.edges.splice(0, props.edges.length, ...merged)
  }
})

const handleNodeUpdate = (payload: NodeUpdatePayload) => {
  props.handleNodeUpdate(payload)
  if (payload.oldId === props.rootNodeId && payload.newId !== payload.oldId) {
    emit('root-renamed', payload.newId)
  }
  if (sessionNodeIds.value.has(payload.oldId) && payload.newId !== payload.oldId) {
    const nextIds = new Set(sessionNodeIds.value)
    nextIds.delete(payload.oldId)
    nextIds.add(payload.newId)
    sessionNodeIds.value = nextIds
  }
  refreshVisibleNodeIds()
}

provide('closeAllDetailsSignal', closeAllDetailsSignal)
provide('currentFilename', computed(() => props.currentFilename))
provide('currentDirection', computed(() => props.currentDirection))
provide('imageManager', props.imageManager)
provide('updateNode', handleNodeUpdate)

const layoutVisibleChain = async (algorithm = activeAlgorithm.value) => {
  activeAlgorithm.value = algorithm
  const layouted = await elkLayout(subNodes.value, subEdges.value, {
    algorithm,
    direction: props.currentDirection,
    spacing: props.currentSpacing
  })
  const nextLocalState = { ...localNodeState.value }
  layouted.forEach(node => {
    nextLocalState[node.id] = {
      ...(nextLocalState[node.id] || {}),
      position: { ...node.position }
    }
  })
  localNodeState.value = nextLocalState
  await nextTick()
  fitVisibleNodes()
}

const fitVisibleNodes = () => {
  if (visibleNodeIdList.value.length === 0) return
  fitView({ nodes: visibleNodeIdList.value, padding: 0.25, duration: 400 })
}

const editorActions = useEditorActions({
  mode: 'subcanvas',
  nodes: subNodes,
  edges: subEdges,
  currentEdgeType: computed({
    get: () => props.currentEdgeType,
    set: (value) => {
      props.edges.splice(0, props.edges.length, ...props.edges.map(edge => ({ ...edge, type: value })))
    }
  }),
  currentSpacing: computed(() => props.currentSpacing),
  currentAlgorithm: activeAlgorithm,
  currentDirection: computed(() => props.currentDirection),
  isFileLoaded: computed(() => props.isFileLoaded),
  createNodeObject: props.createNodeObject,
  applyLayout: async (options) => {
    await layoutVisibleChain(options?.algorithm || activeAlgorithm.value)
  },
  removeEdges: removeMainEdges,
  setEdgeJumpBack: props.setEdgeJumpBack,
  layoutChainFromNode: async (_startId, _spacingKey, algorithm) => {
    await layoutVisibleChain(algorithm || activeAlgorithm.value)
  },
  markDataChanged: props.markDataChanged,
  fitView,
  screenToFlowCoordinate,
  getSelectedNodes,
  imageManager: props.imageManager,
  snapshotState: () => {},
  onDebugNode: props.handleDebugNode,
  onOpenDebugPanel: props.handleOpenDebugPanel,
  onCloseDebugPanel: () => {},
  onIncrementCloseAllDetails: () => { closeAllDetailsSignal.value++ }
})

const {
  menu,
  closeMenu,
  onPaneContextMenu,
  onNodeContextMenu,
  onEdgeContextMenu,
  handleMenuAction
} = editorActions

const handleConnect = (connection: FlowConnection) => {
  props.handleConnect(connection)
  if (connection.source) sessionNodeIds.value = new Set([...sessionNodeIds.value, connection.source])
  if (connection.target) sessionNodeIds.value = new Set([...sessionNodeIds.value, connection.target])
  refreshVisibleNodeIds()
}

const handleEdgesChange = (changes: FlowEdgeChange[]) => {
  props.handleEdgesChange(changes)
  if (changes.some(change => change.type === 'remove')) {
    refreshVisibleNodeIds()
  }
}

const handleNodesChange = () => {}

const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false
  return target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable
}

const handleKeyDown = (e: KeyboardEvent) => {
  if (!props.visible) return

  if (e.key === 'Escape') {
    e.preventDefault()
    closeMenu()
    emit('close')
    return
  }

  if ((e.key === 'Delete' || e.key === 'Backspace') && !isEditableTarget(e.target)) {
    e.preventDefault()
    const selectedNodes = getSelectedNodes.value
    const selectedEdges = getSelectedEdges.value
    if (selectedNodes.length > 0) {
      const selectedIds = new Set(selectedNodes.map(node => node.id))
      const edgeIds = props.edges
        .filter(edge => selectedIds.has(edge.source) || selectedIds.has(edge.target))
        .map(edge => edge.id)
      removeMainEdges(edgeIds)
      removeMainNodes(selectedIds)
      props.markDataChanged()
    } else if (selectedEdges.length > 0) {
      removeMainEdges(selectedEdges.map(edge => edge.id))
      refreshVisibleNodeIds()
      props.markDataChanged()
    }
  }
}

watch(() => props.visible, async (visible) => {
  if (!visible) return
  activeAlgorithm.value = props.initialAlgorithm || props.currentAlgorithm
  sessionNodeIds.value = new Set()
  localNodeState.value = {}
  refreshVisibleNodeIds()
  panel.loadLayout()
  await nextTick()
  fitVisibleNodes()
})

watch(() => props.rootNodeId, () => {
  if (props.visible) refreshVisibleNodeIds()
})

watch(edgeStructureKey, () => {
  if (props.visible) refreshVisibleNodeIds()
})

watch(() => props.initialAlgorithm, (algorithm) => {
  if (algorithm) activeAlgorithm.value = algorithm
})

onMounted(() => {
  panel.loadLayout()
  window.addEventListener('resize', panel.ensureInViewport)
  window.addEventListener('keydown', handleKeyDown)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', panel.ensureInViewport)
  window.removeEventListener('keydown', handleKeyDown)
  panel.stopInteraction()
})
</script>

<template>
  <Teleport to="body">
    <transition
      enter-active-class="transition ease-out duration-150"
      enter-from-class="opacity-0 scale-95"
      enter-to-class="opacity-100 scale-100"
      leave-active-class="transition ease-in duration-100"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-95"
    >
      <div
        v-if="visible"
        class="fixed z-[70] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl"
        :style="panel.panelStyle.value"
      >
        <div
          class="flex h-11 cursor-move items-center justify-between border-b border-slate-200 bg-slate-50 px-3"
          @mousedown="panel.startMove"
        >
          <div class="flex min-w-0 items-center gap-2">
            <Move
              :size="16"
              class="shrink-0 text-indigo-600"
            />
            <div class="min-w-0">
              <div class="truncate text-sm font-semibold text-slate-700">
                任务链子画布
              </div>
              <div class="truncate font-mono text-[10px] text-slate-400">
                #{{ rootNodeId }} · {{ visibleNodeIdList.length }} nodes
              </div>
            </div>
          </div>

          <div class="flex items-center gap-1">
            <button
              v-for="option in LAYOUT_ALGORITHM_OPTIONS"
              :key="option.value"
              type="button"
              :title="option.label"
              class="flex h-8 w-8 items-center justify-center rounded-md border transition-colors"
              :class="activeAlgorithm === option.value ? 'border-indigo-200 bg-indigo-50 text-indigo-600' : 'border-transparent text-slate-500 hover:bg-white hover:text-slate-800'"
              @mousedown.stop
              @click="layoutVisibleChain(option.value)"
            >
              <component
                :is="option.icon"
                v-if="option.icon"
                :size="15"
              />
            </button>
            <button
              type="button"
              title="适配视图"
              class="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-white hover:text-slate-800"
              @mousedown.stop
              @click="fitVisibleNodes"
            >
              <Maximize2 :size="15" />
            </button>
            <button
              type="button"
              title="重新布局"
              class="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-white hover:text-slate-800"
              @mousedown.stop
              @click="layoutVisibleChain(activeAlgorithm)"
            >
              <RefreshCw :size="15" />
            </button>
            <button
              type="button"
              title="关闭"
              class="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-rose-50 hover:text-rose-600"
              @mousedown.stop
              @click="$emit('close')"
            >
              <X :size="16" />
            </button>
          </div>
        </div>

        <div class="absolute inset-x-0 bottom-0 top-11 bg-slate-50">
          <VueFlow
            :id="flowId"
            v-model:nodes="subNodes"
            v-model:edges="subEdges"
            :node-types="nodeTypesObject"
            :default-zoom="1"
            :min-zoom="0.1"
            :max-zoom="4"
            :only-render-visible-elements="true"
            :is-valid-connection="onValidateConnection"
            :nodes-draggable="isFileLoaded"
            :nodes-connectable="isFileLoaded"
            :elements-selectable="isFileLoaded"
            :selection-key-code="false"
            :multi-selection-key-code="null"
            :select-nodes-on-drag="true"
            :selection-mode="SelectionMode.Partial"
            :pan-on-drag="true"
            @connect="handleConnect"
            @edges-change="handleEdgesChange"
            @nodes-change="handleNodesChange"
            @node-drag-stop="handleNodesChange"
            @pane-context-menu="onPaneContextMenu"
            @node-context-menu="(params: NodeMouseEvent) => onNodeContextMenu(params)"
            @edge-context-menu="(params: EdgeMouseEvent) => onEdgeContextMenu(params)"
            @pane-click="closeMenu"
            @node-click="closeMenu"
            @edge-click="closeMenu"
            @move-start="closeMenu"
          >
            <Background
              pattern-color="#cbd5e1"
              :gap="20"
            />
            <Controls />
            <ContextMenu
              v-if="menu.visible"
              v-bind="menu"
              mode="subcanvas"
              :current-edge-type="currentEdgeType"
              :current-spacing="currentSpacing"
              :current-algorithm="activeAlgorithm"
              :current-direction="currentDirection"
              @close="closeMenu"
              @action="handleMenuAction"
            />
          </VueFlow>
        </div>

        <div
          class="absolute bottom-0 right-0 h-5 w-5 cursor-nwse-resize"
          title="调整大小"
          @mousedown="panel.startResize"
        >
          <div class="absolute bottom-1 right-1 h-3 w-3 border-b-2 border-r-2 border-slate-300" />
        </div>
      </div>
    </transition>
  </Teleport>
</template>
