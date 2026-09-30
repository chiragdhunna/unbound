import { describe, expect, it, vi } from 'vitest'
import { ConversionQueue } from '../../../src/core/queue'

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

describe('ConversionQueue', () => {
  it('limits concurrency and isolates failures', async () => {
    let active = 0
    let peak = 0
    const changes: string[] = []
    const queue = new ConversionQueue<string>(2, (job) => changes.push(`${job.id}:${job.status}`))
    const ids = [1, 2, 3].map((value) => queue.enqueue(async () => {
      active += 1
      peak = Math.max(peak, active)
      await wait(5)
      active -= 1
      if (value === 2) throw new Error('failed')
      return `${value}`
    }))
    await wait(40)
    expect(peak).toBe(2)
    expect(queue.get(ids[0] ?? '')?.status).toBe('done')
    expect(queue.get(ids[1] ?? '')?.status).toBe('failed')
    expect(queue.get(ids[2] ?? '')?.status).toBe('done')
    expect(changes.some((entry) => entry.endsWith(':failed'))).toBe(true)
  })

  it('cancels queued jobs before execution', async () => {
    const queue = new ConversionQueue<string>(1)
    const first = queue.enqueue(async () => {
      await wait(20)
      return 'first'
    })
    const second = queue.enqueue(vi.fn(async () => 'second'))
    expect(queue.cancel(second)).toBe(true)
    await wait(35)
    expect(queue.get(first)?.status).toBe('done')
    expect(queue.get(second)?.status).toBe('cancelled')
  })
})
