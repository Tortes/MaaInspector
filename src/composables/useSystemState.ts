import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { makeFileId } from '@/utils/fileId'
import { useAppConfigStore } from '@/stores/appConfig'

interface ResourceManagerRef {
  availableFiles: Array<{ label?: string; source?: string | null; value?: string | null; filename?: string | null }>
  findFileById: (id: string) => { source?: string | null; value?: string | null } | undefined
  executeFileSwitch: (filename: string, source?: string) => Promise<void>
  setMessage: (message: string) => void
}

type SaveNodesEmit = (e: 'save-nodes', payload: { source: string; filename: string }) => void

export function useSystemState(emit: SaveNodesEmit) {
  const store = useAppConfigStore()
  const isSaving = ref(false)

  const currentProfile = computed(() => store.currentProfile)
  const selectedResourceFile = computed(() => store.resource.selectedFileId)
  const pipelineVersion = computed(() => store.canvas.pipelineVersion)

  const fetchSystemState = async () => {
    await store.loadFromBackend()
  }

  const handleSaveNodes = async (resourceManagerRef: ResourceManagerRef | null, targetFileId?: string) => {
    const fileId = targetFileId || store.resource.selectedFileId
    if (!fileId || isSaving.value) return
    isSaving.value = true
    try {
      const rm = resourceManagerRef
      if (!rm) throw new Error('ResourceManager 未就绪')
      const fileObj = rm.findFileById(fileId)
      if (!fileObj || !fileObj.value) throw new Error('未找到当前文件')
      emit('save-nodes', { source: fileObj.source ?? '', filename: fileObj.value ?? '' })
    } catch (e: unknown) {
      console.error('保存失败', e)
      ElMessage.error('保存失败: ' + (e instanceof Error ? e.message : '未知错误'))
      throw e
    } finally {
      isSaving.value = false
    }
  }

  const executeFileSwitch = async (filename: string, source: string | undefined, resourceManagerRef: ResourceManagerRef | null) => {
    const rm = resourceManagerRef
    if (!rm) return

    const normSource = source ? source.replace(/\\/g, '/').toLowerCase() : ''
    const target = rm.availableFiles.find((f) => {
      const fSource = f.source ? f.source.replace(/\\/g, '/').toLowerCase() : ''
      if (source) {
        return f.value === filename && fSource === normSource
      }
      return f.value === filename
    })

    if (target && target.value) {
      const fileId = makeFileId(target.source ?? '', target.value)
      store.selectResourceFile(fileId)
      await rm.executeFileSwitch(target.value, target.source ?? undefined)
    } else {
      ElMessage.error(`无法切换: 未找到文件 ${filename}`)
    }
  }

  return {
    isSaving,
    currentProfile,
    selectedResourceFile,
    pipelineVersion,
    fetchSystemState,
    handleSaveNodes,
    executeFileSwitch
  }
}
