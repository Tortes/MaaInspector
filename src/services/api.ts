import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';

// API Response types
export interface ApiResponse<T = unknown> {
  success?: boolean;
  message?: string;
  info?: Record<string, unknown>;
  data?: T;
  [key: string]: unknown;
}

export interface DeviceInfo {
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
  pipeline_version?: string;
}

export interface SystemInitResponse {
  devices?: DeviceInfo[];
  resource_profiles?: ResourceProfile[];
  agent_socket_id?: string;
  current_state?: SystemState;
  last_connected_device?: DeviceInfo;
}

export interface DeviceConfigPayload {
  devices: DeviceInfo[];
  resource_profiles: ResourceProfile[];
  agent_socket_id?: string;
  current_state: SystemState;
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

// Options type for API calls (context is ignored in Tauri implementation)
export interface ApiOptions {
  context?: { feature?: string; action?: string; component?: string };
}

// System API
export const systemApi = {
  getInitialState: async (_options?: ApiOptions): Promise<SystemInitResponse> => {
    return invoke('system_init');
  },

  saveDeviceConfig: async (fullConfig: DeviceConfigPayload, _options?: ApiOptions): Promise<ApiResponse> => {
    return invoke('system_save_config', { configData: fullConfig });
  },

  searchDevices: async (deviceType?: string, _options?: ApiOptions): Promise<ApiResponse<{ devices?: DeviceInfo[] }>> => {
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
    },
    _options?: ApiOptions
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
    },
    _options?: ApiOptions
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

  getScreenshot: async (_options?: ApiOptions): Promise<ScreenshotResponse> => {
    return invoke('device_screenshot');
  }
};

// Resource API
export const resourceApi = {
  load: async (profile: ResourceProfile | { paths?: string[] } | string, _options?: ApiOptions): Promise<ResourceLoadResponse> => {
    const paths = typeof profile === 'string'
      ? [profile]
      : Array.isArray((profile as ResourceProfile)?.paths)
        ? (profile as ResourceProfile).paths
        : (profile as { paths?: string[] })?.paths || [];

    return invoke('resource_load', { paths });
  },

  getFileNodes: async <TNodes = Record<string, unknown>>(
    source: string,
    filename: string,
    _options?: ApiOptions
  ): Promise<FileNodesResponse<TNodes>> => {
    return invoke('resource_get_file_nodes', { source, filename });
  },

  getTemplateImages: async (
    source: string,
    filename: string,
    _options?: ApiOptions
  ): Promise<TemplateImagesResponse> => {
    return invoke('resource_get_templates', { source, filename });
  },

  createFile: async (path: string, filename: string, _options?: ApiOptions): Promise<ApiResponse> => {
    return invoke('resource_create_file', { path, filename });
  },

  saveFileNodes: async <TNodes = Record<string, unknown>>(
    source: string,
    filename: string,
    nodes: TNodes,
    _options?: ApiOptions
  ): Promise<ApiResponse> => {
    return invoke('resource_save_file_nodes', { source, filename, nodes });
  },

  searchGlobalNodes: async (
    query: string,
    useRegex: boolean,
    currentFilename: string,
    currentSource: string,
    _options?: ApiOptions
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
    delImages: { path: string }[],
    _options?: ApiOptions
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
    saveImages: { path: string; base64: string; nodeId?: string }[],
    _options?: ApiOptions
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
  connect: async (socketId: string, _options?: ApiOptions): Promise<ApiResponse> => {
    return invoke('agent_connect', { socketId });
  }
};

// Debug API
export const debugApi = {
  runNode: async (payload: Record<string, unknown>, _options?: ApiOptions): Promise<DebugRunResponse> => {
    return invoke('debug_run_node', payload);
  },

  stop: async (_options?: ApiOptions): Promise<ApiResponse> => {
    return invoke('debug_stop');
  },

  getRecoDetails: async (recoId: string | number, _options?: ApiOptions): Promise<RecoDetailResponse> => {
    return invoke('debug_get_reco_details', { recoId });
  },

  ocrText: async (roi: number[], _options?: ApiOptions): Promise<ApiResponse<{ text?: string }>> => {
    return invoke('debug_ocr_text', { roi });
  },

  subscribeNodeStream: (onData: (data: DebugStreamPayload) => void): (() => void) => {
    if (typeof onData !== 'function') return () => {};

    let unlisten: UnlistenFn | null = null;

    const setupListeners = async () => {
      const unlistenNextList = await listen<DebugStreamPayload>('debug:node_next_list', (event) => {
        onData(event.payload);
      });

      const unlistenRecognition = await listen<DebugStreamPayload>('debug:node_recognition', (event) => {
        onData(event.payload);
      });

      return () => {
        unlistenNextList();
        unlistenRecognition();
      };
    };

    setupListeners().then((fn) => {
      unlisten = fn;
    });

    return () => {
      if (unlisten) unlisten();
    };
  }
};