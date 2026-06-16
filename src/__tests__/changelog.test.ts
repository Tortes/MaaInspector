import { describe, it, expect } from 'vitest'
import { changelogContent } from '@/generated/changelog'
import { parseChangelog } from '@/utils/changelog'

describe('changelog', () => {
  it('should have content', () => {
    expect(changelogContent).toBeDefined()
    expect(changelogContent.length).toBeGreaterThan(0)
  })

  it('parses generated changelog entries', () => {
    const items = parseChangelog(`# MaaInspector 更新日志

## v0.7.0-alpha.3 (2026-06-16)

### 变更
- fix: 修复打包异常 (4846549)
`)

    expect(items).toHaveLength(1)
    expect(items[0].version).toBe('v0.7.0-alpha.3')
    expect(items[0].date).toBe('2026-06-16')
    expect(items[0].improvements).toContain('fix: 修复打包异常 (4846549)')
  })

  it('normalizes version headers without a v prefix', () => {
    const items = parseChangelog(`## 0.1.4 (2026-06-16)

### 新功能
- 支持指定 MaaFramework 版本
`)

    expect(items[0].version).toBe('v0.1.4')
    expect(items[0].features).toEqual(['支持指定 MaaFramework 版本'])
  })
})
