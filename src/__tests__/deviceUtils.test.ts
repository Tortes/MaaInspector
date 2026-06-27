import { describe, expect, it } from 'vitest'
import { resolvePanelDeviceType } from '@/utils/device'

describe('resolvePanelDeviceType', () => {
  it('treats win32control as win32 panel device type', () => {
    expect(resolvePanelDeviceType('win32control')).toBe('win32')
  })

  it('keeps win32 and defaults others to adb', () => {
    expect(resolvePanelDeviceType('win32')).toBe('win32')
    expect(resolvePanelDeviceType('adb')).toBe('adb')
    expect(resolvePanelDeviceType(undefined)).toBe('adb')
  })
})
