import { ref } from 'vue'
import { deviceApi, debugApi } from '@/services/api'
import { withCache } from '@/services/cache'
import type { ScreenshotResponse } from '@/services/api'
import { usePanelResize } from './usePanelResize'

export interface NextChild {
  name: string
  status: string
  reco_id?: string | null
  jump_back?: boolean
  anchor?: boolean
  [key: string]: unknown
}

export interface DebugEventRecord {
  recordId: string
  taskId: string | number
  name: string
  nextList: NextChild[]
  timestamp: number
}

export interface NodeStatusPayload {
  nodeId: string
  status: 'success' | 'error' | 'running' | 'ignored' | null
}

const STATUS = {
  UNKNOWN: 'unknown',
  STARTING: 'starting',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed'
} as const

type StatusKey = (typeof STATUS)[keyof typeof STATUS]

interface RecognitionPayload {
  type?: string
  status?: StatusKey
  task_id?: string | number
  name?: string
  reco_id?: string
  timestamp?: number
  [key: string]: unknown
}

interface NextListPayload {
  type?: string
  task_id?: string | number
  name?: string
  next_list?: NextChild[]
  timestamp?: number
  [key: string]: unknown
}

type SsePayload = RecognitionPayload | NextListPayload

const WIDTH_STORAGE_KEY = 'maainspector.debugPanel.width.v1'
const DEFAULT_PANEL_WIDTH = 1120
const MIN_PANEL_WIDTH = 600
const SIDE_GAP = 24

