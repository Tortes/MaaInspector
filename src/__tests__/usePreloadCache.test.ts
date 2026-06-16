import { describe, expect, it, vi } from 'vitest'
import { usePreloadCache } from '@/composables/usePreloadCache'

vi.mock('@/services/api', () => ({
  resourceApi: {
    getFileNodes: vi.fn(),
    getTemplateImages: vi.fn()
  }
}))

describe('usePreloadCache', () => {
  it('emits cached images after cached nodes so file reset cannot clear them', async () => {
    const calls: string[] = []
    const emit = vi.fn((event: string) => {
      calls.push(event)
    }) as unknown as {
      (e: 'load-nodes', payload: unknown): void
      (e: 'load-images', images: unknown): void
    }
    const cache = usePreloadCache({
      tabs: () => [],
      selectedResourceFile: () => '',
      resourceManagerRef: () => null,
      emit
    })

    cache.preloadCache.set('D:/maa|pipeline.json', {
      nodes: { Start: { recognition: 'TemplateMatch', template: 'a.png' } },
      images: { Start: [{ path: 'a.png', fullPath: 'D:/maa/image/a.png' }] },
      fileVersion: 'V1'
    })

    const loaded = cache.triggerLoadFromCache({
      source: 'D:/maa',
      filename: 'pipeline.json',
      tabId: 'tab-1'
    })

    expect(loaded).toBe(true)
    expect(calls).toEqual(['load-nodes'])

    await Promise.resolve()

    expect(calls).toEqual(['load-nodes', 'load-images'])
  })
})
