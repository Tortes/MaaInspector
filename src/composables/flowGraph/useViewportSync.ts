import { nextTick, type Ref } from 'vue'

export interface ViewportSyncDeps {
  onlyRenderVisibleElements: Ref<boolean>
  updateNodeInternals?: (nodeIds?: string[]) => void
}

const waitForFrame = () => new Promise<void>((resolve) => {
  if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
    setTimeout(resolve, 0)
    return
  }

  window.requestAnimationFrame(() => resolve())
})

export function useViewportSync(deps: ViewportSyncDeps) {
  let previousOnlyRenderVisibleElements = deps.onlyRenderVisibleElements.value

  const begin = async () => {
    previousOnlyRenderVisibleElements = deps.onlyRenderVisibleElements.value
    deps.onlyRenderVisibleElements.value = false
    await nextTick()
  }

  const refreshNodeInternals = async (nodeIds?: string[]) => {
    await nextTick()
    deps.updateNodeInternals?.(nodeIds)
    await nextTick()
    await waitForFrame()
    deps.updateNodeInternals?.(nodeIds)
    await nextTick()
  }

  const end = async (nodeIds?: string[]) => {
    deps.onlyRenderVisibleElements.value = previousOnlyRenderVisibleElements
    await nextTick()
    await refreshNodeInternals(nodeIds)
  }

  const withPausedVisibility = async <T>(task: () => Promise<T>, nodeIds?: string[]) => {
    await begin()
    try {
      await refreshNodeInternals(nodeIds)
      return await task()
    } finally {
      await end(nodeIds)
    }
  }

  return {
    begin,
    end,
    refreshNodeInternals,
    withPausedVisibility
  }
}
