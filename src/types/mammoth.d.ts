declare module 'mammoth/mammoth.browser' {
  const mammoth: {
    convertToHtml: (input: { arrayBuffer: ArrayBuffer; styleMap?: string[] }) => Promise<{ value: string; messages: Array<{ type: string; message: string }> }>
    convertToMarkdown: (input: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string; messages: Array<{ type: string; message: string }> }>
  }

  export = mammoth
}
