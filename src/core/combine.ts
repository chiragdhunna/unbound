export interface CombineInput {
  name: string
  markdown: string
}

export function combineMarkdown(files: CombineInput[]): string {
  return files.map((file) => `# File: ${file.name}\n\n${file.markdown.trim()}`).join('\n\n').trim() + (files.length ? '\n' : '')
}
