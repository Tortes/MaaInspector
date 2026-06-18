import { ref } from 'vue'
import { deviceApi, debugApi } from '@/services/api'
import { withCache } from '@/services/cache'
import type { ScreenshotResponse } from '@/services/api'

export interface NextChild {
  name: string
  status: string
  recognitionStatus?: string
  actionStatus?: string
  reco_id?: string | number | null
  action_id?: string | number | null
  node_id?: string | number | null
  jump_back?: boolean
  anchor?: boolean
  recognitionFocus?: unknown
  actionFocus?: unknown
  [key: string]: unknown
}

export interface DebugEventRecord {
  recordId: string
  attemptId: string
  taskId: string | number
  name: string
  status: string
  nextList: NextChild[]
  timestamp: number
  completedAt?: number
  focus?: unknown
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
  attempt_id?: string
  status?: StatusKey
  task_id?: string | number
  name?: string
  reco_id?: string | number
  timestamp?: number
  focus?: unknown
  [key: string]: unknown
}

interface NextListPayload {
  type?: string
  attempt_id?: string
  task_id?: string | number
  name?: string
  status?: StatusKey
  next_list?: NextChild[]
  timestamp?: number
  focus?: unknown
  [key: string]: unknown
}

interface ActionPayload {
  type?: string
  attempt_id?: string
  status?: StatusKey
  task_id?: string | number
  name?: string
  action_id?: string | number
  node_id?: string | number
  timestamp?: number
  focus?: unknown
  [key: string]: unknown
}

type SsePayload = RecognitionPayload | NextListPayload | ActionPayload

