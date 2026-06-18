import { describe, expect, it, vi } from 'vitest'
import { useDebugPanelState } from '@/composables/useDebugPanelState'
import { debugApi } from '@/services/api'
import type { DebugStreamPayload } from '@/services/api'

vi.mock('@/services/api', () => ({
  deviceApi: {
    getScreenshot: vi.fn()
  },
  debugApi: {
    stop: vi.fn(),
    subscribeNodeStream: vi.fn()
  }
}))

describe('useDebugPanelState', () => {
  it('creates a fresh timeline record for each next_list starting attempt', () => {
    let onStreamData: ((data: DebugStreamPayload) => void) | undefined
    vi.mocked(debugApi.subscribeNodeStream).mockImplementation((callback) => {
      onStreamData = callback
      return vi.fn()
    })

    const state = useDebugPanelState()
    state.startRealtimeStream()

    onStreamData?.({
      type: 'node_next_list',
      attempt_id: '200000001-1',
      task_id: 200000001,
      name: 'N-1781587382439',
      status: 'starting',
      next_list: [
        { name: 'N-1781587382439', jump_back: false, anchor: false }
      ],
      timestamp: 1781587499820
    })

    onStreamData?.({
      type: 'node_recognition',
      attempt_id: '200000001-1',
      task_id: 200000001,
      name: 'N-1781587382439',
      status: 'succeeded',
      reco_id: 400000001,
      timestamp: 1781587500612
    })

    onStreamData?.({
      type: 'node_next_list',
      attempt_id: '200000001-1',
      task_id: 200000001,
      name: 'N-1781587382439',
      status: 'succeeded',
      next_list: [
        { name: 'N-1781587382439', jump_back: false, anchor: false }
      ],
      timestamp: 1781587500612
    })

    onStreamData?.({
      type: 'node_next_list',
      attempt_id: '200000001-2',
      task_id: 200000001,
      name: 'N-1781587382439',
      status: 'starting',
      next_list: [
        { name: 'N-1781587382439', jump_back: false, anchor: false }
      ],
      timestamp: 1781587501000
    })

    expect(state.events.value).toHaveLength(2)
    expect(state.events.value[0]).toMatchObject({
      attemptId: '200000001-2',
      status: 'starting'
    })
    expect(state.events.value[1].nextList[0]).toMatchObject({
      name: 'N-1781587382439',
      recognitionStatus: 'succeeded',
      status: 'succeeded',
      reco_id: 400000001
    })
  })

  it('updates recognition and action within the active attempt', () => {
    let onStreamData: ((data: DebugStreamPayload) => void) | undefined
    vi.mocked(debugApi.subscribeNodeStream).mockImplementation((callback) => {
      onStreamData = callback
      return vi.fn()
    })

    const updates: Array<{ nodeId: string; status: string | null }> = []
    const state = useDebugPanelState()
    state.startRealtimeStream((payload) => updates.push(payload))

    onStreamData?.({
      type: 'node_next_list',
      attempt_id: '300000001-1',
      task_id: 300000001,
      name: 'Root',
      status: 'starting',
      next_list: [
        { name: 'A', jump_back: false, anchor: false },
        { name: 'B', jump_back: false, anchor: false }
      ],
      timestamp: 1781587500000
    })

    onStreamData?.({
      type: 'node_recognition',
      attempt_id: '300000001-1',
      task_id: 300000001,
      name: 'A',
      status: 'succeeded',
      reco_id: 500000001,
      timestamp: 1781587500100
    })

    onStreamData?.({
      type: 'node_action',
      attempt_id: '300000001-1',
      task_id: 300000001,
      name: 'A',
      status: 'failed',
      action_id: 600000001,
      node_id: 700000001,
      focus: { reason: 'mock' },
      timestamp: 1781587500200
    })

    onStreamData?.({
      type: 'node_next_list',
      attempt_id: '300000001-1',
      task_id: 300000001,
      name: 'Root',
      status: 'failed',
      next_list: [],
      timestamp: 1781587500300
    })

    expect(state.events.value).toHaveLength(1)
    expect(state.events.value[0]).toMatchObject({
      attemptId: '300000001-1',
      status: 'failed',
      completedAt: 1781587500300
    })
    expect(state.events.value[0].nextList[0]).toMatchObject({
      name: 'A',
      recognitionStatus: 'succeeded',
      actionStatus: 'failed',
      action_id: 600000001,
      node_id: 700000001,
      actionFocus: { reason: 'mock' }
    })
    expect(updates).toEqual([
      { nodeId: 'A', status: 'success' },
      { nodeId: 'A', status: 'error' }
    ])
  })
})
