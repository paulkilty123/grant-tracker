import { createClient } from '@supabase/supabase-js';
import { computeMatchScore } from './matching';
// Admin client — uses service role to bypass RLS (server-side only)
function adminClient() {
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}
const VALID_FUNDER_TYPES = [
    'trust_foundation', 'community_foundation', 'corporate_foundation',
    'local_authority', 'housing_association',
    'corporate', 'lottery', 'government',
    'competition', 'loan', 'crowdfund_match', 'other',
];
function normaliseScraped(row) {
    const rawType = String(row.funder_type ?? 'other');
    const funderType = VALID_FUNDER_TYPES.includes(rawType)
        ? rawType : 'other';
    return {
        id: String(row.external_id ?? row.id),
        title: String(row.title ?? ''),
        funder: String(row.funder ?? 'Unknown funder'),
        funderType,
        description: String(row.description ?? ''),
        amountMin: typeof row.amount_min === 'number' ? row.amount_min : 0,
        amountMax: typeof row.amount_max === 'number' ? row.amount_max : 0,
        deadline: row.deadline ? String(row.deadline) : null,
        isRolling: Boolean(row.is_rolling),
        isLocal: Boolean(row.is_local),
        locationTag: row.location_tag ? String(row.location_tag) : null,
        sectors: Array.isArray(row.sectors) ? row.sectors : [],
        impactSectors: Array.isArray(row.impact_sectors) ? row.impact_sectors : undefined,
        eligibilityCriteria: Array.isArray(row.eligibility_criteria) ? row.eligibility_criteria : [],
        eligibleStructures: Array.isArray(row.eligible_structures) ? row.eligible_structures : undefined,
        applyUrl: row.apply_url ? String(row.apply_url) : null,
        isInviteOnly: Boolean(row.is_invite_only),
        nextOpenDate: row.next_open_date ? String(row.next_open_date) : null,
        fundingType: (row.funding_type ? String(row.funding_type) : 'grant'),
        source: 'scraped',
        dateAdded: row.first_seen_at ? String(row.first_seen_at).split('T')[0] : undefined,
        lastVerifiedAt: row.last_seen_at ? String(row.last_seen_at).split('T')[0] : undefined,
    };
}
/** Find grants that are a good match and haven't been sent to this org yet */
export async function getUnsentAlerts(org, minScore) {
    const supabase = adminClient();
    // Get already-sent grant IDs for this org
    const { data: sent } = await supabase
        .from('sent_grant_alerts')
        .select('grant_id')
        .eq('org_id', org.id);
    const sentIds = new Set((sent ?? []).map((r) => r.grant_id));
    // Fetch active scraped grants from DB (newest first, max 500)
    const { data: scraped } = await supabase
        .from('scraped_grants')
        .select('*')
        .eq('is_active', true)
        .order('first_seen_at', { ascending: false })
        .limit(500);
    const scrapedGrants = (scraped ?? [])
        .map(row => normaliseScraped(row));
    // DB is the single source of truth — seed grants have been migrated
    const allGrants = scrapedGrants;
    const candidates = [];
    for (const grant of allGrants) {
        if (sentIds.has(grant.id))
            continue;
        const { score, reason } = computeMatchScore(grant, org);
        if (score >= minScore) {
            candidates.push({ grant, score, reason });
        }
    }
    // Sort by score descending, return top 10
    return candidates.sort((a, b) => b.score - a.score).slice(0, 10);
}
/** Record which grants were sent so we don't resend them */
export async function markAlertsSent(orgId, grantIds) {
    const supabase = adminClient();
    const rows = grantIds.map(grant_id => ({ org_id: orgId, grant_id }));
    await supabase
        .from('sent_grant_alerts')
        .upsert(rows, { onConflict: 'org_id,grant_id' });
}
/** Get all orgs that have alerts enabled */
export async function getOrgsWithAlertsEnabled() {
    const supabase = adminClient();
    const { data: orgs } = await supabase
        .from('organisations')
        .select('*')
        .eq('alerts_enabled', true);
    if (!orgs?.length)
        return [];
    // Fetch owner emails from auth.users
    const results = [];
    for (const org of orgs) {
        const { data: userData } = await supabase.auth.admin.getUserById(org.owner_id);
        const email = userData?.user?.email;
        if (email)
            results.push({ ...org, owner_email: email });
    }
    return results;
}
