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
  it('merges repeated next_list lifecycle events for the same task and node', () => {
    let onStreamData: ((data: DebugStreamPayload) => void) | undefined
    vi.mocked(debugApi.subscribeNodeStream).mockImplementation((callback) => {
      onStreamData = callback
      return vi.fn()
    })

    const state = useDebugPanelState()
    state.startRealtimeStream()

    onStreamData?.({
      type: 'node_next_list',
      task_id: 200000001,
      name: 'N-1781587382439',
      next_list: [
        { name: 'N-1781587382439', jump_back: false, anchor: false }
      ],
      timestamp: 1781587499820
    })

    onStreamData?.({
      type: 'node_recognition',
      task_id: 200000001,
      name: 'N-1781587382439',
      status: 'succeeded',
      reco_id: 400000001,
      timestamp: 1781587500612
    })

    onStreamData?.({
      type: 'node_next_list',
      task_id: 200000001,
      name: 'N-1781587382439',
      next_list: [
        { name: 'N-1781587382439', jump_back: false, anchor: false }
      ],
      timestamp: 1781587500612
    })

    expect(state.events.value).toHaveLength(1)
    expect(state.events.value[0].nextList).toHaveLength(1)
    expect(state.events.value[0].nextList[0]).toMatchObject({
      name: 'N-1781587382439',
      status: 'succeeded',
      reco_id: 400000001
    })
  })
})
