import type { Register, ThemeKey } from 'claude-code'

import { parse } from './blocks'
import type { Block, Item, Kind, Lead, Severity } from './blocks'
import { hasLink, sentences, styled } from './inline'
import type { Mark, Piece, Sentence } from './inline'

const KIND_COLORS: Record<Kind, ThemeKey> = {
  done: 'success',
  check: 'warning',
  next: 'suggestion',
  decide: 'merged',
  plain: 'claude',
}

const MARK_COLORS: Record<Mark, ThemeKey | undefined> = {
  good: 'success',
  bad: 'error',
  hash: 'merged',
  count: undefined,
}

const SEVERITY_COLORS: Record<Severity, ThemeKey> = {
  high: 'error',
  medium: 'warning',
  low: 'inactive',
}

export const register: Register = on => {
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
        {...(p.code ? { color: 'permission' as const, mono: true } : {})}
        {...(p.mark && MARK_COLORS[p.mark] ? { color: MARK_COLORS[p.mark] } : {})}
        {...(p.bold || p.mark === 'count' ? { weight: 'bold' as const } : {})}
        {...(p.italic ? { italic: true } : {})}
      >
        {p.text}
      </Text>
    )

    const sentence = (s: Sentence) => (
      <Text
        {...(s.tone === 'act' ? { color: 'suggestion' as const } : {})}
        {...(s.tone === 'narr' ? { dimColor: true } : {})}
        {...(s.tone === 'headline' ? { weight: 'bold' as const } : {})}
      >
        {s.tone === 'act' ? '➜ ' : ''}
        {s.pieces.map(piece)}
      </Text>
    )

    const lead = (l: Lead) =>
      l.severity ? (
        <Text backgroundColor={SEVERITY_COLORS[l.severity]} color="inverseText" weight="bold">
          {` ${l.label} `}
        </Text>
      ) : (
        <Text color="claude" weight="bold">
          {styled(l.label).map(piece)}
          {l.detail ? <Text dimColor weight="regular"> {l.detail}</Text> : ''}
          {':'}
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
      <Box flexDirection="row" paddingLeft={i.depth * 2}>
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
        const color: ThemeKey = b.kind === 'result' ? 'success' : 'error'

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
        {...(isReport ? { borderStyle: 'round', borderColor: 'subtle', paddingX: 1 } : {})}
      >
        {blocks.map(block)}
      </Box>
    )

    if (!isTerminal) {
      return body
    }

    // The engine draws the reply's bullet and its two-column indent; a tree
    // that replaces the row draws them itself.
    return (
      <Box flexDirection="row">
        <Box flexShrink={0} width={2}>
          <Text>{e.props.isFirstOfReply ? '●' : ''}</Text>
        </Box>
        {body}
      </Box>
    )
  })
}
