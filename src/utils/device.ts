export const WIN32_INPUT_METHOD_INTERCEPTION = 1 << 9
export const DEFAULT_WIN32_KEYBOARD_METHOD = 1

export function resolvePanelDeviceType(deviceType?: string): 'win32' | 'adb' {
  return deviceType === 'win32' || deviceType === 'win32control' ? 'win32' : 'adb'
}

export function sanitizeWin32KeyboardMethod(
  method?: number,
  fallback = DEFAULT_WIN32_KEYBOARD_METHOD
): number {
  if (method === WIN32_INPUT_METHOD_INTERCEPTION) return fallback
  return typeof method === 'number' ? method : fallback
}
