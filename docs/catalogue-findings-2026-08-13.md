# Catalogue findings, 13 August 2026

Surfaced by the MCP reviewer walkthrough, not by an audit. A free-tier connector
was asked two ordinary questions — "what funding is available for a youth arts
charity in Leeds" and "tell me about The Fore" — and the model's own answer
flagged the data problems below. Every claim here was checked against the
database before being written down; where the model was wrong, that is noted.

Raised for the catalogue workstream. Nothing here has been changed.

---

## 1. PRIORITY — `max_org_income` is wrong on The Fore, and probably systemic

`2eebb7eb` (The Fore Small Charity Grants and Pro Bono Support) carries
`max_org_income = 250000`. The correct figure is £500,000, and it is sitting on
the *other* record for the same funder (`3b887829`, which has `500000`).

**Why this is the priority rather than the duplicate.** A wrong cap fails
CLOSED. `src/lib/eligibility.ts` treats an organisation more than 50% over the
cap as a blocker that caps the total match score at 30, which drops the row out
of results entirely. So every organisation with turnover between £250k and £500k
is being silently excluded from a funder they are eligible for. A *missing* cap
fails open and merely shows a row that might not fit; a *wrong* cap hides a row
that does. The reviewer's model reported this as "missing eligibility cap",
which understates it — the cap is present, and half what it should be.

**Why it is probably not one bad row.** `src/lib/verification/verify-row.ts:26`
already records that `max_org_income` scored 32/32 on a "does the value appear
in the quoted sentence" check, and then **three of five failed a random
sample**, including a case that read a cap out of "cash at bank" while the real
income limit sat on the same page. The confirmation check cannot catch this
class of error because the wrong number genuinely does appear in the text.

Suggested: treat as a field-level audit rather than a row fix. Count the
population first — how many active rows have a non-null `max_org_income`, and
what share of a sample survive a second read against the funder's own page.

## 2. The Fore is duplicated, and the better-verified record has the worse data

| | `2eebb7eb` | `3b887829` |
|---|---|---|
| title | The Fore Small Charity Grants and Pro Bono Support | The Fore Grants Programme |
| funding_type | grant | programme |
| amount_min / max | 5,000 / **30,000** | null / **45,000** |
| max_org_income | **250,000** | 500,000 |
| url_status | **ok** | unchecked |
| last_seen | 2026-07-26 | **2026-03-11** |
| is_active / pipeline_state | true / published | true / published |

Both are live and published. The maximum award disagrees between them (£30k vs
£45k; £45k is correct, raised from £30k in June 2025).

The awkward part: the record that looks trustworthy is the wrong one. `2eebb7eb`
is URL-verified and freshly seen, and carries both the wrong amount and the wrong
income cap. `3b887829` is stale and unchecked, and has both right. Any dedup that
keeps the better-verified row will keep the worse data.

## 3. `is_rolling` is wrong on The Fore, and the failure mode is expensive

Both records have `deadline = null, is_rolling = true`, so the MCP surfaces them
as `deadline.type: "rolling"`.

The Fore does not take rolling applications. It runs three rounds a year, each
opening registration for **one week only**, with places allocated at random by
ballot if oversubscribed. For the Autumn 2026 round, registration ran 8 to 15
July and applications closed 7 September. A user told "rolling" would reasonably
assume they can apply whenever, and would have missed the July window entirely.

This is the known `is_rolling = !deadline` over-flagging, previously logged as a
post-launch fix. This is a concrete instance of it costing a user a round, on a
funder a reviewer chose to look at unprompted.

## 4. Coverage note, correcting the transcript

The model told the user Jerwood "isn't in the catalogue at all" and called it a
conspicuous coverage gap. **That is wrong.** `Jerwood Foundation`
(`6df1b665-ae45-435c-b07f-f56ccb582d5a`, Annual Funding Round, £40k–£200k,
deadline 2027-02-03) is active, published and URL-verified.

The cause was an MCP tool defect, not coverage: provider lookup was exact-match
only, so "Jerwood" missed while "Jerwood Foundation" resolved, and the failure
message asserted absence. Fixed 2026-08-13 in the same pass as this note. Left
here so nobody reads the transcript later and opens a discovery ticket for a
funder that is already catalogued.

Genuinely worth a look, though: **Jerwood Arts** is a separate organisation from
Jerwood Foundation and is not in the catalogue. That one may be a real gap.

## 5. Smaller, from the same walkthrough

- **Two Ridings Community Foundation** surfaced on a Leeds query. Their patch is
  North and East Yorkshire; The Local Fund is Harrogate District only. Geography
  is matching more loosely than the funder's own boundary.
- **Community Foundation Tyne and Wear** funds surfaced on the same regional
  match and are North East only.
- **Hull Community Fund** (`b06af7a3` and `49d410cd`) is duplicated under Two
  Ridings, spotted separately on 2026-08-12 while picking reviewer pipeline rows.
