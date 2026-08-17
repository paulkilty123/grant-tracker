# Structure tagging rulings

**Standing decisions about which legal forms count as eligible for a fund.**
Paul's, unless noted. Add to this file rather than re-deciding — and read the
exceptions, because two of the three rulings so far have one.

Each ruling says what the default is, what evidence overrides it, and where it
has already been applied.

---

## R1 — An unincorporated group is not eligible where the fund requires a registered company

**Ruling, 2026-08-17.** Where a funder's page strictly requires registration at
Companies House (or with a charity regulator), `unincorporated` comes off. An
unincorporated association is at neither register, so tagging it eligible tells a
constituted-but-unregistered community group to apply for something it cannot
have.

**No exception found so far.** The wording that triggers it is explicit
registration language, not a general preference. "We prefer constituted groups"
does not trigger it.

Applied to: **J N Derbyshire Trust** (*"organisations not registered with
Charities Commission or Companies House"*), **Key Fund Property Fund** (*"Not a
legal company registered at Companies House"*).

---

## R2 — A CIC limited by shares is not "profit-distributing" by default, but read the page

**Ruling, 2026-08-17.** A general exclusion of profit-distributing or privately
owned companies does **not** by itself bar a CIC limited by shares. Keep
`cic_shares`.

**The exception, and it is not rare.** A CIC limited by shares *can* pay capped
dividends under its asset lock. So where a funder's page **specifically** bars
organisations that distribute profits to shareholders — or names the form
outright — that genuinely does include it, and `cic_shares` comes off.

**This is why the ruling is "read the page", not "apply the default".** The two
rows it was first written for came out differently:

| Row | What the page says | Outcome |
|---|---|---|
| **Sizewell C Community Fund** | eligible: *"not-for-profit enterprises, including community interest companies limited by guarantee"* · ineligible: *"companies that are aimed at generating profits for private distribution, **including community interest companies limited by shares** and companies limited by shares"* | **`cic_shares` removed.** The funder names the form on both sides. |
| **Scops Arts Trust** | ineligible: *"Privately owned, profit-distributing companies"* — naming neither CICs nor share capital. Its own eligibility list accepts *"CIC (Community Interest Company)"* unqualified. | **`cic_shares` kept.** The default. |

Had the default been applied blanket, Sizewell C would still be telling CICs
limited by shares to apply for a fund that names them as ineligible.

**Test to apply:** does the page name the form, or name share capital, or name
distribution *to shareholders/members*? If yes, remove. If it only says
"commercial", "private profit" or "profit-distributing" in general terms, keep.

---

## R3 — "Regular limited company" means `ltd_shares`

**Ruling, 2026-08-17.** Where a page bars ordinary trading companies —
*"Regular Ltd companies and sole traders"* — that is `ltd_shares` and
`sole_trader`, and they come off. It does not touch `ltd_guarantee`, which is the
standard non-profit form, nor CICs of either kind.

Applied to: **Grants for Good Fund** (Matthew Good Foundation).

---

## A note on what these rulings write

An accepted ruling writes with an **`admin:` source and pins**, which is right
and deliberate: a human decided it, so it should outrank re-enrichment and should
not be silently reverted by a classifier. That is the opposite of the staging
case the repo warns about, where an `admin:` source on an *unreviewed* value
blocks Re-enrich for good. The distinction is whether a person actually looked.

Record of application: `reports/exclusion-rulings-2026-08-17.json`.
