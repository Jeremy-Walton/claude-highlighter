import type { CommandRunInput, ConfigRow, PromptAutocompleteInput, PromptAutocompleteResult } from 'claude-code'
import { expect, test } from 'claude-code/testing'

import { leadOf, parse } from '../hooks/blocks'
import { sentences } from '../hooks/inline'

const REPLY = `The clean-up is done. All 11 branch checks pass.

**Fixed**

**make-it-right** (1aede1b6b)
- **Subregion names:** looked up per country.
- High: add specs for the guard.

**make-it-simple** (82f09d631): the code grew by 3 lines.

Look here

1. **Workspace filter:** only status ships. See [the plan](docs/plan.md).

Next

Run \`bundle exec turbo_tests\`, then /wrap-up.

\`\`\`ruby
**Not a title**
\`\`\`

needs input: unlock 1Password and tell me to retry.

result: clean-up finished.`

test('splits a reply into sections, leads and boxes', () => {
  const { blocks, isReport } = parse(REPLY)

  expect(isReport).toBe(true)
  expect(blocks.map(b => (b.type === 'section' ? `${b.type}:${b.kind}:${b.label}` : b.type))).toEqual([
    'para',
    'section:done:Fixed',
    'section:check:Look here',
    'section:next:Next',
    'box',
    'box',
  ])

  const fixed = blocks[1]
  if (fixed?.type !== 'section') throw new Error('expected a section')
  expect(fixed.blocks.map(b => b.type)).toEqual(['para', 'list', 'para'])
  expect(fixed.blocks[0]).toEqual({ type: 'para', text: '', lead: { label: 'make-it-right', detail: '(1aede1b6b)', noColon: true } })
  expect(fixed.blocks[2]).toEqual({
    type: 'para',
    text: 'the code grew by 3 lines.',
    lead: { label: 'make-it-simple', detail: '(82f09d631)' },
  })

  const list = fixed.blocks[1]
  if (list?.type !== 'list') throw new Error('expected a list')
  expect(list.items.map(i => [i.lead?.label, i.lead?.severity, i.text])).toEqual([
    ['Subregion names', undefined, 'looked up per country.'],
    ['High', 'high', 'add specs for the guard.'],
  ])

  const next = blocks[3]
  if (next?.type !== 'section') throw new Error('expected a section')
  expect(next.blocks.map(b => b.type)).toEqual(['para', 'raw'])
})

test('a sentence ending in a colon is not a lead-in', () => {
  expect(leadOf('The commit failed: the signing step errored.')).toBeUndefined()
  expect(leadOf('Three of nine perspectives are saved: specs.')).toBeUndefined()
  expect(leadOf('Dropping the redundant dependent: :destroy.')).toBeUndefined()
  expect(leadOf('**Note** this is bold, not a label.')).toBeUndefined()
  expect(leadOf('Formatter hook: the hook rewrote routes.')?.lead.label).toBe('Formatter hook')
})

test('a short reply with no rules still gets its sentences', () => {
  expect(parse('Just one paragraph.').isReport).toBe(false)
})

test('marks actions, progress, pass and fail, and hashes', () => {
  const [done, waiting] = sentences('All 62 specs pass and one failed. I\'m still waiting on correctness.')
  expect(done?.tone).toBeUndefined()
  expect(done?.pieces.filter(p => p.mark).map(p => [p.mark, p.text])).toEqual([
    ['good', 'All 62 specs pass'],
    ['bad', 'failed'],
  ])
  expect(waiting?.tone).toBe('narr')

  const [act] = sentences('Run `bin/rails db:migrate` when convenient.')
  expect(act?.tone).toBe('act')
  expect(act?.pieces.find(p => p.code)?.text).toBe('bin/rails db:migrate')

  const [head] = sentences('Committed as `f426e8d62`. Done.', { headline: true })
  expect(head?.tone).toBe('headline')
  expect(sentences('Committed as f426e8d62.')[0]?.pieces.find(p => p.mark === 'hash')?.text).toBe('f426e8d62')
})

const MESSAGE = { plugin: 'highlighter', component: 'AssistantMessage', requestId: 'm1' } as const

test('draws the rules on every surface', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...MESSAGE, surface, props: { text: REPLY, isFirstOfReply: true } })
    // A parent Text holds its children's words too, so look at every match.
    const prop = async (text: RegExp, name: 'color' | 'backgroundColor') =>
      (await ui.findAll({ type: 'Text', text })).map(found => found.props[name])

    expect(await prop(/^▍Next$/, 'color')).toContain('suggestion')
    expect(await prop(/^▍Look here$/, 'color')).toContain('warning')
    expect(await prop(/^ High $/, 'backgroundColor')).toContain('error')
    expect(await prop(/^RESULT$/, 'color')).toContain('success')
    expect(await prop(/^NEEDS YOU$/, 'color')).toContain('error')
    expect(await prop(/^➜ Run/, 'color')).toContain('suggestion')
    expect(await ui.find({ type: 'Markdown', text: /the plan/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /engine/ })).toBeFalsy()
    await ui.unmount()
  }
})

