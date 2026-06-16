import { describe, it, expect, vi } from 'vitest'
import { useDeviceScreenPicker } from '@/composables/useDeviceScreenPicker'

vi.mock('vue', async (importOriginal) => {
  const mod = await importOriginal<typeof import('vue')>()
  return {
    ...mod,
    inject: vi.fn(() => ({
      getNodeSavedImages: () => [],
      getNodeTempImages: () => [],
      getNodeDeletedImages: () => []
    }))
  }
})

describe('useDeviceScreenPicker', () => {
  it('writes OCR text back to the selected field', () => {
    const state: Record<string, unknown> = { expected: '' }
    const setValue = vi.fn((key: string, value: unknown) => {
      state[key] = value
    })
    const getValue = vi.fn((key: string, fallback?: unknown) => state[key] ?? fallback)
    const onUpdateData = vi.fn()

    const picker = useDeviceScreenPicker({
      formData: state,
      getValue,
      setValue,
      onUpdateData
    })

    picker.openDevicePicker('expected', 'roi', 'ROI')
    picker.handleDevicePick({
      text: '浏览器',
      best: { text: '浏览器', score: 0.98, box: [1, 2, 3, 4] },
      all: [{ text: '浏览器', score: 0.98, box: [1, 2, 3, 4] }],
      filtered: [{ text: '浏览器', score: 0.98, box: [1, 2, 3, 4] }]
    })

    expect(setValue).toHaveBeenCalledWith('expected', '浏览器')
  })
})
