import { describe, expect, it } from 'vitest'
import {
  DEFAULT_WIN32_KEYBOARD_METHOD,
  resolvePanelDeviceType,
  sanitizeWin32KeyboardMethod,
} from '@/utils/device'

describe('resolvePanelDeviceType', () => {
  it('treats win32control as win32 panel device type', () => {
    expect(resolvePanelDeviceType('win32control')).toBe('win32')
  })

  it('keeps win32 and defaults others to adb', () => {
    expect(resolvePanelDeviceType('win32')).toBe('win32')
    expect(resolvePanelDeviceType('adb')).toBe('adb')
    expect(resolvePanelDeviceType(undefined)).toBe('adb')
  })

  it('falls back when Interception is used as keyboard method', () => {
    expect(sanitizeWin32KeyboardMethod(512)).toBe(DEFAULT_WIN32_KEYBOARD_METHOD)
    expect(sanitizeWin32KeyboardMethod(2)).toBe(2)
    expect(sanitizeWin32KeyboardMethod(undefined)).toBe(DEFAULT_WIN32_KEYBOARD_METHOD)
  })
})
