import { invoke } from '@tauri-apps/api/core';
import type { UnlistenFn } from '@tauri-apps/api/event';
import { listen } from '@tauri-apps/api/event';

// API Response types
export interface ApiResponse<T = unknown> {
  success?: boolean;
  message?: string;
  info?: Record<string, unknown>;
  data?: T;
  [key: string]: unknown;
}

export interface ApiDeviceInfo {
  name?: string;
  type?: string;
  address?: string;
  config?: Record<string, unknown>;
  hwnd?: number | string;
  class_name?: string;
  window_name?: string;
  adb_path?: string;
  screencap_methods?: number;
  input_methods?: number;
  screencap_method?: number;
  mouse_method?: number;
  keyboard_method?: number;
  [key: string]: unknown;
}

export interface ResourceProfile {
  name?: string;
  paths?: string[];
  [key: string]: unknown;
}

export interface ResourceFileInfo {
  label: string;
  value: string | null;
  source: string;
  filename: string | null;
}

export interface ResourceLoadResponse extends ApiResponse {
  r?: boolean;
  list?: ResourceFileInfo[];
}

export interface SystemState {
  device_index?: number;
  resource_profile_index?: number;
  resource_file?: string;
  resource_source?: string;
  agent_socket_id?: string;
  edge_type?: string;
  spacing?: string;
  layout_algorithm?: string;
  layout_direction?: string;
  pipeline_version?: string;
  restore_workspace_on_start?: boolean;
}

export interface CanvasSettings {
  edge_type?: string;
  spacing?: string;
  layout_algorithm?: string;
  layout_direction?: string;
  pipeline_version?: string;
}

export interface TabResourceInfo {
  id?: string;
  title?: string;
  resource_file?: string;
}

export interface WorkspaceState {
  resource_index?: number;
  resource_signature?: string;
  tabs?: TabResourceInfo[];
  active_tab_id?: string;
  restore_workspace_on_start?: boolean;
}

export interface LastTabsState {
  resource_index: number;
  tabs: TabResourceInfo[];
  active_tab_id?: string;
}

export interface SystemInitResponse {
  resource_profiles?: ResourceProfile[];
  current_resource_index?: number;
  agent_socket_id?: string;
  canvas_settings?: CanvasSettings;
  restore_workspace_on_start?: boolean;
  workspace_state?: WorkspaceState;
  last_tabs?: LastTabsState;
}

export interface DeviceConfigPayload {
  resource_profiles: ResourceProfile[];
  current_resource_index?: number;
  agent_socket_id?: string;
  canvas_settings?: CanvasSettings;
  restore_workspace_on_start?: boolean;
  workspace_state?: WorkspaceState;
  last_tabs?: LastTabsState;
}

export interface FileNodesResponse<TNodes = Record<string, unknown>> {
  nodes?: TNodes;
  list?: ResourceFileInfo[];
}

export interface TemplateImagesResponse<TResult = Record<string, unknown>> {
  results?: TResult;
}

export interface ImageCheckResponse {
  unused_images?: string[];
  used_images?: string[];
}

export interface DebugRunResponse {
  success?: boolean;
  error?: string;
  [key: string]: unknown;
}

export interface RecoDetailResponse extends ApiResponse {
  detail?: unknown;
}

export interface DebugStreamPayload {
  type?: string;
  task_id?: number;
  name?: string;
  next_list?: unknown;
  focus?: unknown;
  timestamp?: number;
  status?: string;
  reco_id?: number;
  [key: string]: unknown;
}

export interface ScreenshotResponse extends ApiResponse {
  image?: string;
  size?: number[];
}

export interface OcrRecognitionCandidate {
  box?: number[];
  score: number;
  text: string;
}

export interface OcrRecognitionResponse extends ApiResponse {
  data?: {
    text?: string;
    best?: OcrRecognitionCandidate | null;
    all?: OcrRecognitionCandidate[];
    filtered?: OcrRecognitionCandidate[];
  };
}

// System API
export const systemApi = {
  getInitialState: async (): Promise<SystemInitResponse> => {
    return invoke('system_init');
  },

  saveDeviceConfig: async (fullConfig: DeviceConfigPayload): Promise<ApiResponse> => {
    return invoke('system_save_config', { configData: fullConfig });
  },

  searchDevices: async (deviceType?: string): Promise<ApiResponse<{ devices?: ApiDeviceInfo[] }>> => {
    return invoke('system_search_devices', { deviceType });
  }
};

