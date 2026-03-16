import { createHttpClient, type RequestOptions } from './httpClient'

const DEFAULT_API_BASE_URL = 'http://127.0.0.1:38081'

const API_BASE_URL = (() => {
  if (typeof window !== 'undefined') {
    const runtimeBase = (window as any).__MAA_API_BASE as string | undefined
    if (runtimeBase) return runtimeBase
  }

  // 允许通过构建时环境变量覆盖（如 Vite dev 场景）
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const viteEnv = (import.meta as any)?.env?.VITE_API_BASE as string | undefined
  return viteEnv || DEFAULT_API_BASE_URL
})()

const httpClient = createHttpClient(API_BASE_URL)

const mergeHeaders = (base?: HeadersInit, extra?: HeadersInit) => {
  const merged = new Headers(base || {})
  if (extra) {
    const extraHeaders = new Headers(extra)
    extraHeaders.forEach((value, key) => merged.set(key, value))
  }
  return merged
}

const mergeOptions = (base: RequestOptions, extra?: RequestOptions): RequestOptions => {
  if (!extra) return base
  return {
    ...base,
    ...extra,
    headers: mergeHeaders(base.headers, extra.headers)
  }
}

export interface ApiResponse<T = unknown> {
  success?: boolean
  message?: string
  info?: Record<string, unknown>
  data?: T
  [key: string]: unknown
}

export interface DeviceInfo {
  name?: string
  type?: string
  address?: string
  config?: Record<string, unknown>
  hwnd?: number | string
  class_name?: string
  window_name?: string
  adb_path?: string
  screencap_methods?: number
  input_methods?: number
  screencap_method?: number
  mouse_method?: number
  keyboard_method?: number
  [key: string]: unknown
}

export interface ResourceProfile {
  name?: string
  paths?: string[]
  [key: string]: unknown
}

export interface ResourceFileInfo {
  label: string
  value: string
  source: string
}

export interface ResourceLoadResponse extends ApiResponse {
  r?: boolean
  list?: ResourceFileInfo[]
}

export interface SystemState {
  device_index?: number
  resource_profile_index?: number
  resource_file?: string
  resource_source?: string
  agent_socket_id?: string
  edge_type?: string
  spacing?: string
  /** 保存时的 pipeline 版本：V1 | V2 */
  pipeline_version?: string
}

export interface SystemInitResponse {
  devices?: DeviceInfo[]
  resource_profiles?: ResourceProfile[]
  agent_socket_id?: string
  current_state?: SystemState
  last_connected_device?: DeviceInfo
}

export interface DeviceConfigPayload {
  devices: DeviceInfo[]
  resource_profiles: ResourceProfile[]
  agent_socket_id?: string
  current_state: SystemState
}

export interface FileNodesResponse<TNodes = Record<string, unknown>> {
  nodes?: TNodes
  list?: ResourceFileInfo[]
}

export interface TemplateImagesResponse<TResult = Record<string, unknown>> {
  results?: TResult
}

export interface ImageCheckResponse {
  unused_images?: string[]
  used_images?: string[]
}

export interface DebugRunResponse {
  success?: boolean
  error?: string
  [key: string]: unknown
}

export interface RecoDetailResponse extends ApiResponse {
  detail?: unknown
}

export interface DebugStreamPayload {
  type?: string
  task_id?: string
  name?: string
  next_list?: unknown
  focus?: unknown
  timestamp?: number
  status?: string
  reco_id?: string
  [key: string]: unknown
}

async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  return httpClient.request<T>(endpoint, options)
}

export const systemApi = {
  getInitialState: (options?: RequestOptions) =>
    request<SystemInitResponse>('/system/init', mergeOptions({ method: 'GET' }, options)),
  saveDeviceConfig: (fullConfig: DeviceConfigPayload, options?: RequestOptions) =>
    request<ApiResponse>('/system/config/save', mergeOptions({ method: 'POST', body: JSON.stringify(fullConfig) }, options)),
  searchDevices: (deviceType?: string, options?: RequestOptions) => {
    const body = deviceType ? JSON.stringify({ type: deviceType }) : undefined
    return request<ApiResponse<{ devices?: DeviceInfo[] }>>('/system/devices/search',
      mergeOptions({
        method: 'POST',
        ...(body ? { body } : {})
      }, options)
    )
  }
}

export interface ScreenshotResponse extends ApiResponse {
  image?: string
  size?: number[]
}

