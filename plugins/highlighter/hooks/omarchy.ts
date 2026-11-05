import type { EngineInterface } from 'claude-code'

import type { Role, SystemTheme } from '../types'

const HEX = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i

// Enough TOML for theme files: [sections] and `key = "value"` lines, keyed
// `section.key`. The first value of a key wins, as Omarchy's own reader does.
export function readToml(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  let section = ''

  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue

    const header = /^\[([^\]]+)\]/.exec(line)
    if (header?.[1]) {
      section = header[1].trim()
      continue
    }

    const pair = /^([\w.-]+)\s*=\s*["']?([^"'\s]*)["']?/.exec(line)
    if (!pair?.[1] || pair[2] === undefined) continue

    const key = section ? `${section}.${pair[1]}` : pair[1]
    if (!(key in out)) out[key] = pair[2]
  }

  return out
}

function color(value: string | undefined): string | undefined {
  const hex = value?.replace(/^0x/i, '#')

  return hex && HEX.test(hex) ? hex.toLowerCase() : undefined
}

function compact(colors: Record<Role, string | undefined>): Partial<Record<Role, string>> {
  return Object.fromEntries(Object.entries(colors).filter(([, value]) => value !== undefined))
}

function themeFrom(name: string, colors: Record<Role, string | undefined>, fg?: string, bg?: string): SystemTheme | undefined {
  if (!colors.done && !colors.bad) return undefined

  return { name, colors: compact(colors), ...(fg ? { fg } : {}), ...(bg ? { bg } : {}) }
}

// Omarchy 3's palette file: named colors, orange and muted among them.
export function fromColorsToml(text: string, name: string): SystemTheme | undefined {
  const toml = readToml(text)
  const c = (key: string) => color(toml[key])

  return themeFrom(
    name,
    {
      lead: c('orange') ?? c('bright_yellow') ?? c('yellow'),
      done: c('green'),
      check: c('yellow'),
      next: c('blue') ?? c('accent'),
      decide: c('magenta'),
      bad: c('red'),
      code: c('cyan'),
      muted: c('muted') ?? c('dark_foreground'),
      chipText: c('background'),
    },
    c('foreground'),
    c('background'),
  )
}

// Older Omarchy themes ship only a terminal palette.
export function fromAlacritty(text: string, name: string): SystemTheme | undefined {
  const toml = readToml(text)
  const c = (key: string) => color(toml[`colors.${key}`])

  return themeFrom(
    name,
    {
      lead: c('bright.yellow') ?? c('normal.yellow'),
      done: c('normal.green'),
      check: c('normal.yellow'),
      next: c('normal.blue'),
      decide: c('normal.magenta'),
      bad: c('normal.red'),
      code: c('normal.cyan'),
      muted: c('bright.black'),
      chipText: c('primary.background'),
    },
    c('primary.foreground'),
    c('primary.background'),
  )
}

export function displayName(slug: string): string {
  return slug
    .trim()
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export type Located = { key: string; path: string; base: string; kind: 'colors' | 'alacritty' }

// Omarchy 3 keeps the current theme under ~/.local/state; earlier releases
// linked it from ~/.config. The key changes whenever a theme switch replaces
// the file, so a poll reads the palette only after a switch.
export async function locate($: EngineInterface): Promise<Located | undefined> {
  const home = await $.env.get('HOME')
  if (!home) return undefined

  for (const base of [`${home}/.local/state/omarchy/current`, `${home}/.config/omarchy/current`]) {
    for (const [file, kind] of [['colors.toml', 'colors'], ['alacritty.toml', 'alacritty']] as const) {
      const path = `${base}/theme/${file}`
      if (!(await $.fs.exists(path))) continue

      const { mtimeMs } = await $.fs.stat(path)

      return { key: `${path}:${mtimeMs}`, path, base, kind }
    }
  }

  return undefined
}

export async function load($: EngineInterface, found: Located): Promise<SystemTheme | null> {
  const namePath = `${found.base}/theme.name`
  const name = (await $.fs.exists(namePath)) ? displayName(await $.fs.read(namePath)) : 'Omarchy'
  const text = await $.fs.read(found.path)
  const theme = found.kind === 'colors' ? fromColorsToml(text, name) : fromAlacritty(text, name)

  return theme ?? null
}
