import { useAppConfigStore } from '@/stores/appConfig'
import type { TabResourceInfo } from '@/utils/flowWorkspaceTypes'

export function useMainAppState() {
  const store = useAppConfigStore()

  const mainState = store.resource

  const isSameAsLastResource = (profileIndex: number): boolean => {
    return store.cachedLastTabs?.resource_index === profileIndex && mainState.loaded
  }

  const getLastTabs = (): TabResourceInfo[] => {
    const lt = store.cachedLastTabs
    if (!lt) return []
    return lt.tabs.map(t => ({
      id: t.id || '',
      title: t.title || '',
      resourceFile: t.resource_file || ''
    }))
  }

  return {
    mainState,
    isSameAsLastResource,
    getLastTabs,
    updateResourceState: store.setResourceLoaded,
    updateTabs: store.setTabs,
    clearTabs: store.clearTabs,
    clearCachedLastTabs: () => {}
  }
}
