import type { FlowBusinessData } from './flowTypes'

type PipelineNode = FlowBusinessData & {
  recognition?: unknown
  action?: unknown
}

const RECOGNITION_PARAM_KEYS = new Set([
  'roi',
  'roi_offset',
  'template',
  'threshold',
  'order_by',
  'index',
  'method',
  'green_mask',
  'count',
  'detector',
  'ratio',
  'lower',
  'upper',
  'connected',
  'expected',
  'replace',
  'only_rec',
  'model',
  'labels',
  'custom_recognition',
  'custom_recognition_param',
  'all_of',
  'any_of',
  'box_index',
  'sub_name'
])

const ACTION_PARAM_KEYS = new Set([
  'target',
  'target_offset',
  'contact',
  'pressure',
  'duration',
  'begin',
  'begin_offset',
  'end',
  'end_offset',
  'end_hold',
  'only_hover',
  'swipes',
  'starting',
  'dx',
  'dy',
  'key',
  'input_text',
  'package',
  'exec',
  'args',
  'detach',
  'cmd',
  'custom_action',
  'custom_action_param'
])

const isObject = (val: unknown): val is Record<string, unknown> =>
  !!val && typeof val === 'object' && !Array.isArray(val)

const pickParams = (source: Record<string, unknown>, keys: Set<string>) => {
  const result: Record<string, unknown> = {}
  keys.forEach(key => {
    if (source[key] !== undefined) result[key] = source[key]
  })
  return result
}

const removeKeys = (source: Record<string, unknown>, keys: Set<string>) => {
  keys.forEach(key => {
    delete source[key]
  })
}

const normalizeCompositeChildren = (
  value: unknown,
  converter: (child: Record<string, unknown>) => Record<string, unknown>
) => {
  if (!Array.isArray(value)) return value
  return value.map(child => (isObject(child) ? converter({ ...child }) : child))
}

const buildV2Section = (type?: string, param?: Record<string, unknown>) => {
  if (!type) return undefined
  const hasParam = param && Object.keys(param).length > 0
  return hasParam ? { type, param } : { type }
}

export const toPipelineV2Node = (node: PipelineNode): PipelineNode => {
  const source = { ...(node as Record<string, unknown>) }
  const result = { ...source }

  const recognition = source.recognition
  const recognitionType = typeof recognition === 'string'
    ? recognition
    : (isObject(recognition) ? (recognition.type as string | undefined) : undefined)
  const recognitionParamFromV2 = isObject(recognition) && isObject(recognition.param)
    ? { ...(recognition.param as Record<string, unknown>) }
    : {}
  const recognitionParamFromV1 = pickParams(source, RECOGNITION_PARAM_KEYS)
  const recognitionParam = { ...recognitionParamFromV1, ...recognitionParamFromV2 }

  const action = source.action
  const actionType = typeof action === 'string'
    ? action
    : (isObject(action) ? (action.type as string | undefined) : undefined)
  const actionParamFromV2 = isObject(action) && isObject(action.param)
    ? { ...(action.param as Record<string, unknown>) }
    : {}
  const actionParamFromV1 = pickParams(source, ACTION_PARAM_KEYS)
  const actionParam = { ...actionParamFromV1, ...actionParamFromV2 }

  if (recognitionType === 'And') {
    recognitionParam.all_of = normalizeCompositeChildren(recognitionParam.all_of, toPipelineV2Node)
  }
  if (recognitionType === 'Or') {
    recognitionParam.any_of = normalizeCompositeChildren(recognitionParam.any_of, toPipelineV2Node)
  }

  removeKeys(result, RECOGNITION_PARAM_KEYS)
  removeKeys(result, ACTION_PARAM_KEYS)

  if (recognitionType) {
    result.recognition = buildV2Section(recognitionType, recognitionParam)
  }
  if (actionType) {
    result.action = buildV2Section(actionType, actionParam)
  }

  return result as PipelineNode
}

export const toPipelineV1Node = (node: PipelineNode): PipelineNode => {
  const source = { ...(node as Record<string, unknown>) }
  const result = { ...source }

  const recognition = source.recognition
  if (isObject(recognition) && typeof recognition.type === 'string') {
    const recognitionType = recognition.type
    const recognitionParam = isObject(recognition.param) ? { ...(recognition.param as Record<string, unknown>) } : {}
    const compositeKey = recognitionType === 'And' ? 'all_of' : recognitionType === 'Or' ? 'any_of' : null
    if (compositeKey && recognitionParam[compositeKey] !== undefined) {
      recognitionParam[compositeKey] = normalizeCompositeChildren(recognitionParam[compositeKey], toPipelineV1Node)
    }
    result.recognition = recognitionType
    Object.keys(recognitionParam).forEach(key => {
      if (result[key] === undefined) result[key] = recognitionParam[key]
    })
  }

  const action = source.action
  if (isObject(action) && typeof action.type === 'string') {
    const actionType = action.type
    const actionParam = isObject(action.param) ? { ...(action.param as Record<string, unknown>) } : {}
    result.action = actionType
    Object.keys(actionParam).forEach(key => {
      if (result[key] === undefined) result[key] = actionParam[key]
    })
  }

  return result as PipelineNode
}

export const toPipelineV2Nodes = (nodes: Record<string, FlowBusinessData>) => {
  const result: Record<string, FlowBusinessData> = {}
  Object.entries(nodes || {}).forEach(([id, node]) => {
    result[id] = toPipelineV2Node(node) as FlowBusinessData
  })
  return result
}

export const toPipelineV1Nodes = (nodes: Record<string, FlowBusinessData>) => {
  const result: Record<string, FlowBusinessData> = {}
  Object.entries(nodes || {}).forEach(([id, node]) => {
    result[id] = toPipelineV1Node(node) as FlowBusinessData
  })
  return result
}
