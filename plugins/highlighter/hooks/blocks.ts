export type Kind = 'done' | 'check' | 'next' | 'decide' | 'plain'
export type Severity = 'high' | 'medium' | 'low'

export type Lead = { label: string; detail: string; severity?: Severity }

export type Item = { depth: number; marker: string; text: string; lead?: Lead }

export type Block =
  | { type: 'para'; text: string; lead?: Lead }
  | { type: 'list'; items: Item[] }
  | { type: 'raw'; text: string }
  | { type: 'box'; kind: 'result' | 'needs'; text: string }
  | { type: 'section'; kind: Kind; label: string; blocks: Block[] }

export type Parsed = { blocks: Block[]; isReport: boolean }

const KEYWORDS: [Kind, RegExp][] = [
  ['next', /^(next( steps?)?|what (you|to) do( now| next)?|now what|your turn|to ?do|action items?|try it|\w+ things? (is|are) left for you)$/i],
  ['decide', /^(decide|decisions?|options?|choose|pick one|your call|questions?)$/i],
  ['check', /^(look here|look at|heads up|watch out|warnings?|risks?|caveats?|notes?|not done|not verified|open issues|issues|problems|concerns|gotchas?|blocked|smaller .+ notes)$/i],
  ['done', /^(done|did|fixed|changed|changes|what i did|what changed|summary|results?|completed|shipped|checks i ran|verified|what already .+)$/i],
]

export function kindOf(label: string): Kind | undefined {
  const words = unbold(label).replace(/[:.]+$/, '').trim()

  return KEYWORDS.find(([, pattern]) => pattern.test(words))?.[0]
}

function unbold(text: string): string {
  return text.replace(/^\*\*(.*)\*\*:?$/, '$1').replace(/^\*\*(.*):\*\*$/, '$1')
}

// A lead-in names a thing. A clause with a verb before the colon is a sentence.
const LEAD_SENTENCE = /^The |\b(is|are|was|were|became|failed|saved|has|have|had)\b/i
const SEVERITY = /^\**(High|Medium|Low)\**:\**\s+(.*)$/
const BOLD_LEAD = /^\*\*([^*]{1,60}?)\*\*\s*(\([^)]*\))?\s*(:?)\s*(.*)$/
const PLAIN_LEAD = /^([^:*]{1,60}?)\s*(\([^)]*\))?:\s(?!:)\s*(.*)$/
const NAME_HASH = /^([a-z][\w-]+) (\([0-9a-f]{7,}\))$/
const BOX = /^\**(result|needs input)\**:\**\s+(.*)$/i

