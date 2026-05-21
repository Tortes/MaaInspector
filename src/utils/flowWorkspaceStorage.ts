import type { FlowWorkspaceState } from './flowWorkspaceTypes'
import type { TemplateImage } from './flowTypes'
import { perfLog, perfNow } from './perfTrace'

const STORAGE_KEY = 'maainspector.flow.workspace.v1'

const stripImageBase64 = (images?: TemplateImage[]) =>
  (images || []).map(({ base64: _base64, ...image }) => image)

const stripSnapshotPayload = (state: FlowWorkspaceState): FlowWorkspaceState => {
  const start = perfNow()
  const stripped = {
    ...state,
    tabs: state.tabs.map(tab => ({
      ...tab,
      snapshot: {
        ...tab.snapshot,
        flowState: tab.snapshot.flowState
          ? {
              ...tab.snapshot.flowState,
              nodes: tab.snapshot.flowState.nodes.map(node => ({
                ...node,
                data: node.data
                  ? {
                      ...node.data,
                      _images: stripImageBase64(node.data._images),
                      _del_images: stripImageBase64(node.data._del_images),
                      _temp_images: stripImageBase64(node.data._temp_images)
                    }
                  : node.data
              }))
            }
          : tab.snapshot.flowState
      }
    }))
  }
  perfLog('flowWorkspaceStorage.stripSnapshotPayload', start, {
    tabCount: state.tabs.length,
    nodeCount: state.tabs.reduce((sum, tab) => sum + (tab.snapshot.flowState?.nodes.length || 0), 0)
  })
  return stripped
}

export const loadWorkspaceState = (): FlowWorkspaceState | null => {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as FlowWorkspaceState
  } catch {
    return null
  }
}

export const saveWorkspaceState = (state: FlowWorkspaceState) => {
  if (typeof window === 'undefined') return
  try {
    const start = perfNow()
    const payload = JSON.stringify(stripSnapshotPayload(state))
    perfLog('flowWorkspaceStorage.stringify', start, { length: payload.length })
    const saveStart = perfNow()
    window.localStorage.setItem(STORAGE_KEY, payload)
    perfLog('flowWorkspaceStorage.localStorageSet', saveStart, { length: payload.length })
  } catch {
    // ignore storage failures
  }
}

export const clearWorkspaceState = () => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore storage failures
  }
}
