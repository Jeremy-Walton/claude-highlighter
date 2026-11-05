import type { Color } from 'claude-code'

import type { Role, SystemTheme } from '../types'

export type { Role }

export type Theme = {
  id: string
  name: string
  // The swatch behind "Aa" in the picker; the terminal theme has none, since
  // it follows whatever the person's terminal paints.
  swatch?: { fg: Color; bg: Color }
  colors: Record<Role, Color>
}

export type Choice = { id: string; name: string }

const hex = (
  name: string,
  id: string,
  fg: string,
  bg: string,
  muted: string,
  [lead, done, check, next, decide, bad, code]: [string, string, string, string, string, string, string],
): Theme => ({
  id,
  name,
  swatch: { fg, bg },
  colors: { lead, done, check, next, decide, bad, code, muted, chipText: bg },
})

export const TERMINAL: Theme = {
  id: 'terminal',
  name: 'Terminal',
  colors: {
    lead: 'claude',
    done: 'success',
    check: 'warning',
    next: 'suggestion',
    decide: 'merged',
    bad: 'error',
    code: 'permission',
    muted: 'subtle',
    chipText: 'inverseText',
  },
}

export const THEMES: readonly Theme[] = [
  TERMINAL,
  hex('Cobalt2', 'cobalt2', '#ffffff', '#193549', '#5d7a94', ['#ff9d00', '#3ad900', '#ffc600', '#9effff', '#fb94ff', '#ff628c', '#ffee80']),
  hex('Dracula', 'dracula', '#f8f8f2', '#282a36', '#6272a4', ['#ffb86c', '#50fa7b', '#f1fa8c', '#8be9fd', '#bd93f9', '#ff5555', '#ff79c6']),
  hex('Nord', 'nord', '#d8dee9', '#2e3440', '#616e88', ['#d08770', '#a3be8c', '#ebcb8b', '#88c0d0', '#b48ead', '#bf616a', '#81a1c1']),
  hex('Solarized Dark', 'solarized-dark', '#839496', '#002b36', '#586e75', ['#cb4b16', '#859900', '#b58900', '#268bd2', '#6c71c4', '#dc322f', '#2aa198']),
  hex('Gruvbox Dark', 'gruvbox-dark', '#ebdbb2', '#282828', '#928374', ['#fe8019', '#b8bb26', '#fabd2f', '#83a598', '#d3869b', '#fb4934', '#8ec07c']),
  hex('Tokyo Night', 'tokyo-night', '#c0caf5', '#1a1b26', '#565f89', ['#ff9e64', '#9ece6a', '#e0af68', '#7aa2f7', '#bb9af7', '#f7768e', '#7dcfff']),
  hex('Lumon', 'lumon', '#d4e4f0', '#0f1c2b', '#5f7a92', ['#9cc4e4', '#d6eefa', '#ffffff', '#7fb2dc', '#a8c4da', '#f0f6fa', '#b9d9ec']),
  hex('GitHub Light', 'github-light', '#1f2328', '#ffffff', '#8c959f', ['#bc4c00', '#1a7f37', '#9a6700', '#0969da', '#8250df', '#cf222e', '#0550ae']),
]

export const SYSTEM: Choice = { id: 'system', name: 'System' }

export const CHOICES: readonly Choice[] = [SYSTEM, ...THEMES]

export const PREVIEW_ROLES: readonly Role[] = ['lead', 'done', 'check', 'next', 'decide', 'bad', 'code']

const slug = (text: string) => text.trim().toLowerCase().replace(/\s+/g, '-')

// A fixed theme for the setting's value, or undefined for System, which
// resolves while the session runs.
export function fixedTheme(value: unknown): Theme | undefined {
  const wanted = slug(String(value ?? SYSTEM.id))
  if (wanted === SYSTEM.id) return undefined

  return THEMES.find(theme => theme.id === wanted)
}

export function findChoice(text: string): Choice | undefined {
  const wanted = slug(text)
  if (!wanted) return undefined

  return CHOICES.find(choice => choice.id === wanted) ?? CHOICES.find(choice => choice.id.startsWith(wanted))
}

// Not on Omarchy, System is the Terminal theme. A palette that leaves out a
// color falls back to the terminal's own for it.
export function systemTheme(system: SystemTheme | null): Theme {
  if (!system) return { ...TERMINAL, id: SYSTEM.id, name: 'System: Terminal' }

  return {
    id: SYSTEM.id,
    name: `System: Omarchy ${system.name}`,
    ...(system.fg && system.bg ? { swatch: { fg: system.fg, bg: system.bg } } : {}),
    colors: { ...TERMINAL.colors, ...system.colors },
  }
}