export function useDebugPanelState() {
  const events = ref<DebugEventRecord[]>([])
  const isStreamRunning = ref(false)
  const previewUrl = ref('')

  let stopStream: (() => void) | null = null
  let previewTimer: ReturnType<typeof setInterval> | null = null
  let isFetchingPreview = false
  const activeAttemptByTask = new Map<string, string>()

  const createRecordId = (taskId?: string | number) => `${taskId || 'task'}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
  const createFallbackAttemptId = (taskId?: string | number) => `fallback-${createRecordId(taskId)}`
  const taskKeyOf = (taskId?: string | number) => String(taskId ?? 'unknown')
  const normalizeStatus = (status?: string): StatusKey => {
    if (status === STATUS.STARTING || status === STATUS.SUCCEEDED || status === STATUS.FAILED) return status
    return STATUS.UNKNOWN
  }

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

  const findRecordIndex = (payload: { attempt_id?: string; task_id?: string | number }) => {
    if (payload.attempt_id) {
      const byAttempt = events.value.findIndex(evt => evt.attemptId === payload.attempt_id)
      if (byAttempt !== -1) return byAttempt
    }

    const activeAttempt = activeAttemptByTask.get(taskKeyOf(payload.task_id))
    if (activeAttempt) {
      const byActive = events.value.findIndex(evt => evt.attemptId === activeAttempt)
      if (byActive !== -1) return byActive
    }

    return events.value.findIndex(evt => evt.taskId === payload.task_id && evt.status === STATUS.STARTING)
  }

  const updateChild = (
    record: DebugEventRecord,
    targetName: string,
    updater: (child: NextChild) => NextChild
  ): DebugEventRecord => {
    const nextList = [...record.nextList]
    let idx = nextList.findIndex(c => c.name === targetName)
    if (idx === -1) {
      nextList.push({
        name: targetName,
        jump_back: false,
        anchor: false,
        status: STATUS.UNKNOWN,
        recognitionStatus: STATUS.UNKNOWN,
        actionStatus: STATUS.UNKNOWN,
        reco_id: null,
        action_id: null,
        node_id: null
      })
      idx = nextList.length - 1
    }
    nextList[idx] = updater(nextList[idx])
    return { ...record, nextList }
  }

  const createFallbackRecord = (
    payload: { attempt_id?: string; task_id?: string | number; timestamp?: number },
    name: string
  ): DebugEventRecord => {
    const taskId = payload.task_id || Date.now()
    const attemptId = payload.attempt_id || createFallbackAttemptId(taskId)
    return {
      recordId: createRecordId(taskId),
      attemptId,
      taskId,
      name,
      status: STATUS.UNKNOWN,
      nextList: [],
      timestamp: payload.timestamp || Date.now()
    }
  }

  const upsertNextList = (payload: NextListPayload, nodes?: { data?: { data?: { id?: string } }; id: string }[], emitUpdate?: (payload: NodeStatusPayload) => void) => {
    if (!payload) return
    const nextList = Array.isArray(payload.next_list) ? payload.next_list : []
    const taskId = payload.task_id || Date.now()
    const taskKey = taskKeyOf(taskId)
    const status = normalizeStatus(payload.status)
    const attemptId = payload.attempt_id || createFallbackAttemptId(taskId)
    const recordName = payload.name || '未知节点'
    const normalizedNextList: NextChild[] = nextList.map(child => {
      const childName = child?.name || 'Unknown'
      return {
        ...child,
        name: childName,
        status: STATUS.UNKNOWN,
        recognitionStatus: child.recognitionStatus ?? STATUS.UNKNOWN,
        actionStatus: child.actionStatus ?? STATUS.UNKNOWN,
        reco_id: child.reco_id ?? null,
        action_id: child.action_id ?? null,
        node_id: child.node_id ?? null
      }
    })

    const updatedEvents = [...events.value]
    const existingIndex = findRecordIndex(payload)

    if (status === STATUS.STARTING || existingIndex === -1) {
      updatedEvents.unshift({
        recordId: createRecordId(taskId),
        attemptId,
        taskId,
        name: recordName,
        status,
        nextList: normalizedNextList,
        timestamp: payload.timestamp || Date.now(),
        focus: payload.focus
      })
      activeAttemptByTask.set(taskKey, attemptId)
    } else {
      const existing = updatedEvents[existingIndex]
      updatedEvents[existingIndex] = {
        ...existing,
        status,
        nextList: normalizedNextList.length ? normalizedNextList.map(child => {
          const existingChild = existing.nextList.find(item => item.name === child.name)
          return {
            ...child,
            ...existingChild,
            name: child.name,
            jump_back: child.jump_back,
            anchor: child.anchor
          }
        }) : existing.nextList,
        completedAt: status === STATUS.SUCCEEDED || status === STATUS.FAILED
          ? payload.timestamp || Date.now()
          : existing.completedAt,
        timestamp: existing.timestamp,
        focus: payload.focus ?? existing.focus
      }
      // Node.Action events can arrive after Node.NextList.Succeeded/Failed.
      // Keep the latest attempt mapped until the next starting event replaces it.
    }

    events.value = updatedEvents.slice(0, 200)

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
    const status = normalizeStatus(payload.status)
    const targetName = payload.name || '未知节点'
    const updatedEvents = [...events.value]
    let recordIndex = findRecordIndex(payload)

    if (recordIndex === -1) {
      updatedEvents.unshift(createFallbackRecord(payload, targetName))
      recordIndex = 0
    }

    updatedEvents[recordIndex] = updateChild(updatedEvents[recordIndex], targetName, child => ({
      ...child,
      status,
      recognitionStatus: status,
      reco_id: payload.reco_id ?? child.reco_id ?? null,
      recognitionFocus: payload.focus ?? child.recognitionFocus
    }))

    events.value = updatedEvents.slice(0, 200)

    const mapped = mapStatusToNode(status)
    if (mapped) emitUpdate?.({ nodeId: targetName, status: mapped })
  }

  const applyAction = (payload: ActionPayload, emitUpdate?: (payload: NodeStatusPayload) => void) => {
    if (!payload) return
    const status = normalizeStatus(payload.status)
    const targetName = payload.name || '未知节点'
    const updatedEvents = [...events.value]
    let recordIndex = findRecordIndex(payload)

    if (recordIndex === -1) {
      updatedEvents.unshift(createFallbackRecord(payload, targetName))
      recordIndex = 0
    }

    updatedEvents[recordIndex] = updateChild(updatedEvents[recordIndex], targetName, child => ({
      ...child,
      status,
      actionStatus: status,
      action_id: payload.action_id ?? child.action_id ?? null,
      node_id: payload.node_id ?? child.node_id ?? null,
      actionFocus: payload.focus ?? child.actionFocus
    }))

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
    if (payload.type === 'node_action') {
      applyAction(payload, emitUpdate)
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
    activeAttemptByTask.clear()
  }

  return {
    STATUS,
    events,
    isStreamRunning,
    previewUrl,
    startPreviewAutoRefresh,
    stopPreviewAutoRefresh,
    startRealtimeStream,
    stopRealtimeStream,
    handlePauseDebug,
    copyText,
    clearEvents
  }
}
