import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import App from '../../src/App'
import * as pipeline from '../../src/core/pipeline'

describe('App shell', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })
  it('renders the unbound shell headline', () => {
    render(<App />)

    expect(screen.getByRole('heading', { level: 1, name: 'unbound_' })).toBeInTheDocument()
  })

  it('displays the English-only OCR language notice in the UI', () => {
    render(<App />)

    expect(
      screen.getByText(
        'English-first in v1; other languages are not supported yet.'
      )
    ).toBeInTheDocument()
  })

  it('converts a text file and displays output', async () => {
    const user = userEvent.setup()
    render(<App />)

    const input = screen.getByLabelText('Choose file')
    const file = new File(['hello world'], 'hello.txt', { type: 'text/plain' })

    await user.upload(input, file)

    await waitFor(() => {
      expect(screen.getByRole('textbox')).toHaveValue('hello world\n')
    })
  })

  it('displays EMBEDDED_IMAGES_MAY_CONTAIN_TEXT warning and provides "Run OCR on this PDF" action that re-runs with forceOcr: true', async () => {
    const user = userEvent.setup()
    const convertSpy = vi.spyOn(pipeline, 'convertFile')
    convertSpy
      .mockResolvedValueOnce({
        markdown: 'Selectable text from initial PDF conversion\n',
        warnings: [
          {
            code: 'EMBEDDED_IMAGES_MAY_CONTAIN_TEXT',
            message: 'This PDF contains embedded images that may contain text.',
            severity: 'info'
          }
        ],
        stats: { pages: 1 }
      })
      .mockResolvedValueOnce({
        markdown: 'Full OCR recognized text from forceOcr re-run\n',
        warnings: [],
        stats: { pages: 1, ocrPages: 1 }
      })

    render(<App />)

    const input = screen.getByLabelText('Choose file')
    const file = new File(['%PDF-fake'], 'doc.pdf', { type: 'application/pdf' })

    await user.upload(input, file)

    await waitFor(() => {
      expect(screen.getByRole('textbox')).toHaveValue(
        'Selectable text from initial PDF conversion\n'
      )
    })

    // Warning is displayed in the job card
    expect(
      screen.getByText('This PDF contains embedded images that may contain text.')
    ).toBeInTheDocument()

    // "Run OCR on this PDF" action button is visible
    const runOcrButton = screen.getByRole('button', {
      name: 'Run OCR on this PDF'
    })
    expect(runOcrButton).toBeInTheDocument()

    // Click "Run OCR on this PDF"
    await user.click(runOcrButton)

    // Verify convertFile was called second time with forceOcr: true
    await waitFor(() => {
      expect(convertSpy).toHaveBeenCalledTimes(2)
    })
    const secondCallContext = convertSpy.mock.calls[1]![1]
    expect(secondCallContext.options.forceOcr).toBe(true)

    // Output updates to OCR result
    await waitFor(() => {
      expect(screen.getByRole('textbox')).toHaveValue(
        'Full OCR recognized text from forceOcr re-run\n'
      )
    })
  })

  it('handles folder upload by filtering junk and labeling duplicate basenames with webkitRelativePath', async () => {
    const user = userEvent.setup()
    render(<App />)

    const folderInput = screen.getByLabelText('Choose folder')

    const fileA = new File(['alpha content'], 'doc.txt', { type: 'text/plain' })
    Object.defineProperty(fileA, 'webkitRelativePath', {
      value: 'folderA/doc.txt'
    })

    const fileB = new File(['beta content'], 'doc.txt', { type: 'text/plain' })
    Object.defineProperty(fileB, 'webkitRelativePath', {
      value: 'folderB/doc.txt'
    })

    const junkFile = new File(['junk'], '.DS_Store', { type: 'text/plain' })
    Object.defineProperty(junkFile, 'webkitRelativePath', {
      value: 'folderA/.DS_Store'
    })

    await user.upload(folderInput, [fileA, fileB, junkFile])

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /folderA\/doc\.txt/ })
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /folderB\/doc\.txt/ })
      ).toBeInTheDocument()
    })

    expect(screen.queryByRole('button', { name: /\.DS_Store/ })).not.toBeInTheDocument()
  })

  it('auto-copies markdown and announces "Quick paste copied" toast when quickPaste setting is enabled', async () => {
    const user = userEvent.setup()
    const writeTextMock = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      configurable: true
    })
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true })

    render(<App />)

    // Enable Quick paste toggle
    const quickPasteCheckbox = screen.getByLabelText('Quick paste')
    await user.click(quickPasteCheckbox)

    const input = screen.getByLabelText('Choose file')
    const file = new File(['quick paste content'], 'quick.txt', { type: 'text/plain' })

    await user.upload(input, file)

    await waitFor(() => {
      expect(screen.getByText('Quick paste copied')).toBeInTheDocument()
    })
    expect(writeTextMock).toHaveBeenCalledWith('quick paste content\n')
  })

  it('falls back to "Quick paste ready — tap Copy" toast when clipboard write fails in quickPaste mode', async () => {
    const user = userEvent.setup()
    const writeTextMock = vi.fn().mockRejectedValue(new Error('Permission denied'))
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      configurable: true
    })
    document.execCommand = vi.fn().mockReturnValue(false)
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true })

    render(<App />)

    // Enable Quick paste toggle
    const quickPasteCheckbox = screen.getByLabelText('Quick paste')
    await user.click(quickPasteCheckbox)

    const input = screen.getByLabelText('Choose file')
    const file = new File(['quick paste fallback'], 'quick2.txt', { type: 'text/plain' })

    await user.upload(input, file)

    await waitFor(() => {
      expect(screen.getByText('Quick paste ready — tap Copy')).toBeInTheDocument()
    })
  })
})
