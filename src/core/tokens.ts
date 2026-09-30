export interface TextCounts {
  chars: number
  words: number
  tokens: number
}

function isCjk(character: string): boolean {
  const code = character.codePointAt(0) ?? 0
  return (code >= 0x3040 && code <= 0x30ff) || (code >= 0x3400 && code <= 0x9fff) || (code >= 0xac00 && code <= 0xd7af)
}

export function estimateTokens(input: string): number {
  if (!input) return 0
  let cjk = 0
  for (const character of input) {
    if (isCjk(character)) cjk += 1
  }
  const cjkRatio = cjk / Math.max(1, input.length)
  const divisor = cjkRatio > 0.25 ? 1.2 : /```|[{};]|\b(const|function|import|class)\b/.test(input) ? 3.2 : 4
  return Math.max(1, Math.ceil(input.length / divisor))
}

export function countText(input: string): TextCounts {
  const trimmed = input.trim()
  return {
    chars: input.length,
    words: trimmed ? trimmed.split(/\s+/).length : 0,
    tokens: estimateTokens(input)
  }
}
