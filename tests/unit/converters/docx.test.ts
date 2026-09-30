import { describe, expect, it } from 'vitest'
import { Packer, Paragraph, Document, HeadingLevel, TextRun, Table, TableRow, TableCell, ImageRun, ExternalHyperlink, FootnoteReferenceRun } from 'docx'
import { docxConverter } from '../../../src/converters/docx'

describe('docxConverter', () => {
  it('extracts headings and content from a generated docx', async () => {
    const doc = new Document({
      sections: [
        {
          properties: {},
          children: [
            new Paragraph({ text: 'Heading 1', heading: HeadingLevel.HEADING_1 }),
            new Paragraph({ children: [new TextRun('First paragraph.')] }),
            new Paragraph({ children: [new TextRun('Second paragraph.')] })
          ]
        }
      ]
    })

    const buffer = await Packer.toBuffer(doc)
    const bytes = new Uint8Array(buffer)
    const result = await docxConverter.convert(
      {
        name: 'sample.docx',
        bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      },
      {
        signal: new AbortController().signal,
        onProgress: () => undefined,
        requestPassword: async () => null,
        options: { ocrLanguage: 'en', forceOcr: false }
      }
    )

    expect(result.markdown).toContain('Heading 1')
    expect(result.markdown).toContain('First paragraph.')
    expect(result.markdown).toContain('Second paragraph.')
  })

  it('preserves structured DOCX content and warns for omitted images', async () => {
    const image = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'))
    const doc = new Document({
      footnotes: { '1': { children: [new Paragraph('Footnote text')] } },
      sections: [{
        properties: {},
        children: [
          new Paragraph({ children: [new TextRun({ text: 'Bold', bold: true }), new TextRun({ text: ' italic', italics: true }), new ExternalHyperlink({ link: 'https://example.com', children: [new TextRun('link')] }), new FootnoteReferenceRun(1)] }),
          new Paragraph({ text: 'Parent', bullet: { level: 0 } }),
          new Paragraph({ text: 'Child', bullet: { level: 1 } }),
          new Table({ rows: [new TableRow({ children: [new TableCell({ children: [new Paragraph('A')] }), new TableCell({ children: [new Paragraph('B')] })] })] }),
          new Paragraph({ children: [new ImageRun({ data: image, transformation: { width: 20, height: 20 }, type: 'png' })] })
        ]
      }]
    })
    const buffer = await Packer.toBuffer(doc)
    const bytes = new Uint8Array(buffer)
    const result = await docxConverter.convert({ name: 'rich.docx', bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }, {
      signal: new AbortController().signal,
      onProgress: () => undefined,
      requestPassword: async () => null,
      options: { ocrLanguage: 'en', forceOcr: false }
    })

    expect(result.markdown).toContain('**Bold**')
    expect(result.markdown).toContain('| A | B |')
    expect(result.markdown).toContain('- Parent')
    expect(result.markdown).toContain('Footnote text')
    expect(result.warnings.find((warning) => warning.code === 'IMAGES_OMITTED')?.message).toContain('1 image')
  })

  it('rejects an OLE2 encrypted Office wrapper', async () => {
    await expect(docxConverter.convert({ name: 'encrypted.docx', bytes: new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]).buffer, mime: '' }, {
      signal: new AbortController().signal,
      onProgress: () => undefined,
      requestPassword: async () => null,
      options: { ocrLanguage: 'en', forceOcr: false }
    })).rejects.toThrow('password protected')
  })
})
