import { ref } from 'vue'

interface DebugPanelState {
  visible: boolean
  nodeId: string
}

export const useDebugPanel = () => {
  const debugPanel = ref<DebugPanelState>({ visible: false, nodeId: '' })

  const openDebugPanel = (payload?: { nodeId?: string }) => {
    debugPanel.value = {
      visible: true,
      nodeId: payload?.nodeId || ''
    }
  }

  const closeDebugPanel = () => {
    debugPanel.value = { visible: false, nodeId: '' }
  }

  return {
    debugPanel,
    openDebugPanel,
    closeDebugPanel
  }
}
