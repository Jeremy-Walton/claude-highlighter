export type Role = 'lead' | 'done' | 'check' | 'next' | 'decide' | 'bad' | 'code' | 'muted' | 'chipText'

// The palette read from the operating system's theme (Omarchy), kept in
// session state so every drawn reply redraws when it changes.
export type SystemTheme = {
  name: string
  colors: Partial<Record<Role, string>>
  fg?: string
  bg?: string
}

declare module 'claude-code' {
  interface PluginState {
    highlighter: { system: Shaped<SystemTheme | null> }
  }
}
