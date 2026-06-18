import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import ClearCanvasConfirmModal from '@/components/Flow/Modals/ClearCanvasConfirmModal.vue'

const findBodyButton = (text: string): HTMLButtonElement => {
  const button = Array.from(document.body.querySelectorAll('button'))
    .find(element => element.textContent?.includes(text))
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Button with text "${text}" not found`)
  }
  return button
}

describe('ClearCanvasConfirmModal', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('requires two confirm clicks before emitting confirm', async () => {
    const wrapper = mount(ClearCanvasConfirmModal, {
      props: {
        visible: true,
        nodeCount: 2,
        edgeCount: 1
      },
      attachTo: document.body
    })

    expect(document.body.textContent).toContain('2')
    expect(document.body.textContent).toContain('清除画布')

    await findBodyButton('清除画布').click()
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('confirm')).toBeUndefined()
    expect(document.body.textContent).toContain('最终确认清除')

    await findBodyButton('最终确认清除').click()
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('confirm')).toHaveLength(1)
    wrapper.unmount()
  })

  it('resets the final confirmation step when canceled', async () => {
    const wrapper = mount(ClearCanvasConfirmModal, {
      props: { visible: true },
      attachTo: document.body
    })

    await findBodyButton('清除画布').click()
    await wrapper.vm.$nextTick()
    expect(document.body.textContent).toContain('最终确认清除')

    await findBodyButton('取消').click()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('cancel')).toHaveLength(1)

    await wrapper.setProps({ visible: false })
    await wrapper.setProps({ visible: true })

    expect(document.body.textContent).toContain('第一次确认后')
    wrapper.unmount()
  })
})
