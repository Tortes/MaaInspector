import { describe, expect, it, vi } from 'vitest'
import { resourceApi } from '@/services/api'
import { flushFrontendLogs } from '@/utils/logger'

const invokeMock = vi.fn()

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args)
}))

describe('api logging', () => {
  it('logs invoke failures without leaking base64 payloads', async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === 'resource_process_images') {
        return Promise.reject(new Error('save failed'))
      }
      return Promise.resolve({ success: true })
    })

    await expect(resourceApi.processImages('source', [], [
      { path: 'foo.png', base64: 'a'.repeat(400), nodeId: 'node-1' }
    ])).rejects.toThrow('save failed')
    await flushFrontendLogs()

    const logCall = invokeMock.mock.calls.find(([command]) => command === 'log_frontend_batch')
    expect(logCall).toBeTruthy()
    expect(JSON.stringify(logCall?.[1])).not.toContain('aaaa')
    expect(JSON.stringify(logCall?.[1])).toContain('[omitted]')
  })
})
