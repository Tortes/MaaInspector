export interface AnnouncementItem {
  version: string
  date: string
  features: string[]
  improvements: string[]
  fixes: string[]
}

type AnnouncementSection = 'features' | 'improvements' | 'fixes'

const splitListItems = (text: string): string[] => {
  return text
    .split(/\s+-\s+/)
    .map(item => item.trim())
    .filter(Boolean)
}

const resolveSection = (section: string): AnnouncementSection | null => {
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

export const parseChangelog = (content: string): AnnouncementItem[] => {
  const items: AnnouncementItem[] = []
  const lines = content.split(/\r?\n/)

  let currentItem: AnnouncementItem | null = null
  let currentSection: AnnouncementSection | null = null

  const pushCurrentItem = () => {
    if (currentItem) {
      items.push(currentItem)
    }
  }

  for (const line of lines) {
    const versionMatch = line.match(/^##\s+(v?\d+\.\d+\.\d+(?:[-+][\w.-]+)?|Unreleased)(?:\s*\(([^)]+)\))?(?:\s*-\s*(.+))?/i)
    if (versionMatch) {
      pushCurrentItem()
      const rawVersion = versionMatch[1]
      const normalizedVersion = rawVersion.toLowerCase() === 'unreleased'
        ? 'Unreleased'
        : rawVersion.startsWith('v') ? rawVersion : `v${rawVersion}`
      currentItem = {
        version: normalizedVersion,
        date: (versionMatch[2] || versionMatch[3] || '未知日期').trim(),
        features: [],
        improvements: [],
        fixes: []
      }
      currentSection = null
      continue
    }

    if (line.startsWith('###')) {
      const sectionLine = line.replace(/^###\s*/, '').trim()
      const inlineMatch = sectionLine.match(/^(.*?)(?:\s*[-*]\s+(.+))$/)
      const sectionTitle = (inlineMatch ? inlineMatch[1] : sectionLine).trim()
      currentSection = resolveSection(sectionTitle)
      const inlineItem = inlineMatch ? inlineMatch[2].trim() : ''
      if (inlineItem && currentSection && currentItem) {
        splitListItems(inlineItem).forEach(item => currentItem?.[currentSection as AnnouncementSection].push(item))
      }
      continue
    }

    const listMatch = line.match(/^[-*]\s*(.+)/)
    if (listMatch && currentItem) {
      const text = listMatch[1].trim()
      if (text) {
        const section = currentSection ?? 'improvements'
        splitListItems(text).forEach(item => currentItem?.[section].push(item))
      }
    }
  }

  pushCurrentItem()
  return items
}
