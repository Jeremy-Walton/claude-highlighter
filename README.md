# Claude Highlighter

A Claude Code plugin that makes Claude's replies easier to scan. It redraws each reply with color, the way a syntax highlighter colors code. Claude's words and the saved transcript do not change.

| # | Rule | What it does |
| --- | --- | --- |
| 1 | Section titles | Colors titles by type: green for Fixed or Summary, yellow for Look here or Risks, blue boxed for Next, purple for Decide |
| 2 | Lead-in labels | Colors labels such as `Routes:` or `**make-it-right** (1aede1b6b)` orange |
| 3 | Result box | Puts a `result:` line in a green RESULT box |
| 4 | Needs-you box | Puts a `needs input:` line in a red NEEDS YOU box |
| 5 | What you do | Colors sentences that ask you to act blue, with ➜ |
| 6 | Severity chips | Shows High, Medium and Low as colored chips |
| 7 | Pass and fail | Colors pass words green and fail words red |
| 8 | Counts and hashes | Bolds counts and colors commit hashes |
| 9 | Dim progress | Dims "still waiting" progress chatter |
| 10 | Headline | Bolds the first sentence of a report |
| 11 | Report card | Frames a reply that has titles or a result line |

Code blocks, tables and links keep Claude Code's own drawing, so links stay clickable.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install highlighter --marketplace Jeremy-Walton/claude-highlighter
```

Answer `y` to add the marketplace, then pick a scope. The user scope turns it on in every session.

From a shell:

```bash
claude plugin install highlighter --marketplace Jeremy-Walton/claude-highlighter
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `Jeremy-Walton/claude-highlighter`, then Add plugin.

A private repository installs only for people who can read it on GitHub and whose machine already has a git credential for github.com (an SSH key, or `gh auth login` then `gh auth setup-git`).

## Develop

The plugin lives in `plugins/highlighter/`.

- `hooks/blocks.ts` splits a reply into sections, lists, lead-ins and boxes.
- `hooks/inline.ts` splits text into sentences and marks the inline rules.
- `hooks/register.tsx` draws the result.

Run a session with your local copy:

```bash
claude --plugin-dir plugins/highlighter
```

Check and test it:

```bash
claude plugin validate plugins/highlighter
```

```bash
claude plugin test plugins/highlighter
```
