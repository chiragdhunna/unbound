import { describe, expect, it, vi } from 'vitest'
import JSZip from 'jszip'
import pptxgen from 'pptxgenjs'
import { pptxConverter } from '../../../src/converters/pptx'
import { createConvertContext } from '../../../src/core/context'
import {
  CancelledError,
  CorruptFileError,
  LegacyDocError,
  NoTextFoundError,
  PasswordRequiredError,
  TooLargeError
} from '../../../src/core/errors'
import { type ConvertProgress } from '../../../src/core/types'

describe('pptxConverter', () => {
  it('follows presentation sldIdLst order instead of filename', async () => {
    const zip = new JSZip()

    // Presentation XML specifies slideB (rId1) then slideA (rId2)
    zip.file(
      'ppt/presentation.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<p:sldIdLst>' +
        '<p:sldId id="256" r:id="rId1"/>' +
        '<p:sldId id="257" r:id="rId2"/>' +
        '</p:sldIdLst>' +
        '</p:presentation>'
    )

    zip.file(
      'ppt/_rels/presentation.xml.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slideB.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slideA.xml"/>' +
        '</Relationships>'
    )

    // slideB comes first in sldIdLst
    zip.file(
      'ppt/slides/slideB.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
        '<p:cSld><p:spTree>' +
        '<p:sp><p:txBody><a:p><a:r><a:t>Content of Slide B (Presentation First)</a:t></a:r></a:p></p:txBody></p:sp>' +
        '</p:spTree></p:cSld>' +
        '</p:sld>'
    )

    // slideA comes second in sldIdLst (even though alphabetically slideA < slideB)
    zip.file(
      'ppt/slides/slideA.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
        '<p:cSld><p:spTree>' +
        '<p:sp><p:txBody><a:p><a:r><a:t>Content of Slide A (Presentation Second)</a:t></a:r></a:p></p:txBody></p:sp>' +
        '</p:spTree></p:cSld>' +
        '</p:sld>'
    )

    const bytes = await zip.generateAsync({ type: 'arraybuffer' })
    const ctx = createConvertContext()
    const result = await pptxConverter.convert(
      { name: 'reordered.pptx', bytes, mime: '' },
      ctx
    )

    expect(result.markdown).toBe(
      '## Slide 1\n\nContent of Slide B (Presentation First)\n\n## Slide 2\n\nContent of Slide A (Presentation Second)\n'
    )
  })

  it('converts title, body, and nested bullets (levels 0/1/2) into exact golden markdown', async () => {
    const zip = new JSZip()

    zip.file(
      'ppt/presentation.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst>' +
        '</p:presentation>'
    )

    zip.file(
      'ppt/_rels/presentation.xml.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>' +
        '</Relationships>'
    )

    zip.file(
      'ppt/slides/slide1.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
        '<p:cSld><p:spTree>' +
        // Title placeholder
        '<p:sp>' +
        '<p:nvSpPr><p:cNvPr id="2" name="Title"/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>' +
        '<p:txBody><a:p><a:r><a:t>Introduction to Unbound</a:t></a:r></a:p></p:txBody>' +
        '</p:sp>' +
        // Body with nested bullets and plain text
        '<p:sp>' +
        '<p:nvSpPr><p:cNvPr id="3" name="Body"/><p:nvPr/></p:nvSpPr>' +
        '<p:txBody>' +
        '<a:p><a:pPr lvl="0"><a:buChar char="•"/></a:pPr><a:r><a:t>Bullet level 0</a:t></a:r></a:p>' +
        '<a:p><a:pPr lvl="1"><a:buChar char="•"/></a:pPr><a:r><a:t>Bullet level 1</a:t></a:r></a:p>' +
        '<a:p><a:pPr lvl="2"><a:buChar char="•"/></a:pPr><a:r><a:t>Bullet level 2</a:t></a:r></a:p>' +
        '<a:p><a:pPr lvl="0"><a:buNone/></a:pPr><a:r><a:t>Plain body paragraph</a:t></a:r></a:p>' +
        '<a:p><a:pPr lvl="0"><a:buAutoNum type="arabicPeriod"/></a:pPr><a:r><a:t>Numbered step</a:t></a:r></a:p>' +
        '</p:txBody>' +
        '</p:sp>' +
        '</p:spTree></p:cSld>' +
        '</p:sld>'
    )

    const bytes = await zip.generateAsync({ type: 'arraybuffer' })
    const ctx = createConvertContext()
    const result = await pptxConverter.convert(
      { name: 'golden.pptx', bytes, mime: '' },
      ctx
    )

    const expectedMarkdown =
      '## Slide 1\n\n' +
      '### Introduction to Unbound\n\n' +
      '- Bullet level 0\n' +
      '  - Bullet level 1\n' +
      '    - Bullet level 2\n\n' +
      'Plain body paragraph\n\n' +
      '1. Numbered step\n'

    expect(result.markdown).toBe(expectedMarkdown)
  })

  it('converts tables to exact GFM tables including pipe and newline escaping', async () => {
    const zip = new JSZip()

    zip.file(
      'ppt/presentation.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst>' +
        '</p:presentation>'
    )

    zip.file(
      'ppt/_rels/presentation.xml.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>' +
        '</Relationships>'
    )

    zip.file(
      'ppt/slides/slide1.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
        '<p:cSld><p:spTree>' +
        '<p:graphicFrame>' +
        '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table">' +
        '<a:tbl>' +
        '<a:tr>' +
        '<a:tc><a:txBody><a:p><a:r><a:t>Header 1</a:t></a:r></a:p></a:txBody></a:tc>' +
        '<a:tc><a:txBody><a:p><a:r><a:t>Header 2</a:t></a:r></a:p></a:txBody></a:tc>' +
        '</a:tr>' +
        '<a:tr>' +
        '<a:tc><a:txBody><a:p><a:r><a:t>Pipe | value</a:t></a:r></a:p></a:txBody></a:tc>' +
        '<a:tc><a:txBody><a:p><a:r><a:t>Line 1</a:t></a:r><a:br/><a:r><a:t>Line 2</a:t></a:r></a:p></a:txBody></a:tc>' +
        '</a:tr>' +
        '</a:tbl>' +
        '</a:graphicData></a:graphic>' +
        '</p:graphicFrame>' +
        '</p:spTree></p:cSld>' +
        '</p:sld>'
    )

    const bytes = await zip.generateAsync({ type: 'arraybuffer' })
    const ctx = createConvertContext()
    const result = await pptxConverter.convert(
      { name: 'table.pptx', bytes, mime: '' },
      ctx
    )

    const expectedMarkdown =
      '## Slide 1\n\n' +
      '| Header 1 | Header 2 |\n' +
      '| --- | --- |\n' +
      '| Pipe \\| value | Line 1<br>Line 2 |\n'

    expect(result.markdown).toBe(expectedMarkdown)
  })

  it('traverses grouped shapes recursively in document order', async () => {
    const zip = new JSZip()

    zip.file(
      'ppt/presentation.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst>' +
        '</p:presentation>'
    )

    zip.file(
      'ppt/_rels/presentation.xml.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>' +
        '</Relationships>'
    )

    zip.file(
      'ppt/slides/slide1.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
        '<p:cSld><p:spTree>' +
        '<p:grpSp>' +
        '<p:sp><p:txBody><a:p><a:r><a:t>Outer shape</a:t></a:r></a:p></p:txBody></p:sp>' +
        '<p:grpSp>' +
        '<p:sp><p:txBody><a:p><a:r><a:t>Nested shape 1</a:t></a:r></a:p></p:txBody></p:sp>' +
        '<p:sp><p:txBody><a:p><a:r><a:t>Nested shape 2</a:t></a:r></a:p></p:txBody></p:sp>' +
        '</p:grpSp>' +
        '</p:grpSp>' +
        '</p:spTree></p:cSld>' +
        '</p:sld>'
    )

    const bytes = await zip.generateAsync({ type: 'arraybuffer' })
    const ctx = createConvertContext()
    const result = await pptxConverter.convert(
      { name: 'grouped.pptx', bytes, mime: '' },
      ctx
    )

    expect(result.markdown).toContain(
      'Outer shape\n\nNested shape 1\n\nNested shape 2'
    )
  })

  it('emits speaker notes as **Notes:**, skipping slide-number and empty notes', async () => {
    const zip = new JSZip()

    zip.file(
      'ppt/presentation.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<p:sldIdLst>' +
        '<p:sldId id="256" r:id="rId1"/>' +
        '<p:sldId id="257" r:id="rId2"/>' +
        '</p:sldIdLst>' +
        '</p:presentation>'
    )

    zip.file(
      'ppt/_rels/presentation.xml.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/>' +
        '</Relationships>'
    )

    zip.file(
      'ppt/slides/_rels/slide1.xml.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide1.xml"/>' +
        '</Relationships>'
    )

    zip.file(
      'ppt/slides/slide1.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
        '<p:cSld><p:spTree>' +
        '<p:sp><p:txBody><a:p><a:r><a:t>Slide 1 text</a:t></a:r></a:p></p:txBody></p:sp>' +
        '</p:spTree></p:cSld>' +
        '</p:sld>'
    )

    // notesSlide1 has slide image, slide number, and real body note
    zip.file(
      'ppt/notesSlides/notesSlide1.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<p:notes xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
        '<p:cSld><p:spTree>' +
        '<p:sp><p:nvSpPr><p:cNvPr id="2" name=""/><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr></p:sp>' +
        '<p:sp><p:nvSpPr><p:cNvPr id="3" name=""/><p:nvPr><p:ph type="sldNum"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>1</a:t></a:r></a:p></p:txBody></p:sp>' +
        '<p:sp><p:nvSpPr><p:cNvPr id="4" name=""/><p:nvPr><p:ph type="body"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>Key talking point for audience</a:t></a:r></a:p></p:txBody></p:sp>' +
        '</p:spTree></p:cSld>' +
        '</p:notes>'
    )

    // slide2 has rel to notesSlide2 which contains only empty notes
    zip.file(
      'ppt/slides/_rels/slide2.xml.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide2.xml"/>' +
        '</Relationships>'
    )

    zip.file(
      'ppt/slides/slide2.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
        '<p:cSld><p:spTree>' +
        '<p:sp><p:txBody><a:p><a:r><a:t>Slide 2 text</a:t></a:r></a:p></p:txBody></p:sp>' +
        '</p:spTree></p:cSld>' +
        '</p:sld>'
    )

    zip.file(
      'ppt/notesSlides/notesSlide2.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<p:notes xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
        '<p:cSld><p:spTree>' +
        '<p:sp><p:nvSpPr><p:cNvPr id="2" name=""/><p:nvPr><p:ph type="sldNum"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>2</a:t></a:r></a:p></p:txBody></p:sp>' +
        '<p:sp><p:nvSpPr><p:cNvPr id="3" name=""/><p:nvPr><p:ph type="body"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>   </a:t></a:r></a:p></p:txBody></p:sp>' +
        '</p:spTree></p:cSld>' +
        '</p:notes>'
    )

    const bytes = await zip.generateAsync({ type: 'arraybuffer' })
    const ctx = createConvertContext()
    const result = await pptxConverter.convert(
      { name: 'notes.pptx', bytes, mime: '' },
      ctx
    )

    expect(result.markdown).toContain(
      '**Notes:**\n\nKey talking point for audience'
    )
    // Slide 2 has no notes
    const slide2Section = result.markdown.split('## Slide 2')[1]
    expect(slide2Section).not.toContain('**Notes:**')
    expect(result.markdown).not.toContain('\n1\n')
  })

  it('labels hidden slides with (hidden)', async () => {
    const zip = new JSZip()

    zip.file(
      'ppt/presentation.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst>' +
        '</p:presentation>'
    )

    zip.file(
      'ppt/_rels/presentation.xml.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>' +
        '</Relationships>'
    )

    zip.file(
      'ppt/slides/slide1.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" show="0">' +
        '<p:cSld><p:spTree>' +
        '<p:sp><p:txBody><a:p><a:r><a:t>Secret appendix</a:t></a:r></a:p></p:txBody></p:sp>' +
        '</p:spTree></p:cSld>' +
        '</p:sld>'
    )

    const bytes = await zip.generateAsync({ type: 'arraybuffer' })
    const ctx = createConvertContext()
    const result = await pptxConverter.convert(
      { name: 'hidden.pptx', bytes, mime: '' },
      ctx
    )

    expect(result.markdown).toContain('## Slide 1 (hidden)')
    expect(result.markdown).toContain('Secret appendix')
  })

  it('emits exactly one PPTX_NON_TEXT_OMITTED warning with correct counts for images and charts', async () => {
    const zip = new JSZip()

    zip.file(
      'ppt/presentation.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst>' +
        '</p:presentation>'
    )

    zip.file(
      'ppt/_rels/presentation.xml.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>' +
        '</Relationships>'
    )

    zip.file(
      'ppt/slides/slide1.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">' +
        '<p:cSld><p:spTree>' +
        '<p:sp><p:txBody><a:p><a:r><a:t>Slide with objects</a:t></a:r></a:p></p:txBody></p:sp>' +
        '<p:pic><p:blipFill><a:blip/></p:blipFill></p:pic>' +
        '<p:pic><p:blipFill><a:blip/></p:blipFill></p:pic>' +
        '<p:graphicFrame><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart/></a:graphicData></a:graphic></p:graphicFrame>' +
        '<mc:AlternateContent><mc:Choice/></mc:AlternateContent>' +
        '<p:oleObj spid="1"/>' +
        '</p:spTree></p:cSld>' +
        '</p:sld>'
    )

    const bytes = await zip.generateAsync({ type: 'arraybuffer' })
    const ctx = createConvertContext()
    const result = await pptxConverter.convert(
      { name: 'objects.pptx', bytes, mime: '' },
      ctx
    )

    const omittedWarnings = result.warnings.filter(
      (w) => w.code === 'PPTX_NON_TEXT_OMITTED'
    )
    expect(omittedWarnings).toHaveLength(1)
    expect(omittedWarnings[0]?.message).toBe(
      '2 images, 3 charts/diagrams were omitted'
    )
    expect(omittedWarnings[0]?.severity).toBe('info')
  })

  it('throws NoTextFoundError when deck has no text anywhere', async () => {
    const zip = new JSZip()

    zip.file(
      'ppt/presentation.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst>' +
        '</p:presentation>'
    )

    zip.file(
      'ppt/_rels/presentation.xml.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>' +
        '</Relationships>'
    )

    zip.file(
      'ppt/slides/slide1.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
        '<p:cSld><p:spTree>' +
        '<p:sp><p:txBody><a:p><a:r><a:t>   </a:t></a:r></a:p></p:txBody></p:sp>' +
        '</p:spTree></p:cSld>' +
        '</p:sld>'
    )

    const bytes = await zip.generateAsync({ type: 'arraybuffer' })
    const ctx = createConvertContext()
    await expect(
      pptxConverter.convert({ name: 'empty.pptx', bytes, mime: '' }, ctx)
    ).rejects.toBeInstanceOf(NoTextFoundError)
  })

  it('throws CorruptFileError for corrupted zip bytes', async () => {
    const corruptBytes = new Uint8Array([
      0x50, 0x4b, 0x03, 0x04, 0x01, 0x02, 0x03
    ]).buffer
    const ctx = createConvertContext()
    await expect(
      pptxConverter.convert(
        { name: 'corrupted.pptx', bytes: corruptBytes, mime: '' },
        ctx
      )
    ).rejects.toBeInstanceOf(CorruptFileError)
  })

  it('throws PasswordRequiredError for encrypted OLE2 PPTX files', async () => {
    const ole2Bytes = new Uint8Array([
      0xd0, 0xcf, 0x11, 0xe0, 0xaa, 0xbb, 0xcc, 0xdd
    ]).buffer
    const ctx = createConvertContext()
    await expect(
      pptxConverter.convert(
        { name: 'locked.pptx', bytes: ole2Bytes, mime: '' },
        ctx
      )
    ).rejects.toThrow(PasswordRequiredError)
  })

  it('throws LegacyDocError for legacy .ppt files', async () => {
    const ole2Bytes = new Uint8Array([
      0xd0, 0xcf, 0x11, 0xe0, 0x00, 0x11, 0x22, 0x33
    ]).buffer
    const ctx = createConvertContext()
    await expect(
      pptxConverter.convert(
        { name: 'old.ppt', bytes: ole2Bytes, mime: '' },
        ctx
      )
    ).rejects.toThrow(LegacyDocError)
  })

  it('handles cancellation mid-conversion and fires onProgress callbacks', async () => {
    const zip = new JSZip()

    zip.file(
      'ppt/presentation.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<p:sldIdLst>' +
        '<p:sldId id="256" r:id="rId1"/>' +
        '<p:sldId id="257" r:id="rId2"/>' +
        '</p:sldIdLst>' +
        '</p:presentation>'
    )

    zip.file(
      'ppt/_rels/presentation.xml.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/>' +
        '</Relationships>'
    )

    zip.file(
      'ppt/slides/slide1.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
        '<p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Page 1 text</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld>' +
        '</p:sld>'
    )

    zip.file(
      'ppt/slides/slide2.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
        '<p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Page 2 text</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld>' +
        '</p:sld>'
    )

    const bytes = await zip.generateAsync({ type: 'arraybuffer' })

    const abortController = new AbortController()
    const progressCalls: ConvertProgress[] = []
    const ctx = {
      ...createConvertContext(),
      signal: abortController.signal,
      onProgress: (p: ConvertProgress) => {
        progressCalls.push(p)
        if (p.current === 1) {
          abortController.abort()
        }
      }
    }

    await expect(
      pptxConverter.convert({ name: 'cancelled.pptx', bytes, mime: '' }, ctx)
    ).rejects.toBeInstanceOf(CancelledError)

    expect(progressCalls.length).toBeGreaterThanOrEqual(1)
    expect(progressCalls[0]).toEqual({
      phase: 'pptx',
      current: 1,
      total: 2
    })
  })

  it('triggers zip-bomb guard when declared uncompressed part size exceeds limit', async () => {
    const zip = new JSZip()
    zip.file('ppt/presentation.xml', '<presentation/>')
    zip.file('ppt/huge.xml', 'x')

    const fileObj = zip.file('ppt/huge.xml') as unknown as {
      _data: { uncompressedSize: number }
    }
    fileObj._data.uncompressedSize = 25 * 1024 * 1024 // 25 MB > 20 MB limit

    const bytes = await zip.generateAsync({ type: 'arraybuffer' })
    const ctx = createConvertContext()

    // Note: since generateAsync resets _data, let's mock or pass a buffer that JSZip parses
    // Alternatively, spy on JSZip.loadAsync or construct zip with oversized entry
    const loadedZip = await JSZip.loadAsync(bytes)
    const hugeEntry = loadedZip.file('ppt/huge.xml') as unknown as {
      _data: { uncompressedSize: number }
    }
    hugeEntry._data = { uncompressedSize: 25 * 1024 * 1024 }

    vi.spyOn(JSZip, 'loadAsync').mockResolvedValueOnce(loadedZip)

    await expect(
      pptxConverter.convert({ name: 'bomb.pptx', bytes, mime: '' }, ctx)
    ).rejects.toBeInstanceOf(TooLargeError)

    vi.restoreAllMocks()
  })

  it('ignores external relationships without making network requests', async () => {
    const zip = new JSZip()

    zip.file(
      'ppt/presentation.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst>' +
        '</p:presentation>'
    )

    zip.file(
      'ppt/_rels/presentation.xml.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://evil.example.com" TargetMode="External"/>' +
        '</Relationships>'
    )

    zip.file(
      'ppt/slides/slide1.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
        '<p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Safe local content</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld>' +
        '</p:sld>'
    )

    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    const bytes = await zip.generateAsync({ type: 'arraybuffer' })
    const ctx = createConvertContext()
    const result = await pptxConverter.convert(
      { name: 'external.pptx', bytes, mime: '' },
      ctx
    )

    expect(result.markdown).toContain('Safe local content')
    expect(result.markdown).not.toContain('evil.example.com')
    expect(fetchSpy).not.toHaveBeenCalled()

    fetchSpy.mockRestore()
  })

  it('converts a ~100-slide deck in under 5 seconds', async () => {
    const pptx = new pptxgen()

    for (let i = 1; i <= 100; i++) {
      const slide = pptx.addSlide()
      slide.addText(`Slide Title ${i}`, { placeholder: 'title' })
      slide.addText(`Slide body content for slide number ${i} with text.`, {
        x: 1,
        y: 2
      })
      if (i % 10 === 0) {
        slide.addNotes(`Speaker note for slide ${i}`)
      }
    }

    const buf = await pptx.write({ outputType: 'arraybuffer' })
    const ctx = createConvertContext()

    const startTime = performance.now()
    const result = await pptxConverter.convert(
      { name: 'perf-100-slides.pptx', bytes: buf as ArrayBuffer, mime: '' },
      ctx
    )
    const elapsedMs = performance.now() - startTime

    expect(result.stats.slides).toBe(100)
    expect(result.markdown).toContain('Slide Title 1')
    expect(result.markdown).toContain('Slide Title 100')
    expect(elapsedMs).toBeLessThan(5000)
  })
})
