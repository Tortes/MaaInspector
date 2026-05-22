import { describe, it, expect } from 'vitest'
import { changelogContent } from '@/changelog'

describe('changelog', () => {
  it('should have content', () => {
    expect(changelogContent).toBeDefined()
    expect(changelogContent.length).toBeGreaterThan(0)
  })

  it('should contain version headers', () => {
    expect(changelogContent).toContain('## 1.2.0')
    expect(changelogContent).toContain('## 1.1.0')
    expect(changelogContent).toContain('## 1.0.0')
  })

  it('should contain section headers', () => {
    expect(changelogContent).toContain('### 新功能')
    expect(changelogContent).toContain('### 优化')
    expect(changelogContent).toContain('### 修复')
  })
})