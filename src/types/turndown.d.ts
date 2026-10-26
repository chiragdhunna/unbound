declare module 'turndown' {
  export interface TurndownRule {
    filter: string | string[] | ((node: HTMLElement, options: Record<string, unknown>) => boolean)
    replacement: (content: string, node: HTMLElement, options: Record<string, unknown>) => string
  }

  export default class TurndownService {
    constructor(options?: Record<string, unknown>)
    use(plugin: unknown): this
    addRule(key: string, rule: TurndownRule): this
    turndown(input: string): string
  }
}

declare module 'turndown-plugin-gfm' {
  export function gfm(service: unknown): void
}
