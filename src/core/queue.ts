export type QueueStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled'

export interface QueueJob<T> {
  id: string
  status: QueueStatus
  value?: T
  error?: unknown
}

export class ConversionQueue<T> {
  private readonly jobs = new Map<string, QueueJob<T>>()
  private readonly pending: Array<{ id: string; task: (signal: AbortSignal) => Promise<T> }> = []
  private active = 0
  private sequence = 0

  constructor(private readonly concurrency = 2, private readonly onChange: (job: QueueJob<T>) => void = () => undefined) {}

  enqueue(task: (signal: AbortSignal) => Promise<T>): string {
    const id = `job-${++this.sequence}`
    const job = { id, status: 'queued' as QueueStatus }
    this.jobs.set(id, job)
    this.pending.push({ id, task })
    this.onChange(job)
    void this.drain()
    return id
  }

  cancel(id: string): boolean {
    const job = this.jobs.get(id)
    if (!job || job.status === 'done' || job.status === 'failed' || job.status === 'cancelled') return false
    job.status = 'cancelled'
    this.onChange(job)
    return true
  }

  get(id: string): QueueJob<T> | undefined {
    return this.jobs.get(id)
  }

  private async drain(): Promise<void> {
    while (this.active < this.concurrency && this.pending.length) {
      const next = this.pending.shift()
      if (!next) return
      const job = this.jobs.get(next.id)
      if (!job || job.status === 'cancelled') continue
      this.active += 1
      job.status = 'running'
      this.onChange(job)
      const controller = new AbortController()
      try {
        job.value = await next.task(controller.signal)
        job.status = 'done'
      } catch (error) {
        job.error = error
        job.status = 'failed'
      } finally {
        this.active -= 1
        this.onChange(job)
        void this.drain()
      }
    }
  }
}
