export default function AboutPage() {
  return (
    <div className="max-w-2xl mx-auto px-5 py-8 md:py-10">

      {/* Header */}
      <div className="mb-10">
        <h1 className="font-display text-2xl font-bold text-charcoal mb-2">About Grant Tracker</h1>
        <p className="text-mid text-sm italic">A better way to find funding for the work that matters.</p>
      </div>

      <div className="space-y-10">

        {/* Our story */}
        <section>
          <h2 className="font-display text-lg font-bold text-charcoal mb-4">Our story</h2>
          <blockquote className="border-l-2 border-forest pl-5 mb-5">
            <p className="text-sm leading-relaxed text-charcoal mb-3">
              &ldquo;I&apos;ve worked in the social enterprise and charity sector for 20 years as a fundraiser
              and social entrepreneur, from co-founding a youth radio station to working at local
              charities and leading on fundraising at Impact Hub.
            </p>
            <p className="text-sm leading-relaxed text-charcoal">
              Throughout all of it, I was consistently frustrated by the same thing: a fragmented
              funding ecosystem that forced people like me to spend a disproportionate amount of
              time hunting opportunities rather than delivering impactful work.&rdquo;
            </p>
            <footer className="mt-3 text-xs font-semibold text-mid">Paul Kilty, founder</footer>
          </blockquote>
          <p className="text-sm leading-relaxed text-mid">
            That frustration became Grant Tracker. Not just a smarter search, but a tool that
            actually understands your organisation, your structure, your geography, your mission,
            and brings the opportunities most likely to be worth your time to the top.
          </p>
        </section>

        <hr className="border-warm/60" />

        {/* Why it exists */}
        <section>
          <h2 className="font-display text-lg font-bold text-charcoal mb-4">Why it exists</h2>
          <p className="text-sm leading-relaxed text-mid mb-3">
            The UK has thousands of active funders. Finding the right ones, at the right moment,
            with the right intelligence about how they make decisions, is effectively a full-time
            job. Most charities, CICs and social enterprises can&apos;t afford that, and they
            shouldn&apos;t have to.
          </p>
          <p className="text-sm leading-relaxed text-mid">
            Grant Tracker brings together a live catalogue of grants, programmes, investments and
            in-kind support, matched to your profile and filtered for your eligibility. So instead
            of searching, you can spend that time delivering.
          </p>
        </section>

        <hr className="border-warm/60" />

        {/* Who it's for */}
        <section>
          <h2 className="font-display text-lg font-bold text-charcoal mb-4">Who it&apos;s for</h2>
          <p className="text-sm leading-relaxed text-mid">
            Grant Tracker is built for UK charities, community interest companies and social
            enterprises, particularly smaller organisations without a dedicated fundraiser. If
            you&apos;re a founder, a trustee, or someone wearing six hats at once, this is for you.
          </p>
        </section>

        <hr className="border-warm/60" />

        {/* Our values */}
        <section>
          <h2 className="font-display text-lg font-bold text-charcoal mb-5">Our values</h2>
          <div className="space-y-5">
            {[
              {
                label: 'Honest',
                body: "We don't inflate match scores or dress up poor-fit grants. If something isn't right for you, we'd rather tell you than waste your time.",
              },
              {
                label: 'Practical',
                body: "Every feature exists because it makes the funding process easier. We don't add complexity for the sake of it.",
              },
              {
                label: 'Accessible',
                body: "Good funding intelligence shouldn't only be available to organisations with big budgets. Grant Tracker is priced so that smaller charities and social enterprises can afford it.",
              },
            ].map(v => (
              <div key={v.label} className="flex gap-4">
                <div className="w-1.5 h-1.5 rounded-full bg-forest mt-2 flex-shrink-0" />
                <div>
                  <p className="text-sm font-bold text-charcoal mb-1">{v.label}</p>
                  <p className="text-sm leading-relaxed text-mid">{v.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <hr className="border-warm/60" />

        {/* Our approach to AI */}
        <section>
          <h2 className="font-display text-lg font-bold text-charcoal mb-4">Our approach to AI</h2>
          <p className="text-sm leading-relaxed text-mid mb-3">
            Funders are increasingly inundated with AI-generated applications, bland, generic,
            interchangeable. The last thing we want is to make that problem worse.
          </p>
          <p className="text-sm leading-relaxed text-mid mb-3">
            Grant Tracker uses AI where it genuinely helps: matching your profile to the right
            opportunities, building intelligence about how funders make decisions, and cutting
            down the time you spend searching. The administrative work, not the creative work.
          </p>
          <p className="text-sm leading-relaxed text-mid">
            When it comes to writing your application, your voice, your story and your evidence
            are what make a funder take notice. AI can play a supporting role, helping you refine
            your language, sharpen your argument, or sense-check your structure, but always in
            service of something authentically yours. Not instead of it.
          </p>
        </section>

      </div>
    </div>
  )
}
