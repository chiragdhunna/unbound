import { describe, expect, it, vi } from 'vitest'
import { parseRtfToMarkdown, rtfConverter } from '../../../src/converters/rtf'
import { CorruptFileError, NoTextFoundError } from '../../../src/core/errors'
import { createConvertContext } from '../../../src/core/context'

describe('rtfConverter', () => {
  it('converts a basic RTF document with bold, italic, and paragraphs', () => {
    const rtf =
      '{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Arial;}}\\f0\\fs24 Hello \\b bold world\\b0!\\par This is \\i italic text\\i0.\\par Final paragraph.}'
    const result = parseRtfToMarkdown(rtf)
    expect(result).toContain('Hello **bold world**!')
    expect(result).toContain('This is _italic text_.')
    expect(result).toContain('Final paragraph.')
  })

  it('handles Unicode escapes with replacement character skipping', () => {
    const rtf =
      '{\\rtf1\\ansi\\deff0\\fs24 Em dash: \\u8212? and Euro: \\u8364? and check: \\u10003? done.}'
    const result = parseRtfToMarkdown(rtf)
    expect(result).toContain('Em dash: — and Euro: € and check: ✓ done.')
  })

  it('handles negative 16-bit signed Unicode escapes', () => {
    // 0x2713 = 10003; in signed 16-bit representation: 10003 - 65536 = -55533
    const rtf = '{\\rtf1\\ansi\\deff0\\fs24 Checkmark: \\u-55533? mark.}'
    const result = parseRtfToMarkdown(rtf)
    expect(result).toContain('Checkmark: ✓ mark.')
  })

  it('handles hex byte escapes with Windows-1252 decoding', () => {
    const rtf =
      "{\\rtf1\\ansi\\deff0\\fs24 Smart \\'93quotes\\'94 and em\\'97dash and ellipsis\\'85 and bullet\\'95done.}"
    const result = parseRtfToMarkdown(rtf)
    expect(result).toContain('Smart “quotes” and em—dash and ellipsis… and bullet•done.')
  })

  it('skips header and metadata destinations completely', () => {
    const rtf =
      '{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Arial;}{\\f1 Courier;}}{\\colortbl;\\red255\\green0\\blue0;}{\\stylesheet{\\s0 Normal;}}{\\info{\\author John Doe}{\\title Test Title}}{\\*\\generator UnboundTest;}Visible body text.}'
    const result = parseRtfToMarkdown(rtf)
    expect(result).toBe('Visible body text.\n')
    expect(result).not.toContain('Arial')
    expect(result).not.toContain('Courier')
    expect(result).not.toContain('John Doe')
    expect(result).not.toContain('Test Title')
    expect(result).not.toContain('UnboundTest')
  })

  it('skips embedded pictures and drawings', () => {
    const rtf =
      '{\\rtf1\\ansi\\deff0 Text before pict.{\\pict\\wmetafile8\\picw100\\pich100 010203040506070809}Text after pict.}'
    const result = parseRtfToMarkdown(rtf)
    expect(result).toContain('Text before pict.')
    expect(result).toContain('Text after pict.')
    expect(result).not.toContain('0102030405')
  })

  it('preserves group-scoped formatting and pops cleanly', () => {
    const rtf =
      '{\\rtf1\\ansi\\deff0 Outer start {\\b bold inner {\\i bold and italic} bold again} outer end.}'
    const result = parseRtfToMarkdown(rtf)
    expect(result).toContain('Outer start')
    expect(result).toContain('**bold inner')
    expect(result).toContain('_bold and italic_')
    expect(result).toContain('bold again**')
    expect(result).toContain('outer end.')
  })

  it('handles bullet control words and list items', () => {
    const rtf =
      '{\\rtf1\\ansi\\deff0 Item list:\\par\\bullet First item\\par\\bullet Second item\\par\\bullet Third item}'
    const result = parseRtfToMarkdown(rtf)
    expect(result).toContain('Item list:')
    expect(result).toContain('- First item')
    expect(result).toContain('- Second item')
    expect(result).toContain('- Third item')
  })

  it('handles tabs and line breaks', () => {
    const rtf = '{\\rtf1\\ansi\\deff0 Line one\\line Line two with\\tab tab.}'
    const result = parseRtfToMarkdown(rtf)
    expect(result).toContain('Line one\nLine two with\ttab.')
  })

  it('handles non-breaking spaces, hyphens, and section breaks', () => {
    const rtf = '{\\rtf1\\ansi\\deff0 First\\~word\\_hyphen\\sect Second section.}'
    const result = parseRtfToMarkdown(rtf)
    expect(result).toContain('First word-hyphen')
    expect(result).toContain('Second section.')
  })

  it('handles custom uc skip counts and hex replacement chars', () => {
    const rtf = "{\\rtf1\\ansi\\deff0\\uc2\\u8212\\'3f\\'3f emdash\\uc1\\u8212\\'3f emdash2}"
    const result = parseRtfToMarkdown(rtf)
    expect(result).toContain('— emdash— emdash2')
  })

  it('handles unclosed bold and italic tags at end of file', () => {
    const rtf = '{\\rtf1\\ansi\\deff0 Unclosed \\b bold and \\i italic'
    const result = parseRtfToMarkdown(rtf)
    expect(result).toContain('Unclosed **bold and _italic_**')
  })

  it('handles unrecognized control symbols and invalid unicode points safely', () => {
    const rtf = '{\\rtf1\\ansi\\deff0 Symbol \\+ text \\u1114112? ok.}'
    const result = parseRtfToMarkdown(rtf)
    expect(result).toContain('Symbol text ok.')
  })

  it('reports progress on larger documents', () => {
    const progressSpy = vi.fn()
    const padding = 'Word '.repeat(1500)
    const rtf = `{\\rtf1\\ansi\\deff0 ${padding}}`
    const result = parseRtfToMarkdown(rtf, undefined, progressSpy)
    expect(result).toContain('Word')
    expect(progressSpy).toHaveBeenCalled()
  })

  it('handles escaped braces and backslashes', () => {
    const rtf = '{\\rtf1\\ansi\\deff0 Escaped \\{left brace\\} and \\\\backslash.}'
    const result = parseRtfToMarkdown(rtf)
    expect(result).toContain('Escaped {left brace} and \\backslash.')
  })

  it('throws CorruptFileError if input is not valid RTF', () => {
    expect(() => parseRtfToMarkdown('This is just plain text without RTF header.')).toThrow(
      CorruptFileError
    )
  })

  it('throws NoTextFoundError if RTF contains no body text', () => {
    const emptyRtf = '{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Arial;}}{\\colortbl;\\red0\\green0\\blue0;}}'
    expect(() => parseRtfToMarkdown(emptyRtf)).toThrow(NoTextFoundError)
  })

  it('aborts when signal is aborted', () => {
    const controller = new AbortController()
    controller.abort()
    const rtf = '{\\rtf1\\ansi\\deff0 Text content}'
    expect(() => parseRtfToMarkdown(rtf, controller.signal)).toThrow('The operation was aborted.')
  })

  it('converts through converter interface and reports progress', async () => {
    const onProgress = vi.fn()
    const ctx = {
      ...createConvertContext(),
      onProgress
    }
    const rtfBytes = new TextEncoder().encode(
      '{\\rtf1\\ansi\\deff0\\fs24 Converted via converter interface.}'
    ).buffer
    const result = await rtfConverter.convert(
      {
        name: 'sample.rtf',
        bytes: rtfBytes,
        mime: 'application/rtf'
      },
      ctx
    )
    expect(result.markdown).toBe('Converted via converter interface.\n')
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ phase: 'complete', percent: 100 }))
  })
})
