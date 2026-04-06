const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
        AlignmentType, HeadingLevel, BorderStyle, WidthType, ShadingType } = require('docx')
const fs = require('fs')

const border = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' }
const borders = { top: border, bottom: border, left: border, right: border }
const cm = { top: 80, bottom: 80, left: 120, right: 120 }

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 320, after: 160 },
    children: [new TextRun({ text, bold: true, size: 32, font: 'Arial', color: '1f5c52' })]
  })
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text, bold: true, size: 26, font: 'Arial', color: '2d8a7a' })]
  })
}

function p(text) {
  return new Paragraph({
    spacing: { before: 0, after: 160 },
    children: [new TextRun({ text, size: 22, font: 'Arial' })]
  })
}

function bullet(text) {
  return new Paragraph({
    spacing: { before: 60, after: 60 },
    indent: { left: 480, hanging: 240 },
    children: [new TextRun({ text: '\u2022  ' + text, size: 22, font: 'Arial' })]
  })
}

function note(text) {
  return new Paragraph({
    spacing: { before: 120, after: 120 },
    indent: { left: 480 },
    children: [new TextRun({ text, size: 20, font: 'Arial', color: '666666', italics: true })]
  })
}

const reasonsTable = new Table({
  width: { size: 9360, type: WidthType.DXA },
  columnWidths: [2800, 3280, 3280],
  rows: [
    new TableRow({
      tableHeader: true,
      children: [
        { label: 'Reason', w: 2800 },
        { label: 'What it signals', w: 3280 },
        { label: 'Effect on matching', w: 3280 },
      ].map(({ label, w }) => new TableCell({
        borders,
        width: { size: w, type: WidthType.DXA },
        margins: cm,
        shading: { fill: 'e8f5f3', type: ShadingType.CLEAR },
        children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 20, font: 'Arial' })] })]
      }))
    }),
    ...[
      ['📍 Wrong location', 'Grant is for a region/area the org is not based in', 'Boosts weight of location dimension in future scoring for this org'],
      ['👥 Wrong beneficiaries', 'Grant targets a different audience (e.g. older people vs young people)', 'Surfaces profile nudge: "You\'ve dismissed 3 older-people grants — is this sector in your profile accurate?"'],
      ['🚫 Not eligible', 'Org does not meet the eligibility criteria', 'No algorithm change — logged for funder intelligence; useful for pattern analysis later'],
      ['💰 Amount doesn\'t suit us', 'Grant size is too small or too large for this org', 'Tightens the inferred grant size range used in scoring for this org'],
      ['✅ Already applied / aware', 'Org has already applied or is actively tracking this elsewhere', 'Tags grant as previously-engaged; could power a "previously applied" view later'],
      ['❓ Not relevant', 'Generic catch-all — no specific dimension identified', 'Grant hidden; no inference made'],
    ].map(([reason, signal, effect]) => new TableRow({
      children: [
        [reason, 2800],
        [signal, 3280],
        [effect, 3280],
      ].map(([text, w]) => new TableCell({
        borders,
        width: { size: w, type: WidthType.DXA },
        margins: cm,
        children: [new Paragraph({ children: [new TextRun({ text, size: 20, font: 'Arial' })] })]
      }))
    }))
  ]
})