export const deviceApi = {
  connectAdb: (deviceData: { adb_path: string; address: string; config?: Record<string, unknown> }, options?: RequestOptions) =>
    request<ApiResponse>('/device/connect/adb', mergeOptions({ method: 'POST', body: JSON.stringify(deviceData) }, options)),
  connectWin32: (deviceData: { hwnd: number | string; screencap_method?: number; mouse_method?: number; keyboard_method?: number }, options?: RequestOptions) =>
    request<ApiResponse>('/device/connect/win32', mergeOptions({ method: 'POST', body: JSON.stringify(deviceData) }, options)),
  getScreenshot: (options?: RequestOptions) =>
    request<ScreenshotResponse>('/device/screenshot', mergeOptions({ method: 'GET' }, options))
}

export const resourceApi = {
  load: (profile: ResourceProfile | { paths?: string[] } | string, options?: RequestOptions) => {
    const paths = typeof profile === 'string'
      ? [profile]
      : Array.isArray((profile as ResourceProfile)?.paths)
        ? (profile as ResourceProfile).paths
        : (profile as { paths?: string[] })?.paths || []
    return request<ResourceLoadResponse>('/resource/load', mergeOptions({
      method: 'POST',
      body: JSON.stringify({ paths })
    }, options))
  },
  getFileNodes: <TNodes = Record<string, unknown>>(source: string, filename: string, options?: RequestOptions) =>
    request<FileNodesResponse<TNodes>>('/resource/file/nodes',
      mergeOptions({ method: 'POST', body: JSON.stringify({ source, filename }) }, options)),
  getTemplateImages: (source: string, filename: string, options?: RequestOptions) =>
    request<TemplateImagesResponse>('/resource/file/templates',
      mergeOptions({ method: 'POST', body: JSON.stringify({ source, filename }) }, options)),
  createFile: (path: string, filename: string, options?: RequestOptions) =>
    request<ApiResponse>('/resource/file/create',
      mergeOptions({ method: 'POST', body: JSON.stringify({ path, filename }) }, options)),
  saveFileNodes: <TNodes = Record<string, unknown>>(source: string, filename: string, nodes: TNodes, options?: RequestOptions) =>
    request<ApiResponse>('/resource/file/save',
      mergeOptions({ method: 'POST', body: JSON.stringify({ source, filename, nodes }) }, options)),
  searchGlobalNodes: (query: string, useRegex: boolean, currentFilename: string, currentSource: string, options?: RequestOptions) =>
    request<ApiResponse>('/resource/search/nodes',
      mergeOptions({ method: 'POST', body: JSON.stringify({ query, use_regex: useRegex, current_filename: currentFilename, current_source: currentSource }) }, options)),
  checkUnusedImages: (source: string, currentFilename: string, delImages: { path: string }[], options?: RequestOptions) =>
    request<ImageCheckResponse>('/resource/images/check-unused',
      mergeOptions({ method: 'POST', body: JSON.stringify({ source, current_filename: currentFilename, del_images: delImages }) }, options)),
  processImages: (source: string, deletePaths: string[], saveImages: { path: string; base64: string; nodeId?: string }[], options?: RequestOptions) =>
    request<ApiResponse>('/resource/images/process',
      mergeOptions({ method: 'POST', body: JSON.stringify({ source, delete_paths: deletePaths, save_images: saveImages }) }, options))
}

export const agentApi = {
  connect: (socketId: string, options?: RequestOptions) =>
    request<ApiResponse>('/agent/connect', mergeOptions({ method: 'POST', body: JSON.stringify({ socket_id: socketId }) }, options))
}

export const debugApi = {
  runNode: (payload: Record<string, unknown>, options?: RequestOptions) =>
    request<DebugRunResponse>('/debug/node', mergeOptions({ method: 'POST', body: JSON.stringify(payload) }, options)),
  stop: (options?: RequestOptions) =>
    request<ApiResponse>('/debug/stop', mergeOptions({ method: 'POST' }, options)),
  getRecoDetails: (recoId: string | number, options?: RequestOptions) =>
    request<RecoDetailResponse>('/debug/get_reco_details',
      mergeOptions({ method: 'POST', body: JSON.stringify({ reco_id: recoId }) }, options)),
  ocrText: (roi: number[], options?: RequestOptions) =>
    request<ApiResponse<{ text?: string }>>('/debug/ocr_text',
      mergeOptions({ method: 'POST', body: JSON.stringify({ roi }) }, options)),
  subscribeNodeStream: (onData: (data: DebugStreamPayload) => void) => {
    if (typeof onData !== 'function') return () => {}

    const es = new EventSource(`${API_BASE_URL}/debug/stream`)

    es.onmessage = (evt) => {
      if (!evt?.data) return
      try {
        const payload = JSON.parse(evt.data) as DebugStreamPayload
        onData(payload)
      } catch (e) {
        console.warn('[DebugStream] 无法解析消息', e)
      }
    }

    es.onerror = (err) => {
      console.warn('[DebugStream] SSE 连接异常', err)
    }

    return () => es.close()
  }
}
