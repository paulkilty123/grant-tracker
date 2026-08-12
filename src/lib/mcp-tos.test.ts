// Guards for the MCP Terms of Service document.
//
// Written after /mcp/terms spent 2026-07-25 to 2026-08-12 serving the
// "Terms are being prepared" fallback instead of the terms, in silence. The
// page rendered fine, its DRAFT banner keys off a status starting "DRAFT"
// while the fallback's starts "ERROR", and the read was wrapped in a catch
// that swallowed the error. Nothing anywhere said the legal page had no legal
// text in it.
//
// TWO DIFFERENT FAILURES, so two different tests. They are not redundant, and
// the first one alone would NOT have caught the outage:
//
//   1. The file is missing, renamed, or its frontmatter stops parsing.
//      Caught by reading it. This is a repo-level failure.
//
//   2. The file is present in the repo but never reaches the deployment.
//      That is what actually happened: .vercelignore excluded /docs/
//      wholesale. A test that reads from the working tree cannot see this,
//      because the file is always there locally and in CI. It needs a test
//      of the exclusion rules themselves.

import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { readMCPToS } from './mcp-auth'

const TOS_REL = 'docs/legal/mcp-tos.md'

describe('the ToS document is readable and parses', () => {
  it('does not fall back', async () => {
    const tos = await readMCPToS()

    // 'v0-fallback' means the file could not be read at all.
    expect(tos.version).not.toBe('v0-fallback')
    // 'v0-unversioned' means it was read but the frontmatter did not parse,
    // which silently unpins every key issued from that moment on.
    expect(tos.version).not.toBe('v0-unversioned')
    expect(tos.version).toMatch(/^v\d+-\d{4}-\d{2}-\d{2}$/)
    expect(tos.body.trim().length).toBeGreaterThan(500)
  })

  it('is the live document, not a draft left switched on', async () => {
    const tos = await readMCPToS()
    expect(tos.status).toBe('Live')
  })
})

describe('the ToS document actually ships to production', () => {
  // The real failure. .vercelignore governs Git-triggered deploys too, despite
  // what its header used to claim, so anything it excludes is absent from the
  // running app. Evaluated with git's own matcher rather than by string-
  // matching the patterns: the bug was a pattern doing something other than
  // what its author expected, and asserting the pattern text would just
  // re-encode the same assumption.
  it('is not excluded by .vercelignore', () => {
    const repoRoot = process.cwd()
    const ignoreFile = path.join(repoRoot, '.vercelignore')
    expect(existsSync(ignoreFile)).toBe(true)

    const dir = mkdtempSync(path.join(tmpdir(), 'vercelignore-'))
    execFileSync('git', ['init', '-q'], { cwd: dir })
    // .vercelignore uses gitignore syntax, so git can evaluate it verbatim.
    copyFileSync(ignoreFile, path.join(dir, '.gitignore'))
    mkdirSync(path.join(dir, path.dirname(TOS_REL)), { recursive: true })
    writeFileSync(path.join(dir, TOS_REL), 'x')

    // check-ignore exits 0 when the path IS ignored, 1 when it is not.
    let ignored: boolean
    try {
      execFileSync('git', ['check-ignore', '-q', TOS_REL], { cwd: dir })
      ignored = true
    } catch {
      ignored = false
    }

    expect(
      ignored,
      `${TOS_REL} is excluded by .vercelignore, so /mcp/terms will serve the ` +
      `"Terms are being prepared" fallback in production while passing every ` +
      `test that reads the file from the working tree.`,
    ).toBe(false)
  })
})
