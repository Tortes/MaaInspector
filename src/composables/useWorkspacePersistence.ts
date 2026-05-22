import { onBeforeUnmount } from 'vue'
import { saveWorkspaceState } from '../utils/flowWorkspaceStorage'
import { perfLog, perfNow } from '../utils/perfTrace'
import type { Ref } from 'vue'
import type { FlowAppSettings, FlowEditorSnapshot, FlowWorkspaceState } from '../utils/flowWorkspaceTypes'

interface UseWorkspacePersistenceOptions {
  appSettings: Ref<FlowAppSettings>
  tabs: Ref<Array<{ id: string; title: string; snapshot: FlowEditorSnapshot }>>
  activeTabId: Ref<string>
  getWorkspaceState: () => FlowWorkspaceState
  snapshotAllEditors: () => void
}

export const useWorkspacePersistence = (options: UseWorkspacePersistenceOptions) => {
  const { appSettings, tabs, activeTabId, getWorkspaceState, snapshotAllEditors } = options
  let persistTimer: ReturnType<typeof setTimeout> | null = null

  const persistWorkspaceState = () => {
    if (!appSettings.value.restoreWorkspaceOnStart) return
    const start = perfNow()
    saveWorkspaceState(getWorkspaceState())
    perfLog('FlowWorkspace.persistWorkspaceState', start, { tabCount: tabs.value.length, activeTabId: activeTabId.value })
  }

  const schedulePersistWorkspaceState = () => {
    if (!appSettings.value.restoreWorkspaceOnStart) return
    if (persistTimer) clearTimeout(persistTimer)
    persistTimer = setTimeout(() => {
      persistTimer = null
      persistWorkspaceState()
    }, 300)
  }

  onBeforeUnmount(() => {
    if (persistTimer) {
      clearTimeout(persistTimer)
      persistTimer = null
    }
    snapshotAllEditors()
    persistWorkspaceState()
  })

  return {
    schedulePersistWorkspaceState,
    persistWorkspaceState
  }
}
