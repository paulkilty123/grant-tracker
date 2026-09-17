# Finding programmes yourself, and what reopening would take

Written 2026-09-08 for Paul. Two parts: how to research programmes by hand so
the results drop straight into the catalogue, and what the reopening work
actually involves.

---

# Part one: a brief for you

## What you are looking for

Something a charity, CIC or social enterprise applies to and gets a place, a
grant, investment or a fixed period of support from. An accelerator, an
incubator, a cohort programme, a training scheme with a place on it, a
competition with a prize, an investment readiness programme.

Three questions decide it. All three have to be yes.

1. **Is there a next intake?** A deadline, a cohort start, an application
   window, "applications open in January". If it is open all year with no
   round, it is not this.
2. **Do you get something?** A place, money, mentoring for a fixed term,
   workspace for the programme's length. Not a phone line, not a helpdesk,
   not a members' directory.
3. **Does the organisation apply, and does the page say who can apply?** If
   it is for individual founders only, it is out. If organisations and
   individuals can both apply, it is in, and worth noting that it is both.

## What to skip

- **Support services.** The local voluntary sector council, the growth hub,
  the social enterprise network offering advice through a contact form. You
  ruled these out today and it was the right call. There is one in every town
  and none of them is applied to.
- **Membership bodies, conferences, directories, consultancies.**
- **Anything where the "application" is booking an appointment.**
- **Programmes for individuals only.** Under-represented-founder programmes
  are fine when the applicant is a registered organisation.

## Before you get excited, check we do not already hold it

This is the one that caught us out today. **Search the provider's name, not
the fund's name.** We held Firstport all along under one row while its five
separate funds looked like gaps. The same was true of Key Fund at thirteen
rows, Pilotlight, and Big Issue Invest.

So in the admin search, type the organisation, look at everything that comes
back, and only then decide whether the specific fund is new. If we hold the
provider with one row pointing at a list of funds, that is worth telling me:
it is a row standing in front of several funds, and splitting it adds real
opportunities without any new research.

## What to write down

One line per candidate is enough. For each one:

- the programme's name and the organisation running it
- **the link to the programme's own page**, not the provider's homepage or a
  news article about it
- who can apply, in your words
- what they get, including the amount if the page gives one
- the next deadline or cohort date
- one sentence copied and pasted from the page that shows it is open to
  organisations

That last one matters more than it looks. Copy it, do not summarise it. Three
times today a session gave me a sentence that turned out to be from a search
result or a news item rather than the page, and each time the conclusion was
right but the evidence was not.

## Two traps worth knowing

**A page that names the fund is not the same as a page you could apply from.**
Ask yourself whether a fundraiser landing there would know what to do next. A
news story announcing a cohort is not an application page.

**Do not judge by how the link looks.** We got three out of twelve backwards
that way in August. An unpromising URL often holds the eligibility, and a
tidy-looking one often holds nothing.

## Where to put it

A list in a message to me, or a file anywhere you like. Ten candidates is
plenty to start. I will check each one against the catalogue, read the pages,
and stage the ones that hold up for your review queue. Nothing goes live
without your click.

## What would be most useful

Places we have not reached, rather than more of what we have. Today's search
found every bank, corporate and tech provider already in the catalogue, so the
gaps are more likely in: sector-specific programmes (arts, sport, health,
faith, environment), housing associations and their community programmes,
universities' social venture tracks, the trade bodies for particular sectors,
and anything you hear about from other fundraisers that never appears in a
funding directory. Word of mouth is the seam a search engine cannot reach,
and it is the one you have and we do not.

---

# Part two: what reopening would take

## The problem in one line

We hold 273 funds that are closed and hidden, and almost nothing brings them
back when they reopen.

## Why it happens

Two crons touch this and there is a gap between them.

- **expire-grants** looks only at rows that are currently live. It hides a
  fund when its deadline passes. Once hidden, it never looks at that row
  again.
- **check-coming-soon** looks only at rows marked "between rounds". It brings
  those to your review queue a month before they reopen.

So a fund that was live, expired and got hidden while still marked
"published" is looked at by neither. That is 149 rows.

## The size of it

| | rows |
|---|---:|
| Closed and hidden in total | 273 |
| ...of which have a real reopening date stored | 66 |
| ...have only a phrase like "Spring 2027" or "TBC" | 64 |
| ...have no date at all | 143 |
| Due to reopen within the next month, still hidden | 8 |
| Reopening date already passed, still hidden | 2 |

Those last two lines are the sharp end. Two funds should be open right now and
nobody can see them. Eight more are due within the month, including one
opening on 21 September.

## The work, in three pieces

**One: sweep the hidden rows too.** Widen check-coming-soon so it covers
hidden rows in both states, not just the ones marked "between rounds". This
is the small piece and it fixes the 66 rows that already carry a proper date,
including all ten of the urgent ones. Half a day, plus a test that proves a
row actually comes back.

**Two: read the phrases we already store.** Sixty-four rows say things like
"Spring 2027" or "opens in March". A parser turns those into dates the sweep
can act on. Some genuinely cannot be parsed, because "TBC" is not a date, and
those should stay as they are rather than be guessed at. A day or two, and it
inherits a known trap: a sentence with two years in it currently parses to the
wrong one.

**Three: go and look.** The 143 rows with no date at all need their pages
re-read to find out whether the next round has been announced. This is the
expensive piece and it is really the watchlist doing its job, which already
runs twice a week but has a known gap in what it is watching. This is where
most of the 273 sit, and it is a project rather than a fix.

## What I would do

Piece one, on its own, after launch. It is small, it fixes the ten funds that
are wrong today, and it is the difference between a catalogue that quietly
loses funds and one that brings them back.

Pieces two and three only if the first one shows the pattern is worth it.

## One condition on any of it

Whatever gets built has to be proved by making a fund actually reappear. An
alarm that reports nothing looks identical to one that is broken, and we have
had three of those this fortnight. So: take a row, set its reopening date to
tomorrow, run the sweep, watch it land in the review queue, then put it back.
Until that has happened, it is not finished.
