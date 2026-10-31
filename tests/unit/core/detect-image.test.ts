import { describe, expect, it } from 'vitest'
import {
  detectFileKind,
  detectFileKindWithWarnings
} from '../../../src/core/detect'
import { loadConverter } from '../../../src/core/registry'

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a
])
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
const GIF_BYTES = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
const BMP_BYTES = new Uint8Array([0x42, 0x4d, 0x36, 0x00, 0x00, 0x00])
const WEBP_BYTES = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50
])

describe('image file detection and registry', () => {
  it('detects PNG by magic bytes even with misleading extension', () => {
    const res = detectFileKindWithWarnings({
      name: 'file.txt',
      mime: '',
      bytes: PNG_BYTES.buffer
    })
    expect(res.kind).toBe('image')
  })

  it('detects JPEG by magic bytes', () => {
    expect(
      detectFileKind({
        name: 'photo.jpg',
        mime: 'image/jpeg',
        bytes: JPEG_BYTES.buffer
      })
    ).toBe('image')
  })

  it('detects GIF by magic bytes', () => {
    expect(
      detectFileKind({
        name: 'anim.gif',
        mime: 'image/gif',
        bytes: GIF_BYTES.buffer
      })
    ).toBe('image')
  })

  it('detects BMP by magic bytes', () => {
    expect(
      detectFileKind({
        name: 'bitmap.bmp',
        mime: 'image/bmp',
        bytes: BMP_BYTES.buffer
      })
    ).toBe('image')
  })

  it('detects WebP by RIFF....WEBP magic bytes without mime', () => {
    expect(
      detectFileKind({
        name: 'photo.webp',
        mime: '',
        bytes: WEBP_BYTES.buffer
      })
    ).toBe('image')
  })

  it('loads image converter from registry', async () => {
    const converter = await loadConverter('image')
    expect(converter.kind).toBe('image')
    expect(typeof converter.convert).toBe('function')
  })
})