export function leadOf(text: string): { lead: Lead; rest: string } | undefined {
  const severity = SEVERITY.exec(text)
  if (severity?.[1] && severity[2] !== undefined) {
    return {
      lead: { label: severity[1], detail: '', severity: severity[1].toLowerCase() as Severity },
      rest: severity[2],
    }
  }

  const bold = BOLD_LEAD.exec(text)
  if (bold?.[1]) {
    const label = bold[1].replace(/:$/, '')
    const hasColon = bold[1].endsWith(':') || bold[3] === ':'
    const rest = bold[4] ?? ''
    // "**Note** this is..." is a bold word in a sentence, not a lead-in.
    if (hasColon || rest === '') {
      return { lead: { label, detail: bold[2] ?? '' }, rest }
    }
  }

  const named = NAME_HASH.exec(text)
  if (named?.[1]) {
    return { lead: { label: named[1], detail: named[2] ?? '' }, rest: '' }
  }

  const plain = PLAIN_LEAD.exec(text)
  if (plain?.[1]) {
    const label = plain[1].trim()
    const isName = label.split(/\s+/).length <= 7 && !/[.,;!?]$/.test(label) && !LEAD_SENTENCE.test(label)
    if (isName && /^["'`A-Za-z0-9*]/.test(label) && !BOX.test(text)) {
      return { lead: { label, detail: plain[2] ?? '' }, rest: plain[3] ?? '' }
    }
  }

  return undefined
}

type Chunk = { type: 'fence' | 'table' | 'quote' | 'rule' | 'heading' | 'para' | 'list'; lines: string[] }

const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/

function chunksOf(text: string): Chunk[] {
  const chunks: Chunk[] = []
  let current: Chunk | undefined
  let fence: string | undefined

  const start = (type: Chunk['type'], line: string) => {
    current = { type, lines: [line] }
    chunks.push(current)
  }

  for (const line of text.split('\n')) {
    if (fence !== undefined) {
      current?.lines.push(line)
      if (line.trim().startsWith(fence)) fence = undefined
      continue
    }

    const trimmed = line.trim()
    const fenceOpen = /^(```+|~~~+)/.exec(trimmed)

    if (fenceOpen?.[1]) {
      fence = fenceOpen[1]
      start('fence', line)
    } else if (trimmed === '') {
      // A blank line ends a paragraph, but a list runs on across one.
      if (current?.type !== 'list') current = undefined
      else current.lines.push(line)
    } else if (/^#{1,6}\s/.test(trimmed)) {
      start('heading', trimmed)
      current = undefined
    } else if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      start('rule', line)
      current = undefined
    } else if (trimmed.startsWith('|')) {
      if (current?.type === 'table') current.lines.push(line)
      else start('table', line)
    } else if (trimmed.startsWith('>')) {
      if (current?.type === 'quote') current.lines.push(line)
      else start('quote', line)
    } else if (LIST_ITEM.test(line)) {
      if (current?.type === 'list') current.lines.push(line)
      else start('list', line)
    } else if (current?.type === 'list') {
      const lastLine = current.lines[current.lines.length - 1] ?? ''
      // After a blank line only indented text still belongs to the list.
      if (lastLine.trim() === '' && line === trimmed) start('para', line)
      else current.lines.push(line)
    } else if (current?.type === 'para') {
      current.lines.push(line)
    } else {
      start('para', line)
    }
  }

  for (const chunk of chunks) {
    while (chunk.lines.length > 1 && chunk.lines[chunk.lines.length - 1]?.trim() === '') chunk.lines.pop()
  }

  return chunks
}

function itemsOf(lines: string[]): Item[] {
  const items: Item[] = []
  let gap = false

  for (const line of lines) {
    if (line.trim() === '') {
      gap = true
      continue
    }

    const match = LIST_ITEM.exec(line)
    const last = items[items.length - 1]

    if (match) {
      const text = match[3] ?? ''
      const lead = leadOf(text)
      items.push({
        depth: Math.floor((match[1] ?? '').length / 2),
        marker: match[2] ?? '-',
        text: lead ? lead.rest : text,
        ...(lead ? { lead: lead.lead } : {}),
      })
    } else if (gap || !last) {
      // An indented paragraph after a blank line hangs under the item above.
      items.push({ depth: (last?.depth ?? 0) + 1, marker: '', text: line.trim() })
    } else {
      last.text = `${last.text} ${line.trim()}`
    }

    gap = false
  }

  return items
}

function paraOf(text: string): Block {
  const lead = leadOf(text)

  return lead ? { type: 'para', text: lead.rest, lead: lead.lead } : { type: 'para', text }
}

export function parse(text: string): Parsed {
  const blocks: Block[] = []
  let section: Extract<Block, { type: 'section' }> | undefined
  let isReport = false

  const push = (block: Block) => (section ? section.blocks.push(block) : blocks.push(block))
  const open = (kind: Kind, label: string) => {
    section = { type: 'section', kind, label, blocks: [] }
    blocks.push(section)
    isReport = true
  }

  for (const chunk of chunksOf(text)) {
    if (chunk.type === 'heading') {
      const label = unbold((chunk.lines[0] ?? '').replace(/^#+\s+/, '').replace(/\s+#*$/, ''))
      open(kindOf(label) ?? 'plain', label)
      continue
    }

    if (chunk.type === 'list') {
      push({ type: 'list', items: itemsOf(chunk.lines) })
      continue
    }

    if (chunk.type !== 'para') {
      push({ type: 'raw', text: chunk.lines.join('\n') })
      continue
    }

    const [first = '', ...others] = chunk.lines.map(line => line.trim())
    const titleKind = (others.length === 0 || first.endsWith(':') || first.endsWith(':**')) && kindOf(first)

    if (titleKind) {
      open(titleKind, unbold(first).replace(/:$/, ''))
      if (others.length > 0) push(paraOf(others.join(' ')))
      continue
    }

    const joined = chunk.lines.map(line => line.trim()).join(' ')
    const box = BOX.exec(joined)
    if (box?.[1]) {
      section = undefined
      isReport = true
      blocks.push({ type: 'box', kind: box[1].toLowerCase() === 'result' ? 'result' : 'needs', text: box[2] ?? '' })
      continue
    }

    // "Next: run the specs" is a title with its text on the same line.
    const lead = leadOf(joined)
    const leadKind = lead && !lead.lead.severity && !lead.lead.detail && kindOf(lead.lead.label)
    if (lead && leadKind && lead.rest) {
      open(leadKind, lead.lead.label)
      push({ type: 'para', text: lead.rest })
      continue
    }

    push(paraOf(joined))
  }

  return { blocks, isReport }
}
