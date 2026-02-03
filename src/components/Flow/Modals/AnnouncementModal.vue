<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { Bell, X, Clock, CheckCircle, AlertTriangle, Sparkles, Bug } from 'lucide-vue-next'

interface AnnouncementProps {
  visible: boolean
}

const props = withDefaults(defineProps<AnnouncementProps>(), {
  visible: false
})

defineEmits<{
  (e: 'close'): void
}>()

// 解析后的公告数据
interface AnnouncementItem {
  version: string
  date: string
  features: string[]
  improvements: string[]
  fixes: string[]
}

const announcements = ref<AnnouncementItem[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

// 从本地文件加载changelog
const loadChangelog = async () => {
  loading.value = true
  error.value = null

  try {
    // 尝试从public目录加载changelog.md
    const changelogUrl = new URL('changelog.md', import.meta.env.BASE_URL).toString()
    const response = await fetch(changelogUrl, { cache: 'no-store' })
    if (!response.ok) {
      throw new Error('无法加载更新日志')
    }
    const content = await response.text()
    announcements.value = parseMarkdown(content)
  } catch (e) {
    console.error('加载changelog失败:', e)
    error.value = '加载更新日志失败'

    // 使用默认示例数据作为fallback
    announcements.value = [
      {
        version: 'v1.2.0',
        date: '2025-01-19',
        features: ['🎨 新增应用设置面板,支持个性化配置', '📢 新增更新公告功能,及时了解最新动态', '🖼️ 优化设备截图预览性能'],
        improvements: ['⚡ 提升画布加载速度', '🎯 改进节点搜索体验', '📱 响应式布局优化'],
        fixes: ['修复资源文件切换时的状态保存问题', '修复Win32设备连接参数配置bug']
      },
      {
        version: 'v1.1.0',
        date: '2025-01-15',
        features: ['🔧 支持Win32窗口设备连接', '🎛️ 新增多种截图和输入方法配置'],
        improvements: ['⚡ 优化节点属性编辑器性能', '📝 改进流程图导出功能'],
        fixes: ['修复ADB设备连接超时问题', '修复节点删除时的状态同步bug']
      }
    ]
  } finally {
    loading.value = false
  }
}

// 解析markdown格式的changelog
const parseMarkdown = (content: string): AnnouncementItem[] => {
  const items: AnnouncementItem[] = []
  const lines = content.split(/\r?\n/)

  let currentItem: Partial<AnnouncementItem> | null = null
  let currentSection: 'features' | 'improvements' | 'fixes' | null = null

  const ensureItem = () => {
    if (!currentItem) return null
    currentItem.features ??= []
    currentItem.improvements ??= []
    currentItem.fixes ??= []
    return currentItem
  }

  const splitListItems = (text: string): string[] => {
    return text
      .split(/\s+-\s+/)
      .map((item) => item.trim())
      .filter(Boolean)
  }

  const resolveSection = (section: string) => {
    const normalized = section.toLowerCase()
    if (
      section.includes('新功能') ||
      section.includes('特性') ||
      normalized.includes('feature') ||
      normalized.includes('new')
    ) {
      return 'features'
    }
    if (
      section.includes('优化') ||
      section.includes('改进') ||
      section.includes('变更') ||
      section.includes('更新') ||
      normalized.includes('improve') ||
      normalized.includes('change') ||
      normalized.includes('changelog')
    ) {
      return 'improvements'
    }
    if (section.includes('修复') || normalized.includes('fix')) {
      return 'fixes'
    }
    return null
  }

  for (const line of lines) {
    // 匹配版本行: ## v1.0.0 (2024-01-01) / ## v1.0.0 (since v0.9.0) / ## v1.0.0 - 2024-01-01
    const versionMatch = line.match(/^##\s+v?([\d.]+)(?:\s*\(([^)]+)\))?(?:\s*-\s*(.+))?/)
    if (versionMatch) {
      if (currentItem) {
        items.push(currentItem as AnnouncementItem)
      }
      const dateText = (versionMatch[2] || versionMatch[3] || '未知日期').trim()
      currentItem = {
        version: `v${versionMatch[1]}`,
        date: dateText,
        features: [],
        improvements: [],
        fixes: []
      }
      currentSection = null
      continue
    }

    // 匹配章节标题: ### 新功能 / ### 优化 / ### 修复 (可能同一行带列表)
    if (line.startsWith('###')) {
      const sectionLine = line.replace(/^###\s*/, '').trim()
      const inlineMatch = sectionLine.match(/^(.*?)(?:\s*[-*]\s+(.+))$/)
      const sectionTitle = (inlineMatch ? inlineMatch[1] : sectionLine).trim()
      currentSection = resolveSection(sectionTitle)
      const inlineItem = inlineMatch ? inlineMatch[2].trim() : ''
      if (inlineItem && currentSection && currentItem) {
        const target = ensureItem()?.[currentSection]
        if (target) {
          splitListItems(inlineItem).forEach((item) => target.push(item))
        }
      }
      continue
    }

    // 匹配列表项: - xxx 或 * xxx
    const listMatch = line.match(/^[-*]\s*(.+)/)
    if (listMatch && currentItem) {
      const text = listMatch[1].trim()
      if (text) {
        const section = currentSection ?? 'improvements'
        const target = ensureItem()?.[section]
        if (target) {
          splitListItems(text).forEach((item) => target.push(item))
        }
      }
    }
  }

  if (currentItem) {
    items.push(currentItem as AnnouncementItem)
  }

  return items
}

onMounted(() => {
  if (props.visible) {
    loadChangelog()
  }
})

// 监听visible状态,每次打开时重新加载
watch(() => props.visible, (val: boolean) => {
  if (val) {
    loadChangelog()
  }
})
</script>

<template>
  <div v-if="visible"
       class="fixed inset-0 z-[100] flex items-center justify-center bg-black/20 backdrop-blur-sm animate-in fade-in duration-200">
    <div class="bg-white rounded-xl shadow-2xl border border-slate-200 flex overflow-hidden w-[600px] max-h-[80vh]">
      <div class="flex-1 flex flex-col bg-white">
        <!-- 标题栏 -->
        <div class="flex items-center justify-between p-4 border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-violet-50">
          <h3 class="font-bold text-slate-700 flex items-center gap-2">
            <div class="p-1.5 bg-indigo-500 rounded-lg">
              <Bell :size="16" class="text-white"/>
            </div>
            更新公告
          </h3>
          <button @click="$emit('close')" class="text-slate-400 hover:text-red-500 transition-colors">
            <X :size="20"/>
          </button>
        </div>

        <!-- 内容区域 -->
        <div class="flex-1 overflow-y-auto custom-scrollbar">
          <!-- 加载中 -->
          <div v-if="loading" class="flex items-center justify-center py-12">
            <div class="text-slate-400 flex items-center gap-2">
              <svg class="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" stroke-dasharray="31.4" stroke-dashoffset="31.4"/>
              </svg>
              加载中...
            </div>
          </div>

          <!-- 错误 -->
          <div v-else-if="error" class="flex flex-col items-center justify-center py-12 text-slate-400">
            <AlertTriangle :size="48" class="mb-2 opacity-50"/>
            <p class="text-sm">{{ error }}</p>
          </div>

          <!-- 公告列表 -->
          <div v-else-if="announcements.length > 0" class="p-5 space-y-4">
            <div v-for="(item, index) in announcements" :key="index"
                 class="bg-gradient-to-br from-slate-50 to-white border border-slate-200 rounded-xl overflow-hidden">
              <!-- 版本头部 -->
              <div class="flex items-center justify-between px-4 py-3 bg-white border-b border-slate-100">
                <div class="flex items-center gap-2">
                  <span class="px-2.5 py-1 bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold">{{ item.version }}</span>
                  <span class="flex items-center gap-1 text-[11px] text-slate-500">
                    <Clock :size="11"/>
                    {{ item.date }}
                  </span>
                </div>
                <CheckCircle :size="16" class="text-emerald-500"/>
              </div>

              <!-- 更新内容 -->
              <div class="p-4 space-y-3">
                <!-- 新功能 -->
                <div v-if="item.features.length > 0" class="space-y-1.5">
                  <div class="flex items-center gap-1.5 text-[11px] font-bold text-violet-600 uppercase">
                    <Sparkles :size="12"/>
                    新功能
                  </div>
                  <ul class="space-y-1">
                    <li v-for="(feature, fIdx) in item.features" :key="fIdx"
                        class="text-xs text-slate-600 flex items-start gap-2 pl-3">
                      <span class="text-violet-400 mt-0.5">•</span>
                      <span>{{ feature }}</span>
                    </li>
                  </ul>
                </div>

                <!-- 优化 -->
                <div v-if="item.improvements.length > 0" class="space-y-1.5">
                  <div class="flex items-center gap-1.5 text-[11px] font-bold text-blue-600 uppercase">
                    <CheckCircle :size="12"/>
                    优化
                  </div>
                  <ul class="space-y-1">
                    <li v-for="(improvement, iIdx) in item.improvements" :key="iIdx"
                        class="text-xs text-slate-600 flex items-start gap-2 pl-3">
                      <span class="text-blue-400 mt-0.5">•</span>
                      <span>{{ improvement }}</span>
                    </li>
                  </ul>
                </div>

                <!-- 修复 -->
                <div v-if="item.fixes.length > 0" class="space-y-1.5">
                  <div class="flex items-center gap-1.5 text-[11px] font-bold text-emerald-600 uppercase">
                    <Bug :size="12"/>
                    修复
                  </div>
                  <ul class="space-y-1">
                    <li v-for="(fix, fixIdx) in item.fixes" :key="fixIdx"
                        class="text-xs text-slate-600 flex items-start gap-2 pl-3">
                      <span class="text-emerald-400 mt-0.5">•</span>
                      <span>{{ fix }}</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <!-- 无公告 -->
          <div v-else class="flex flex-col items-center justify-center py-12 text-slate-400">
            <Bell :size="48" class="mb-2 opacity-50"/>
            <p class="text-sm">暂无更新公告</p>
          </div>
        </div>

        <!-- 底部按钮 -->
        <div class="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
          <button @click="$emit('close')"
                  class="px-6 py-2 text-xs font-bold bg-indigo-500 text-white rounded-lg shadow-sm hover:bg-indigo-600 transition-colors">
            我知道了
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.custom-scrollbar {
  scrollbar-width: thin;
  scrollbar-color: rgb(203 213 225) transparent;
}

.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: rgb(203 213 225);
  border-radius: 3px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background-color: rgb(148 163 184);
}
</style>
