import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { useFlowWorkspaceVm } from '@/composables/viewModels/useFlowWorkspaceVm'
import { useAppConfigStore } from '@/stores/appConfig'
import type { FlowEditorPort } from '@/composables/viewModels/types'

const createEditorPort = (): FlowEditorPort => ({
  getEditorStatus: vi.fn(() => ({
    isDirty: false,
    nodeCount: 0,
    edgeCount: 0
  })),
  loadResourceFile: vi.fn().mockResolvedValue(undefined),
  handleLoadNodesWrapper: vi.fn().mockResolvedValue(undefined),
  handleLoadImages: vi.fn(),
  handleSaveNodes: vi.fn().mockResolvedValue(undefined),
  handleDeviceConnected: vi.fn(),
  handleUpdateCanvasConfig: vi.fn(),
  handleUpdatePipelineVersion: vi.fn(),
  handleLocateNode: vi.fn(),
  handleDebugNodeFromPanel: vi.fn(),
  handleUpdateNodeStatus: vi.fn()
})

describe('useFlowWorkspaceVm', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('adds, selects, and closes tabs through the workspace store', async () => {
    const vm = useFlowWorkspaceVm()

    vm.addTab()
    vm.addTab()
    await nextTick()

    expect(vm.tabs.value.items).toHaveLength(2)
    const firstTabId = vm.tabs.value.items[0].id
    const secondTabId = vm.tabs.value.items[1].id

    vm.selectTab(firstTabId)
    expect(vm.activeTabId.value).toBe(firstTabId)

    vm.closeTab(secondTabId)
    expect(vm.tabs.value.items).toHaveLength(1)
    expect(vm.tabs.value.items[0].id).toBe(firstTabId)
  })

  it('loads nodes into the ensured workspace tab and binds the resource file', async () => {
    const vm = useFlowWorkspaceVm()
    const tab = useAppConfigStore().ensureWorkspaceTab()
    const editor = createEditorPort()
    vm.registerEditor(tab.id, editor)

    await vm.handleLoadNodes({
      filename: 'pipeline.json',
      source: 'D:/maa',
      nodes: {
        Start: { id: 'Start', recognition: 'DirectHit' }
      },
      fileVersion: 'V1'
    })

    expect(editor.handleLoadNodesWrapper).toHaveBeenCalledWith(expect.objectContaining({
      filename: 'pipeline.json',
      source: 'D:/maa'
    }))
    expect(vm.tabs.value.items[0].resourceFile).toBe('D:/maa|pipeline.json')
    expect(vm.tabs.value.items[0].title).toBe('pipeline.json')
  })

  it('loads nodes into the active tab instead of always updating the first tab', async () => {
    const vm = useFlowWorkspaceVm()
    vm.addTab()
    vm.addTab()
    await nextTick()

    const firstTab = vm.tabs.value.items[0]
    const secondTab = vm.tabs.value.items[1]
    const firstEditor = createEditorPort()
    const secondEditor = createEditorPort()
    vm.registerEditor(firstTab.id, firstEditor)
    vm.registerEditor(secondTab.id, secondEditor)
    vm.selectTab(secondTab.id)

    await vm.handleLoadNodes({
      filename: 'tasks.json',
      source: 'D:/maa',
      nodes: {
        Task: { id: 'Task', recognition: 'DirectHit' }
      },
      fileVersion: 'V1'
    })

    expect(firstEditor.handleLoadNodesWrapper).not.toHaveBeenCalled()
    expect(secondEditor.handleLoadNodesWrapper).toHaveBeenCalledWith(expect.objectContaining({
      filename: 'tasks.json',
      source: 'D:/maa'
    }))
    expect(vm.tabs.value.items[0].resourceFile).toBe('')
    expect(vm.tabs.value.items[1].resourceFile).toBe('D:/maa|tasks.json')
    expect(vm.tabs.value.items[1].title).toBe('tasks.json')
  })

  it('routes debug panel state and active editor actions', () => {
    const vm = useFlowWorkspaceVm()
    vm.addTab()
    const tab = vm.tabs.value.items[0]
    const editor = createEditorPort()
    vm.registerEditor(tab.id, editor)

    vm.openDebugPanel({ nodeId: 'Start' })
    expect(vm.debugPanel.value).toEqual({ visible: true, nodeId: 'Start' })

    vm.handleDeviceConnected(true)
    expect(editor.handleDeviceConnected).toHaveBeenCalledWith(true)

    vm.closeDebugPanel()
    expect(vm.debugPanel.value).toEqual({ visible: false, nodeId: '' })
  })
})
