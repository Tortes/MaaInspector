import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import DeviceManager from '@/components/Flow/InfoPanel/DeviceManager.vue'
import { deviceApi } from '@/services/api'

vi.mock('@/services/api', () => ({
  systemApi: {
    searchDevices: vi.fn(),
  },
  deviceApi: {
    connectAdb: vi.fn(),
    connectWin32: vi.fn(),
    getScreenshot: vi.fn().mockResolvedValue({ success: false }),
  },
}))

describe('DeviceManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('restores win32control snapshot values when loading the last device', async () => {
    const wrapper = mount(DeviceManager, {
      props: {
        isConnected: false,
        snapshot: {
          status: 'disconnected',
          message: '设备未连接',
          deviceType: 'adb',
          searchedDevices: [],
          selectedDeviceIndex: -1,
          info: {},
          win32ScreencapMethod: 4,
          win32MouseMethod: 1,
          win32KeyboardMethod: 1,
        },
      },
      global: {
        stubs: {
          Dropdown: {
            template: '<div />',
            props: ['modelValue', 'options', 'disabled', 'placeholder', 'size'],
          },
          StatusIndicator: {
            template: '<div />',
          },
        },
      },
    })

    ;(
      wrapper.vm as unknown as {
        loadLastDevice: (device: Record<string, unknown>) => void
      }
    ).loadLastDevice({
      type: 'win32control',
      hwnd: 4096,
      name: 'Window B',
      window_name: 'Window B',
      screencap_method: 16,
      mouse_method: 512,
      keyboard_method: 512,
    })

    await nextTick()

    const snapshots = wrapper.emitted<'status-change'>('status-change') ?? []
    const latestSnapshot = snapshots[snapshots.length - 1]?.[0]

    expect(latestSnapshot).toMatchObject({
      deviceType: 'win32',
      selectedDeviceIndex: 0,
      win32ScreencapMethod: 16,
      win32MouseMethod: 512,
      win32KeyboardMethod: 1,
    })
  })

  it('keeps Interception for mouse but falls back to a supported keyboard method', async () => {
    vi.mocked(deviceApi.connectWin32).mockResolvedValue({ success: true, message: 'OK' })

    const wrapper = mount(DeviceManager, {
      props: {
        isConnected: false,
        snapshot: {
          status: 'disconnected',
          message: '设备未连接',
          deviceType: 'win32',
          searchedDevices: [
            {
              type: 'win32control',
              hwnd: 2002,
              name: 'Window A',
              window_name: 'Window A',
            },
          ],
          selectedDeviceIndex: 0,
          info: {},
          win32ScreencapMethod: 4,
          win32MouseMethod: 512,
          win32KeyboardMethod: 512,
        },
      },
      global: {
        stubs: {
          Dropdown: {
            template: '<div />',
            props: ['modelValue', 'options', 'disabled', 'placeholder', 'size'],
          },
          StatusIndicator: {
            template: '<div />',
          },
        },
      },
    })

    await nextTick()

    const connectButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('连接设备') || button.text().includes('重新连接'))
    expect(connectButton).toBeTruthy()

    await connectButton!.trigger('click')

    expect(deviceApi.connectWin32).toHaveBeenCalledWith(
      expect.objectContaining({
        hwnd: 2002,
        screencap_method: 4,
        mouse_method: 512,
        keyboard_method: 1,
      })
    )
  })
})
