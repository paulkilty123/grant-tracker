// Shared discovery query constants — importable by both the API route and client components

export type DiscoveryFundingType = 'corporate' | 'social_investment' | 'programme'

export const DEFAULT_QUERIES: Record<DiscoveryFundingType, string[]> = {
  corporate: [
    'UK corporate foundation grants charities CICs 2025 2026 open applications',
    'UK CSR programme funding social enterprises community organisations apply now',
    'FTSE100 company community grants UK charities open applications',
    'UK corporate social responsibility fund social enterprise apply 2026',
    'UK business foundation grants community groups open round',
  ],
  social_investment: [
    'UK social investment patient capital charities CICs apply 2025 2026',
    'blended finance social enterprise UK loan equity hybrid funding open',
    'community development finance institution CDFI loan UK social enterprise apply',
    'UK social impact fund outcomes-based finance charity apply',
    'impact investing UK charity CIC convertible loan grant blend open',
  ],
  programme: [
    'UK accelerator incubator social enterprise charity cohort 2025 2026 apply',
    'fellowship programme UK social entrepreneurs charity leaders open applications',
    'capacity building programme UK charities CICs funding support 2026',
    'UK social enterprise support programme mentoring funding apply now',
    'charity incubator accelerator UK open applications cohort 2026',
  ],
}