export function useDebugPanelState() {
  const {
    panelWidth,
    isResizing: isResizingWidth,
    startResize: startWidthResize,
    stopResize: stopWidthResize,
    loadWidth: loadPanelWidth,
    saveWidth: savePanelWidth
  } = usePanelResize({
    storageKey: WIDTH_STORAGE_KEY,
    defaultWidth: DEFAULT_PANEL_WIDTH,
    minWidth: MIN_PANEL_WIDTH,
    sideGap: SIDE_GAP
  })

  const resizeStart = ref({ x: 0, width: DEFAULT_PANEL_WIDTH })
  const events = ref<DebugEventRecord[]>([])
  const isStreamRunning = ref(false)
  const previewUrl = ref('')

  let stopStream: (() => void) | null = null
  let previewTimer: ReturnType<typeof setInterval> | null = null
  let isFetchingPreview = false

  const createRecordId = (taskId?: string | number) => `${taskId || 'task'}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`

  const mapStatusToNode = (status: StatusKey): NodeStatusPayload['status'] => {
    if (status === STATUS.SUCCEEDED) return 'success'
    if (status === STATUS.FAILED) return 'error'
    if (status === STATUS.STARTING) return 'running'
    return null
  }

  const fetchPreview = async () => {
    if (isFetchingPreview) return
    isFetchingPreview = true
    try {
      const res = await withCache(
        'device-preview',
        () => deviceApi.getScreenshot(),
        1000
      )
      previewUrl.value = (res as ScreenshotResponse)?.image || (res as Record<string, unknown>)?.data as string || ''
    } catch (e) {
      console.warn('[DebugPanel] 获取设备预览失败，使用占位图', e)
      previewUrl.value = ''
    } finally {
      isFetchingPreview = false
    }
  }

  const startPreviewAutoRefresh = () => {
    stopPreviewAutoRefresh()
    fetchPreview()
    previewTimer = setInterval(fetchPreview, 1000)
  }

  const stopPreviewAutoRefresh = () => {
    if (previewTimer) clearInterval(previewTimer)
    previewTimer = null
  }

  const upsertNextList = (payload: NextListPayload, nodes?: { data?: { data?: { id?: string } }; id: string }[], emitUpdate?: (payload: NodeStatusPayload) => void) => {
    if (!payload) return
    const nextList = Array.isArray(payload.next_list) ? payload.next_list : []
    const taskId = payload.task_id || Date.now()
    const record = {
      recordId: createRecordId(taskId),
      taskId,
      name: payload.name || '未知节点',
      nextList: nextList.map(child => {
        const childName = child?.name || 'Unknown'
        return {
          ...child,
          name: childName,
          status: STATUS.UNKNOWN,
          reco_id: child.reco_id ?? null
        }
      }),
      timestamp: payload.timestamp || Date.now()
    }

    events.value = [record, ...events.value].slice(0, 200)

    if (nextList.length && nodes) {
      const targetNames = new Set(nextList.map(child => child.name).filter(Boolean))
      nodes.forEach(node => {
        const nodeName = node.data?.data?.id || node.id
        if (targetNames.has(nodeName)) {
          emitUpdate?.({ nodeId: nodeName, status: 'ignored' })
        }
      })
    }
  }

  const applyRecognition = (payload: RecognitionPayload, emitUpdate?: (payload: NodeStatusPayload) => void) => {
    if (!payload) return
    const status = payload.status || STATUS.UNKNOWN
    const targetName = payload.name || '未知节点'
    let matched = false
    let updatedRecord: DebugEventRecord | null = null
    const updatedEvents = [...events.value]

    for (let i = 0; i < updatedEvents.length; i++) {
      const evt = updatedEvents[i]
      if (evt.taskId !== payload.task_id) continue
      matched = true
      const nextList = [...evt.nextList]
      let idx = nextList.findIndex(c => c.name === targetName)
      if (idx === -1) {
        nextList.push({
          name: targetName,
          jump_back: false,
          anchor: false,
          status: STATUS.UNKNOWN
        })
        idx = nextList.length - 1
      }
      nextList[idx] = {
        ...nextList[idx],
        status,
        reco_id: payload.reco_id
      }
      updatedEvents[i] = { ...evt, nextList }
      updatedRecord = updatedEvents[i]
      break
    }

    if (!matched) {
      const taskId = payload.task_id || Date.now()
      updatedRecord = {
        recordId: createRecordId(taskId),
        taskId,
        name: targetName,
        nextList: [{
          name: targetName,
          jump_back: false,
          anchor: false,
          status,
          reco_id: payload.reco_id
        }],
        timestamp: payload.timestamp || Date.now()
      }
      updatedEvents.unshift(updatedRecord)
    }

    events.value = updatedEvents.slice(0, 200)

    const mapped = mapStatusToNode(status)
    if (mapped) emitUpdate?.({ nodeId: targetName, status: mapped })
  }

  const processSsePayload = (payload: SsePayload, nodes?: { data?: { data?: { id?: string } }; id: string }[], emitUpdate?: (payload: NodeStatusPayload) => void) => {
    if (!payload || !payload.type) return
    if (payload.type === 'node_next_list') {
      upsertNextList(payload, nodes, emitUpdate)
    }
    if (payload.type === 'node_recognition') {
      applyRecognition(payload, emitUpdate)
    }
  }

  const handleSsePayload = (data: unknown, nodes?: { data?: { data?: { id?: string } }; id: string }[], emitUpdate?: (payload: NodeStatusPayload) => void) => {
    processSsePayload(data as SsePayload, nodes, emitUpdate)
  }

  const startRealtimeStream = (emitUpdate?: (payload: NodeStatusPayload) => void, nodes?: { data?: { data?: { id?: string } }; id: string }[]) => {
    if (isStreamRunning.value) return
    stopStream = debugApi.subscribeNodeStream((data: unknown) => handleSsePayload(data, nodes, emitUpdate))
    isStreamRunning.value = true
  }

  const stopRealtimeStream = () => {
    if (stopStream) stopStream()
    stopStream = null
    isStreamRunning.value = false
  }

  const handlePauseDebug = async () => {
    try {
      await debugApi.stop()
    } catch (e) {
      console.warn('[DebugPanel] 暂停调试失败', e)
    }
  }

  const copyText = async (text: string) => {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
    } catch (e) {
      console.warn('[DebugPanel] 复制失败', e)
    }
  }

  const clearEvents = () => {
    events.value = []
  }

  return {
    STATUS,
    panelWidth,
    isResizingWidth,
    resizeStart,
    events,
    isStreamRunning,
    previewUrl,
    loadPanelWidth,
    savePanelWidth,
    startWidthResize,
    stopWidthResize,
    startPreviewAutoRefresh,
    stopPreviewAutoRefresh,
    startRealtimeStream,
    stopRealtimeStream,
    handlePauseDebug,
    copyText,
    clearEvents
  }
}
