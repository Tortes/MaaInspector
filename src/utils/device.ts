export function resolvePanelDeviceType(deviceType?: string): 'win32' | 'adb' {
  return deviceType === 'win32' || deviceType === 'win32control' ? 'win32' : 'adb'
}