const doc = new Document({
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
      }
    },
    children: [
      // Title
      new Paragraph({
        spacing: { before: 0, after: 80 },
        children: [new TextRun({ text: 'Grant Tracker', size: 20, font: 'Arial', color: '999999' })]
      }),
      new Paragraph({
        spacing: { before: 0, after: 240 },
        children: [new TextRun({ text: 'Structured Dismissal Reasons', bold: true, size: 40, font: 'Arial', color: '1f5c52' })]
      }),
      new Paragraph({
        spacing: { before: 0, after: 400 },
        children: [new TextRun({ text: 'Feature design note — for implementation reference', size: 20, font: 'Arial', color: '888888', italics: true })]
      }),

      h1('Overview'),
      p('When a user hides a grant from their results, they pick a reason from a short structured list. Each reason maps cleanly to a specific matching dimension, so the signal is unambiguous and actionable — unlike a plain thumbs down which gives no indication of why the grant was wrong.'),
      p('The key principle: reasons feed back as profile suggestions, not direct algorithm changes. The user fixes the root cause; the algorithm stays neutral across all users.'),

      h1('User Experience'),
      h2('Trigger'),
      p('User clicks "Not for us" on a grant card. A small inline popover appears (no modal) with the six reasons below. One click dismisses and hides the grant. The popover closes immediately.'),

      h2('Reason options'),
      new Paragraph({ spacing: { before: 160, after: 200 }, children: [] }),
      reasonsTable,
      new Paragraph({ spacing: { before: 200, after: 0 }, children: [] }),

      h2('Restore'),
      p('A small "N hidden — show" toggle appears at the bottom of the results list once at least one grant has been hidden. Toggling it reveals dismissed grants as collapsed strikethrough rows, each with a "Restore" button.'),

      h1('What NOT to do'),
      p('The system should not automatically adjust the matching algorithm based on dismissals. If Unicorn Theatre dismisses "Allen Lane — Older People", that should not lower Allen Lane\'s score for an org that genuinely works with older people. Dismissal signals are always per-org, never global.'),
      p('Free-form text feedback ("why didn\'t you like this?") should also be avoided at this stage — it creates support overhead and produces inconsistent signals that are hard to act on.'),

      h1('Implementation notes'),
      h2('Database'),
      bullet('dismissed_grants table already created (migration applied April 2026)'),
      bullet('Add reason column: ALTER TABLE dismissed_grants ADD COLUMN reason text'),
      bullet('Reason is nullable — a plain hide with no reason should still work'),

      h2('API'),
      bullet('POST /api/grants/dismiss — body: { grant_id, reason? }'),
      bullet('DELETE /api/grants/dismiss — body: { grant_id } (restore)'),
      bullet('Or extend existing grant_interactions table with a reason field'),

      h2('UI component'),
      bullet('Small Radix UI Popover triggered by "Not for us" button'),
      bullet('Six reason buttons — icon + label, no further input required'),
      bullet('Closes and hides grant on selection'),
      bullet('Reason stored in DB; reason NOT shown in the restored strikethrough view (keep it simple)'),

      h2('Profile nudge logic'),
      bullet('"Wrong beneficiaries" dismissed 3+ times for older_people grants → surface prompt: "You\'ve dismissed several older-people grants — is \'older people\' accurate in your profile?"'),
      bullet('"Amount doesn\'t suit us" dismissed 3+ times for a size band → offer to update grant size target range in profile'),
      bullet('Nudges shown as a dismissible banner above the results list, not a modal'),
      bullet('Nudge threshold: 3 dismissals with the same reason within the same category'),

      h2('Complexity estimate'),
      bullet('DB migration: 10 mins'),
      bullet('Popover component: 2–3 hours'),
      bullet('Profile nudge logic: 3–4 hours'),
      bullet('Total: roughly a day\'s work'),

      h1('Related work already done'),
      p('The following matching improvements were made in April 2026 that address the root causes of the most common bad matches — reducing the urgency of the dismissal feature somewhat:'),
      bullet('Borough mismatch detection now fires for all London orgs, not just region-matched ones'),
      bullet('Faith-building veto: church/worship grants penalised for non-faith orgs'),
      bullet('Opposing beneficiary conflict: older-people grants capped for young-people orgs and vice versa'),
      bullet('Regional title detection: "(North)", "Yorkshire" etc. in grant titles now trigger location mismatch'),
      bullet('7 impact_sector corrections (Historic England, Charles Hayward, Clothworkers, Gatsby, AHF)'),
      bullet('Primary location hint on profile page prompts users for borough-level precision'),

      new Paragraph({ spacing: { before: 400, after: 0 }, children: [new TextRun({ text: 'Last updated: April 2026', size: 18, font: 'Arial', color: 'aaaaaa', italics: true })] }),
    ]
  }]
})

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync('/sessions/keen-gifted-davinci/mnt/grant-tracker/Dismissal-Reasons-Feature.docx', buf)
  console.log('Done')
})
