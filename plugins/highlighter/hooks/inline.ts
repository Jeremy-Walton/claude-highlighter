export type Mark = 'good' | 'bad' | 'hash' | 'count'
export type Tone = 'act' | 'narr' | 'headline'

export type Piece = { text: string; code?: true; bold?: true; italic?: true; mark?: Mark }
export type Sentence = { tone?: Tone; pieces: Piece[] }

const ACTION = /^(Run |Start |Push:|Pushing needs|Unlock|Tell me|Next, run|If it looks right, run|Ask for|Step \d+ is your call)|(left|open questions) for you|your call|worth noting on the ticket|when convenient/
const NARRATION = /^(I'm |I'll |Next I'm |Next I'll |Now |Still waiting|Checking |While |That leaves|Committing now|You chose|The [\w-]+ (tester|verifier) is |[\w-]+ is the last|The \w+ [\w-]+ reviewers are running|All \w+ [\w-]+ reviewers are running|[\w, -]+ (is|are) still running)|still running\.$|will follow/

const MARKS: [Mark, RegExp][] = [
  ['bad', /\b(fails?|failed|failing|errored|flaky|can be wrong|is wrong|wrong when|high-severity gaps?|permission denied)\b/gi],
  ['good', /\b(all \d+ (?:[\w-]+ ){0,3}pass(?:es|ed)?|all (?:\d+ )?(?:examples |specs )?passed|\d+ examples pass|passes all \d+ checks|pass(?:es|ed)? three runs in a row|(?:is|are) clean|found nothing(?: to fix)?|no conflicts|without conflicts|loads cleanly|passes|went through|the flake is gone)\b/gi],
  ['hash', /\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}\b/g],
  ['count', /\b(?:One|Two|Three|Four|Five|Six|Seven|Eight|Nine|All nine|All five|\d+) of (?:the )?(?:nine|five|four|\d+)\b|\b\d+ (?:findings|examples|specs|branch checks|checks)\b/g],
]

const STYLE = /(`+)([\s\S]+?)\1|\*\*([\s\S]+?)\*\*|(?<![\w*])\*(?![\s*])([^*]+?)\*(?![\w*])/g

export function styled(text: string): Piece[] {
  const pieces: Piece[] = []
  let last = 0

  for (const match of text.matchAll(STYLE)) {
    if (match.index > last) pieces.push({ text: text.slice(last, match.index) })
    if (match[2] !== undefined) pieces.push({ text: match[2], code: true })
    else if (match[3] !== undefined) pieces.push({ text: match[3], bold: true })
    else if (match[4] !== undefined) pieces.push({ text: match[4], italic: true })
    last = match.index + match[0].length
  }
  if (last < text.length) pieces.push({ text: text.slice(last) })

  return pieces
}

function marked(pieces: Piece[]): Piece[] {
  let out = pieces

  for (const [mark, pattern] of MARKS) {
    out = out.flatMap(piece => {
      if (piece.code || piece.mark) return [piece]

      const split: Piece[] = []
      let last = 0
      for (const match of piece.text.matchAll(pattern)) {
        if (match.index > last) split.push({ ...piece, text: piece.text.slice(last, match.index) })
        split.push({ ...piece, text: match[0], mark })
        last = match.index + match[0].length
      }
      if (last < piece.text.length) split.push({ ...piece, text: piece.text.slice(last) })

      return split
    })
  }

  return out
}

function slice(pieces: Piece[], from: number, to: number): Piece[] {
  const out: Piece[] = []
  let at = 0

  for (const piece of pieces) {
    const end = at + piece.text.length
    const start = Math.max(from, at)
    const stop = Math.min(to, end)
    if (start < stop) out.push({ ...piece, text: piece.text.slice(start - at, stop - at) })
    at = end
  }

  return out
}

// Sentences split on the plain text, so a bold run or code span that holds a
// period still lands whole in one sentence's pieces.
export function sentences(text: string, opts: { headline?: boolean } = {}): Sentence[] {
  const pieces = styled(text)
  const plain = pieces.map(piece => piece.text).join('')
  const starts = [0]

  for (const match of plain.matchAll(/[.!?]["”)]?\s+(?=[A-Z"/(`*])/g)) {
    starts.push(match.index + match[0].length)
  }

  return starts.map((start, index) => {
    const end = starts[index + 1] ?? plain.length
    const words = plain.slice(start, end).trim()
    const tone: Tone | undefined =
      opts.headline && index === 0 ? 'headline' : ACTION.test(words) ? 'act' : NARRATION.test(words) ? 'narr' : undefined

    return { ...(tone ? { tone } : {}), pieces: marked(slice(pieces, start, end)) }
  })
}

export function hasLink(text: string): boolean {
  return /\[[^\]]+\]\([^)]+\)|https?:\/\/|<[a-z]+:/.test(text)
}
