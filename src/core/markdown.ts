const zeroWidthChars = /[\u200B-\u200D\uFEFF]/g
const trailingWhitespace = /[ \t]+$/gm

export function normalizeMarkdown(input: string): string {
  const normalizedLineEndings = input.replace(/\r\n?/g, '\n').replace(zeroWidthChars, '')
  const lines = normalizedLineEndings.split('\n')

  let insideFence = false
  let blankCount = 0
  const output: string[] = []

  for (const line of lines) {
    if (/^`{3,}/.test(line)) {
      insideFence = !insideFence
    }

    const nextLine = insideFence ? line : line.replace(trailingWhitespace, '')

    if (!insideFence && nextLine.trim().length === 0) {
      blankCount += 1
      if (blankCount > 2) {
        continue
      }
    } else {
      blankCount = 0
    }

    output.push(nextLine)
  }

  return `${output.join('\n').trimEnd()}\n`
}
