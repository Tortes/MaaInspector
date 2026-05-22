import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSettingsStore } from '@/stores/settings'

describe('useSettingsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  describe('default values', () => {
    it('should have default edgeType', () => {
      const store = useSettingsStore()
      expect(store.edgeType).toBe('smoothstep')
    })

    it('should have default spacing', () => {
      const store = useSettingsStore()
      expect(store.spacing).toBe('normal')
    })

    it('should have default layoutAlgorithm', () => {
      const store = useSettingsStore()
      expect(store.layoutAlgorithm).toBe('layered')
    })

    it('should have default layoutDirection', () => {
      const store = useSettingsStore()
      expect(store.layoutDirection).toBe('TB')
    })

    it('should have default pipelineVersion', () => {
      const store = useSettingsStore()
      expect(store.pipelineVersion).toBe('V1')
    })

    it('should have default restoreWorkspaceOnStart', () => {
      const store = useSettingsStore()
      expect(store.restoreWorkspaceOnStart).toBe(true)
    })

    it('should have default lowMemoryMode', () => {
      const store = useSettingsStore()
      expect(store.lowMemoryMode).toBe(false)
    })
  })

  describe('updateSettings', () => {
    it('should update edgeType', () => {
      const store = useSettingsStore()
      store.updateSettings({ edgeType: 'default' })
      expect(store.edgeType).toBe('default')
    })

    it('should update spacing', () => {
      const store = useSettingsStore()
      store.updateSettings({ spacing: 'compact' })
      expect(store.spacing).toBe('compact')
    })

    it('should update layoutAlgorithm', () => {
      const store = useSettingsStore()
      store.updateSettings({ layoutAlgorithm: 'stress' })
      expect(store.layoutAlgorithm).toBe('stress')
    })

    it('should update layoutDirection', () => {
      const store = useSettingsStore()
      store.updateSettings({ layoutDirection: 'LR' })
      expect(store.layoutDirection).toBe('LR')
    })

    it('should update pipelineVersion', () => {
      const store = useSettingsStore()
      store.updateSettings({ pipelineVersion: 'V2' })
      expect(store.pipelineVersion).toBe('V2')
    })

    it('should update restoreWorkspaceOnStart', () => {
      const store = useSettingsStore()
      store.updateSettings({ restoreWorkspaceOnStart: false })
      expect(store.restoreWorkspaceOnStart).toBe(false)
    })

    it('should update lowMemoryMode', () => {
      const store = useSettingsStore()
      store.updateSettings({ lowMemoryMode: true })
      expect(store.lowMemoryMode).toBe(true)
    })

    it('should update multiple settings at once', () => {
      const store = useSettingsStore()
      store.updateSettings({
        edgeType: 'default',
        spacing: 'compact',
        layoutAlgorithm: 'stress',
        layoutDirection: 'LR'
      })
      expect(store.edgeType).toBe('default')
      expect(store.spacing).toBe('compact')
      expect(store.layoutAlgorithm).toBe('stress')
      expect(store.layoutDirection).toBe('LR')
    })

    it('should not update undefined fields', () => {
      const store = useSettingsStore()
      store.updateSettings({ edgeType: 'default' })
      expect(store.spacing).toBe('normal')
      expect(store.layoutAlgorithm).toBe('layered')
    })
  })
})