// Device API
export const deviceApi = {
  connectAdb: async (
    deviceData: {
      adb_path: string;
      address: string;
      config?: Record<string, unknown>;
      name?: string;
    }
  ): Promise<ApiResponse> => {
    return invoke('device_connect_adb', {
      adbPath: deviceData.adb_path,
      address: deviceData.address,
      config: deviceData.config,
      name: deviceData.name,
    });
  },

  connectWin32: async (
    deviceData: {
      hwnd: number | string;
      name?: string;
      window_name?: string;
      class_name?: string;
      screencap_method?: number;
      mouse_method?: number;
      keyboard_method?: number;
    }
  ): Promise<ApiResponse> => {
    return invoke('device_connect_win32', {
      hwnd: deviceData.hwnd,
      name: deviceData.name,
      windowName: deviceData.window_name,
      className: deviceData.class_name,
      screencapMethod: deviceData.screencap_method,
      mouseMethod: deviceData.mouse_method,
      keyboardMethod: deviceData.keyboard_method,
    });
  },

  getScreenshot: async (): Promise<ScreenshotResponse> => {
    return invoke('device_screenshot');
  },

  ocrText: async (roi: number[]): Promise<OcrRecognitionResponse> => {
    return invoke('debug_ocr_text', { roi });
  }
};

// Resource API
export const resourceApi = {
  load: async (profile: ResourceProfile | { paths?: string[] } | string): Promise<ResourceLoadResponse> => {
    const paths = typeof profile === 'string'
      ? [profile]
      : Array.isArray((profile as ResourceProfile)?.paths)
        ? (profile as ResourceProfile).paths
        : (profile as { paths?: string[] })?.paths || [];

    return invoke('resource_load', { paths });
  },

  getFileNodes: async <TNodes = Record<string, unknown>>(
    source: string,
    filename: string
  ): Promise<FileNodesResponse<TNodes>> => {
    return invoke('resource_get_file_nodes', { source, filename });
  },

  getTemplateImages: async (
    source: string,
    filename: string
  ): Promise<TemplateImagesResponse> => {
    return invoke('resource_get_templates', { source, filename });
  },

  createFile: async (path: string, filename: string): Promise<ApiResponse> => {
    return invoke('resource_create_file', { path, filename });
  },

  saveFileNodes: async <TNodes = Record<string, unknown>>(
    source: string,
    filename: string,
    nodes: TNodes
  ): Promise<ApiResponse> => {
    return invoke('resource_save_file_nodes', { source, filename, nodes });
  },

  searchGlobalNodes: async (
    query: string,
    useRegex: boolean,
    currentFilename: string,
    currentSource: string
  ): Promise<ApiResponse> => {
    return invoke('resource_search_nodes', {
      query,
      useRegex,
      currentFilename,
      currentSource
    });
  },

  checkUnusedImages: async (
    source: string,
    currentFilename: string,
    delImages: { path: string }[]
  ): Promise<ImageCheckResponse> => {
    return invoke('resource_check_unused_images', {
      source,
      currentFilename,
      delImages
    });
  },

  processImages: async (
    source: string,
    deletePaths: string[],
    saveImages: { path: string; base64: string; nodeId?: string }[]
  ): Promise<ApiResponse> => {
    return invoke('resource_process_images', {
      source,
      deletePaths,
      saveImages
    });
  }
};

// Agent API
export const agentApi = {
  connect: async (socketId: string): Promise<ApiResponse> => {
    return invoke('agent_connect', { socketId });
  }
};

// Debug API
export const debugApi = {
  runNode: async (payload: Record<string, unknown>): Promise<DebugRunResponse> => {
    return invoke('debug_run_node', payload);
  },

  stop: async (): Promise<ApiResponse> => {
    return invoke('debug_stop');
  },

  getRecoDetails: async (recoId: string | number): Promise<RecoDetailResponse> => {
    return invoke('debug_get_reco_details', { recoId });
  },

  subscribeNodeStream: (onData: (data: DebugStreamPayload) => void): (() => void) => {
    if (typeof onData !== 'function') return () => {};

    let unlistenFns: UnlistenFn[] = [];
    let cancelled = false;

    const setupListeners = async () => {
      const un1 = await listen<DebugStreamPayload>('debug:node_next_list', (event) => {
        if (!cancelled) onData(event.payload);
      });
      const un2 = await listen<DebugStreamPayload>('debug:node_recognition', (event) => {
        if (!cancelled) onData(event.payload);
      });
      unlistenFns = [un1, un2];
      if (cancelled) unlistenFns.forEach(fn => fn());
    };

    setupListeners();

    return () => {
      cancelled = true;
      unlistenFns.forEach(fn => fn());
    };
  }
};
