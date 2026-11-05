import type { Color, EngineInterface, Register } from 'claude-code'

import { parse } from './blocks'
import type { Block, Item, Kind, Lead, Severity } from './blocks'
import { hasLink, sentences, styled } from './inline'
import type { Mark, Piece, Sentence } from './inline'
import { PREVIEW_ROLES, THEMES, findTheme, themeOf } from './themes'
import type { Theme } from './themes'

const PANE = 'highlighter-theme'
const COMMAND = 'highlighter-theme'

// The setting's key is `<plugin>.theme`, where an installed plugin's name
// carries its marketplace (`highlighter@claude-highlighter`).
const THEME_KEY = /^highlighter(@[^.]*)?\.theme$/

async function setTheme($: EngineInterface, theme: Theme): Promise<string> {
  const row = (await $.config.list()).find(one => THEME_KEY.test(one.key))
  if (!row) return 'The highlighter has no theme setting here.'

  const result = await $.config.set({ key: row.key, value: theme.id })
  if ('deny' in result && result.deny) return `The theme was not changed: ${result.deny}`

  return `Highlighter theme: ${theme.name}.`
}

export const register: Register = (on, options) => {
  const theme = themeOf(options.theme)
  const c = theme.colors
  const KIND_COLORS: Record<Kind, Color> = {
    done: c.done,
    check: c.check,
    next: c.next,
    decide: c.decide,
    plain: c.lead,
  }
  const MARK_COLORS: Record<Mark, Color | undefined> = {
    good: c.done,
    bad: c.bad,
    hash: c.decide,
    count: undefined,
  }
  const SEVERITY_COLORS: Record<Severity, Color> = {
    high: c.bad,
    medium: c.check,
    low: c.muted,
  }

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: COMMAND,
      description: 'Pick the highlighter color theme',
      argumentHint: `[${THEMES.map(one => one.id).join('|')}]`,
    })

    return next(e)
  })

  // Suggests theme names for the word typed after the command.
  on('prompt.autocomplete', async ($, e, next) => {
    if (!new RegExp(`^\\s*/${COMMAND}\\s+$`).test(e.text.slice(0, e.start))) return next(e)

    const word = e.token.toLowerCase()
    const mine = THEMES.filter(one => one.id.startsWith(word) || one.name.toLowerCase().startsWith(word)).map(one => ({
      text: one.id,
      description: one.id === theme.id ? `${one.name} (current)` : one.name,
    }))

    return { suggestions: [...mine, ...(await next(e)).suggestions] }
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    const wanted = e.args.trim()
    const picked = findTheme(wanted)

    if (picked) return { text: await setTheme($, picked) }
    if (wanted) return { text: `No theme named "${wanted}". Themes: ${THEMES.map(one => one.id).join(', ')}.` }

    await $.ui.open({ id: PANE, title: 'Highlighter theme', focus: true, closeOnEscape: true, rows: THEMES.length + 3 })

    return { text: 'Theme picker opened.' }
  }).catch(() => ({ text: 'The theme command failed. Set the theme in /config instead.' }))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        {THEMES.map((one, index) => {
          const isCurrent = one.id === theme.id

          return (
            <Button
              key={one.id}
              plain
              hotkey={String(index + 1)}
              onPress={async () => {
                // Changing the setting reloads this module, so close first.
                await $.ui.close({ id: PANE })
                $.ui.toast(await setTheme($, one))
              }}
            >
              <Text {...(isCurrent ? { color: one.colors.lead, weight: 'bold' as const } : {})}>
                {isCurrent ? '✓ ' : '  '}
                {one.name.padEnd(15)}
              </Text>
              {one.swatch ? (
                <Text color={one.swatch.fg} backgroundColor={one.swatch.bg}>
                  {' Aa '}
                </Text>
              ) : (
                <Text>{' Aa '}</Text>
              )}
              {' '}
              {PREVIEW_ROLES.map(role => (
                <Text color={one.colors[role]}>{'● '}</Text>
              ))}
              {isCurrent ? <Text dimColor>current</Text> : ''}
            </Button>
          )
        })}
        <Text dimColor>Press 1-9 or click a theme. Esc closes.</Text>
      </Box>
    )
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (e.props.isSummary) {
      return next(e)
    }

    const { blocks, isReport } = parse(e.props.text)
    if (blocks.every(block => block.type === 'raw')) {
      return next(e)
    }

    const { Box, Text, Markdown } = $.ui.resolve(e)
    const isTerminal = e.surface === 'terminal'
    let isFirstProse = true

    const piece = (p: Piece) => (
      <Text
        {...(p.code ? { color: c.code, mono: true } : {})}
        {...(p.mark && MARK_COLORS[p.mark] ? { color: MARK_COLORS[p.mark] } : {})}
        {...(p.bold || p.mark === 'count' ? { weight: 'bold' as const } : {})}
        {...(p.italic ? { italic: true } : {})}
      >
        {p.text}
      </Text>
    )

    const sentence = (s: Sentence) => (
      <Text
        {...(s.tone === 'act' ? { color: c.next } : {})}
        {...(s.tone === 'narr' ? { dimColor: true } : {})}
        {...(s.tone === 'headline' ? { weight: 'bold' as const } : {})}
      >
        {s.tone === 'act' ? '➜ ' : ''}
        {s.pieces.map(piece)}
      </Text>
    )

    const lead = (l: Lead) =>
      l.severity ? (
        <Text backgroundColor={SEVERITY_COLORS[l.severity]} color={c.chipText} weight="bold">
          {` ${l.label} `}
        </Text>
      ) : (
        <Text color={c.lead} weight="bold">
          {styled(l.label).map(piece)}
          {l.detail ? <Text dimColor weight="regular"> {l.detail}</Text> : ''}
          {l.noColon ? '' : ':'}
        </Text>
      )

    // A link must stay clickable, so text that holds one goes to the engine's
    // own Markdown and gives up its inline colors.
    const prose = (text: string, l?: Lead) => {
      const headline = isReport && isFirstProse
      isFirstProse = false

      if (hasLink(text)) {
        return l ? (
          <Box flexDirection="row" gap={1}>
            {lead(l)}
            <Markdown text={text} />
          </Box>
        ) : (
          <Markdown text={text} />
        )
      }

      return (
        <Text>
          {l ? lead(l) : ''}
          {l && text ? ' ' : ''}
          {sentences(text, { headline }).map(sentence)}
        </Text>
      )
    }

    const item = (i: Item) => (
      <Box flexDirection="row" alignItems="flex-start" paddingLeft={i.depth * 2}>
        <Box flexShrink={0} width={i.marker ? i.marker.length + 1 : 0}>
          <Text dimColor>{i.marker === '-' || i.marker === '*' || i.marker === '+' ? (isTerminal ? '-' : '•') : i.marker}</Text>
        </Box>
        <Box flexGrow={1} flexShrink={1}>
          {prose(i.text, i.lead)}
        </Box>
      </Box>
    )

    const block = (b: Block): ReturnType<typeof Box> => {
      if (b.type === 'raw') return <Markdown text={b.text} />
      if (b.type === 'para') return prose(b.text, b.lead)
      if (b.type === 'list') return <Box flexDirection="column">{b.items.map(item)}</Box>

      if (b.type === 'box') {
        const color = b.kind === 'result' ? c.done : c.bad

        return (
          <Box flexDirection="column" borderStyle="round" borderColor={color} paddingX={1}>
            <Text color={color} weight="bold" size="caption">
              {b.kind === 'result' ? 'RESULT' : 'NEEDS YOU'}
            </Text>
            {prose(b.text)}
          </Box>
        )
      }

      const color = KIND_COLORS[b.kind]
      const title = (
        <Text color={color} weight="bold" size="heading">
          {'▍'}
          {b.label}
        </Text>
      )

      return (
        <Box
          flexDirection="column"
          gap={1}
          {...(b.kind === 'next' ? { borderStyle: 'round', borderColor: color, paddingX: 1 } : {})}
        >
          {title}
          {b.blocks.map(block)}
        </Box>
      )
    }

    const body = (
      <Box
        flexDirection="column"
        gap={1}
        flexGrow={1}
        flexShrink={1}
        {...(isReport ? { borderStyle: 'round', borderColor: c.muted, paddingX: 1 } : {})}
      >
        {blocks.map(block)}
      </Box>
    )

    if (!isTerminal) {
      return body
    }

    // The engine draws the reply's bullet, its two-column indent and the blank
    // line above it; a tree that replaces the row draws them itself.
    return (
      <Box flexDirection="row" marginTop={1}>
        <Box flexShrink={0} width={2}>
          <Text>{e.props.isFirstOfReply ? '●' : ''}</Text>
        </Box>
        {body}
      </Box>
    )
  })
}
