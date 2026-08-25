# Applications can't be linked to a project unless you arrive by URL

**Found:** 24 August 2026, answering §0a of the Band B pass 2 dashboard brief.
**Not a design defect** — the dashboard brief assumed unassigned applications were an outlier worth flagging. They are 100% of applications, for a structural reason in the creation flow.
**Severity:** silent, permanent, and it grows. Every application created before a fix has the same hole.

---

## The failure

`applications.project_id` exists, is nullable, and is **null on every application in the database**.

```
applications (status <> 'complete')   4
  with a project                      0
  without                             4
```

Not legacy data. It is the only possible outcome for most routes into the flow.

---

## Why

`src/app/dashboard/applications/new/page.tsx`

`projectId` initialises to `null` (`:115`) and `setProjectId` is called in exactly **one** place (`:150`):

```ts
if (projParam && UUID_RE.test(projParam)) setProjectId(projParam)
```

That reads a `?project=<uuid>` query parameter. **There is no project picker anywhere in the flow**, and nothing prompts for one. `handleCreate` is gated only on `creating`, so an application submits happily without a project.

So a project is attached if, and only if, the user entered the flow from a project page carrying the parameter. Start an application from Find Funding, from the dashboard, or from the applications list and `project_id` is null forever, with no way to set it afterwards.

The write path itself is fine and fully wired — `api/builder/applications/route.ts:62–100` validates the id, checks org ownership, and stores it. Nothing is broken downstream. The value simply never arrives.

---

## Why it matters

Three of Paul's four applications are to the same funder. On the dashboard they render as three rows all reading **"Youth Fund"** with nothing to tell them apart, because the project name is the field that would have distinguished them.

It also disables a whole designed feature: the Band B project-colour system keys off `project_id`, so it has been shipped dormant — the row keeps its second-line slot and a neutral tile, and fills in on the day the data starts arriving.

---

## Reproduction

1. Go to `/dashboard/search`, find any opportunity.
2. Start an application from it, without going via a project page.
3. Complete the flow.
4. `select project_id from applications order by created_at desc limit 1` → `null`.
5. Nothing in the UI offers to set it, then or later.

---

## Suggested fix

**A project picker in the creation flow**, defaulting to the org's most recent project, with an explicit "not part of a project" option so the null is a choice rather than an accident. The `?project=` parameter keeps working as the pre-selected case.

Worth deciding at the same time:

- **Should a project be required?** The data model allows null and the builder reads `project_brief` as a free-text alternative, so "no project" may be legitimate rather than a gap. If it is legitimate, the dashboard should stay silent about it — which is what the current fallback does.
- **Backfilling the existing four.** Only meaningful if a human knows which project each belongs to; not something to infer.

**Do not** surface "No project assigned" on the row until a picker exists. It would fire on every row for every user, about a gap they have no means to close, which is chrome rather than a warning.

---

## Related

The dashboard fallback that ships in the meantime is in `docs/design/band-b-dashboard/addendum-applications-and-greeting.html`: the second line carries `funder_name` and a timestamp instead, both already on the record, and the rows sort by `updated_at` newest-first so recency does the disambiguating.
