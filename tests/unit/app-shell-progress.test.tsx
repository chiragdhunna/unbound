import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import App from '../../src/App'
import * as pipeline from '../../src/core/pipeline'
import { CancelledError } from '../../src/core/errors'
import { type ConvertContext, type ConvertResult } from '../../src/core/types'

describe('AppShell OCR progress UI (M6.5 / Item c)', () => {
  it('displays role="progressbar" with aria-valuenow and page/percent text during OCR conversion', async () => {
    let capturedCtx: ConvertContext | null = null
    let resolveConversion: ((res: ConvertResult) => void) | null = null

    vi.spyOn(pipeline, 'convertFile').mockImplementation(
      (_file: File, ctx: ConvertContext) => {
        capturedCtx = ctx
        return new Promise<ConvertResult>((resolve) => {
          resolveConversion = resolve
        })
      }
    )

    const user = userEvent.setup()
    render(<App />)

    const input = screen.getByLabelText('Choose file')
    const file = new File(['fake bytes'], 'document.pdf', {
      type: 'application/pdf'
    })

    await user.upload(input, file)

    // Initially in converting status, before onProgress
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(screen.getByText('Converting…')).toBeInTheDocument()

    // Trigger onProgress from converter
    act(() => {
      capturedCtx?.onProgress({
        phase: 'ocr',
        current: 2,
        total: 5,
        page: 2,
        totalPages: 5,
        percent: 45
      })
    })

    const progressbar = screen.getByRole('progressbar')
    expect(progressbar).toBeInTheDocument()
    expect(progressbar).toHaveAttribute('aria-valuenow', '45')
    expect(progressbar).toHaveAttribute('aria-valuemin', '0')
    expect(progressbar).toHaveAttribute('aria-valuemax', '100')
    expect(progressbar).toHaveTextContent('Page 2 of 5 — 45%')

    // Resolve conversion
    await act(async () => {
      resolveConversion?.({
        markdown: '# Result\n',
        warnings: [],
        stats: { pages: 5 }
      })
    })

    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('displays progress percent for single-page image conversion', async () => {
    let capturedCtx: ConvertContext | null = null

    vi.spyOn(pipeline, 'convertFile').mockImplementation(
      (_file: File, ctx: ConvertContext) => {
        capturedCtx = ctx
        return new Promise<ConvertResult>(() => {})
      }
    )

    const user = userEvent.setup()
    render(<App />)

    const input = screen.getByLabelText('Choose file')
    const file = new File(['fake bytes'], 'photo.png', {
      type: 'image/png'
    })

    await user.upload(input, file)

    act(() => {
      capturedCtx?.onProgress({
        phase: 'ocr',
        current: 78,
        total: 100,
        page: 1,
        totalPages: 1,
        percent: 78
      })
    })

    const progressbar = screen.getByRole('progressbar')
    expect(progressbar).toBeInTheDocument()
    expect(progressbar).toHaveAttribute('aria-valuenow', '78')
    expect(progressbar).toHaveTextContent('Page 1 of 1 — 78%')
  })

  it('aborts the conversion signal when Cancel button is clicked', async () => {
    let capturedCtx: ConvertContext | null = null

    vi.spyOn(pipeline, 'convertFile').mockImplementation(
      (_file: File, ctx: ConvertContext) => {
        capturedCtx = ctx
        return new Promise<ConvertResult>((_, reject) => {
          ctx.signal.addEventListener('abort', () => {
            reject(new CancelledError('Conversion cancelled by user.'))
          })
        })
      }
    )

    const user = userEvent.setup()
    render(<App />)

    const input = screen.getByLabelText('Choose file')
    const file = new File(['fake bytes'], 'scan.pdf', {
      type: 'application/pdf'
    })

    await user.upload(input, file)

    expect(capturedCtx).not.toBeNull()
    expect(capturedCtx!.signal.aborted).toBe(false)

    const cancelButton = screen.getByRole('button', { name: 'Cancel' })
    await user.click(cancelButton)

    expect(capturedCtx!.signal.aborted).toBe(true)
    expect(
      await screen.findByText('Conversion cancelled by user.')
    ).toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })
})
