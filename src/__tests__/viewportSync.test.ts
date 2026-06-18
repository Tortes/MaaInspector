import { describe, expect, it, vi } from 'vitest'
import { ref, nextTick } from 'vue'
import { useViewportSync } from '@/composables/flowGraph/useViewportSync'

describe('useViewportSync', () => {
  it('temporarily disables visible-only rendering while refreshing node internals', async () => {
    const onlyRenderVisibleElements = ref(true)
    const updateNodeInternals = vi.fn().mockResolvedValue(undefined)
    const sync = useViewportSync({
      onlyRenderVisibleElements,
      updateNodeInternals
    })

    await sync.withPausedVisibility(async () => {
      expect(onlyRenderVisibleElements.value).toBe(false)
      await nextTick()
    }, ['a', 'b'])

    expect(updateNodeInternals).toHaveBeenCalled()
    expect(onlyRenderVisibleElements.value).toBe(true)
  })
})