test('a reply of only code goes to the engine', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  const ui = await $.ui.mount({
    ...MESSAGE,
    surface: 'terminal',
    props: { text: '```\nls\n```', isFirstOfReply: true },
  })

  expect((await ui.find({ type: 'Text' }))?.text).toBe('engine')
  await ui.unmount()
})

test('a bare bold title draws no colon, and a plain "for you." is not an action', () => {
  expect(leadOf('**Bullet fix**')?.lead).toEqual({ label: 'Bullet fix', detail: '', noColon: true })
  expect(leadOf('**Bullet fix:**')?.lead).toEqual({ label: 'Bullet fix', detail: '' })
  expect(sentences("I can't answer that question for you.")[0]?.tone).toBeUndefined()
  expect(sentences('Two things are left for you:')[0]?.tone).toBe('act')
})

test('the terminal row keeps the blank line above a reply', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  const ui = await $.ui.mount({ ...MESSAGE, surface: 'terminal', props: { text: REPLY, isFirstOfReply: true } })
  const rows = await ui.findAll({ type: 'Box' })

  expect(rows[0]?.props.marginTop).toBe(1)
  await ui.unmount()
})

test('a fixed theme draws with its own colors', { options: { theme: 'dracula' } }, async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...MESSAGE, surface, props: { text: REPLY, isFirstOfReply: true } })
    const colors = async (text: RegExp) => (await ui.findAll({ type: 'Text', text })).map(found => found.props.color)

    expect(await colors(/^▍Next$/)).toContain('#8be9fd')
    expect(await colors(/^▍Look here$/)).toContain('#f1fa8c')
    expect(await colors(/^RESULT$/)).toContain('#50fa7b')
    await ui.unmount()
  }
})

const THEME_ROW: ConfigRow = {
  key: 'highlighter@claude-highlighter.theme',
  label: 'Color theme',
  kind: 'choice',
  value: 'terminal',
  options: ['terminal', 'dracula', 'nord'],
  provider: { plugin: 'highlighter', tier: 'user' },
  isLocked: false,
}

const run = (args: string): CommandRunInput => ({
  command: 'highlighter-theme',
  args,
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 100 },
})

test('the command sets the theme by name', async ($, on) => {
  const set: unknown[] = []
  on('command.register', () => ({ value: { command: 'highlighter-theme' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('config.list', () => ({ value: [THEME_ROW] }))
  on('config.set', (_, e) => {
    set.push([e.key, e.value])

    return { value: e.value }
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const named = await $.command.run(run('nord'))
  const unknown = await $.command.run(run('neon'))

  expect(set).toEqual([['highlighter@claude-highlighter.theme', 'nord']])
  expect(JSON.stringify(named)).toContain('Nord')
  expect(JSON.stringify(unknown)).toContain('No theme named')
})

test('the picker lists every theme and sets the one pressed', async ($, on) => {
  const set: unknown[] = []
  on('config.list', () => ({ value: [THEME_ROW] }))
  on('config.set', (_, e) => {
    set.push(e.value)

    return { value: e.value }
  })
  on('ui.close', () => ({ value: undefined }))

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'highlighter',
      component: 'Pane',
      requestId: 'highlighter-theme',
      surface,
      props: {
        title: 'Highlighter theme',
        isFocused: true,
        bodyColumns: 60,
        placement: 'dock',
        scroll: { offset: 0, bodyRows: 20 },
        view: {},
      },
    })

    expect(await ui.findAll({ type: 'Button' })).toHaveLength(9)
    expect(await ui.find({ type: 'Text', text: /current/ })).toBeTruthy()
    await ui.press({ key: 'gruvbox-dark' })
    await ui.unmount()
  }

  expect(set).toEqual(['gruvbox-dark', 'gruvbox-dark'])
})

test('the command hint lists every theme, and typing suggests them', async ($, on) => {
  const registered: string[] = []
  on('command.register', (_, e) => {
    registered.push(e.argumentHint ?? '')

    return { value: { command: e.name } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.autocomplete', () => ({ suggestions: [] }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect(registered[0]).toBe('[terminal|cobalt2|dracula|nord|solarized-dark|gruvbox-dark|tokyo-night|lumon|github-light]')

  // The test kit raises prompt.autocomplete, but this build's typings leave it
  // off the prompt noun.
  const prompt = $.prompt as unknown as {
    autocomplete: (e: PromptAutocompleteInput) => Promise<PromptAutocompleteResult>
  }
  const typed = (text: string) =>
    prompt.autocomplete({ text, cursor: text.length, token: text.split(' ').pop() ?? '', start: text.lastIndexOf(' ') + 1 })

  expect((await typed('/highlighter-theme t')).suggestions.map(s => s.text)).toEqual(['terminal', 'tokyo-night'])
  expect((await typed('/highlighter-theme g')).suggestions.map(s => s.text)).toEqual(['gruvbox-dark', 'github-light'])
  expect((await typed('/highlighter-theme t')).suggestions[0]?.description).toBe('Terminal (current)')
  expect((await typed('/other t')).suggestions).toEqual([])
})
