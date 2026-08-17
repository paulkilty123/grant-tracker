-- Grant Tracker MCP catalogue session — ship batch, 2026-05-26
-- 34 rows total: 6 SCF + 13 LCF + 5 Brighton local + 10 borough seeds
-- All rows insert with is_active=false per [[new-grants-default-inactive]].
-- 10 rows activate to is_active=true at the end (currently-open funds for the submission window).
-- external_id uses `staged-<source>-<slug>` prefix per Paul's 2026-05-26 ask so post-submission scrapers don't collide.

-- ========================================================================
-- 1. SCF — 6 rows
-- ========================================================================

INSERT INTO scraped_grants (
  external_id, source, title, funder, funder_type, funding_type,
  amount_min, amount_max, deadline, is_rolling, is_local, is_active,
  url_status, apply_url, description, eligibility_criteria,
  eligible_structures, applicant_type, civil_society_relevant,
  impact_sectors, beneficiary_tags, target_beneficiaries, location_tag,
  diversity_tags, raw_data
) VALUES
-- 1.1 SCF Main Grants
('staged-scf-main-grants', 'sussex_community_foundation',
 'Sussex Community Foundation — Main Grants', 'Sussex Community Foundation',
 'community_foundation', 'grant',
 1000, 10000, '2026-06-05', false, true, false,
 'unchecked', 'https://sussexcommunityfoundation.org/grants/how-to-apply/main-grants/',
 'Sussex Community Foundation Main Grants supports grassroots and community organisations across Sussex delivering vital local work. Average award just over £5,000. Grants cover core operational costs and project expenses for up to one year. Applications are matched to relevant funds within four priority areas (Tackling Poverty, Improving Health, Reaching Potential, Acting on Climate) and to geographic sub-funds (Brighton & Hove Legacy, Gatwick Foundation, Lewes, Rye) where applicable — single application form covers all.',
 ARRAY['Not-for-profit volunteer-led organisations','Annual income not exceeding £2 million','Preference for organisations led by and supporting people from underrepresented communities','Preference for small-to-medium-sized groups','Working in Sussex']::text[],
 ARRAY['registered_charity','cio','cic_guarantee','cic_shares','unincorporated','ltd_guarantee','cooperative']::text[],
 'organisation', true,
 ARRAY['community','health','education','environment']::text[],
 ARRAY['people_in_poverty','general_public']::text[],
 ARRAY[]::text[], 'Sussex',
 ARRAY['underrepresented_communities']::text[],
 '{"priority_areas":["Tackling Poverty","Improving Health","Reaching Potential","Acting on Climate"],"shared_application_portal":"https://sussexcf.my.site.com/fundseekerportal/s/login","annual_cycle":true,"sub_funds_in_round":["brighton_hove_legacy","gatwick_foundation","lewes","rye"]}'::jsonb),

-- 1.2 SCF Brighton & Hove Legacy Fund
('staged-scf-bh-legacy-fund', 'sussex_community_foundation',
 'Brighton & Hove Legacy Fund (via SCF Main Grants)', 'Sussex Community Foundation',
 'community_foundation', 'grant',
 1000, 10000, '2026-06-05', false, true, false,
 'unchecked', 'https://sussexcommunityfoundation.org/grants/how-to-apply/main-grants/',
 'Brighton & Hove Legacy Fund operates within Sussex Community Foundation''s Main Grants programme with a specific focus on Children and Young People in Brighton & Hove. Single Main Grants application covers eligibility for this fund where the project is Brighton & Hove-based and serves children or young people. Amount and timing follow Main Grants (£1,000–£10,000, deadline 5 June 2026).',
 ARRAY['Project must serve children and/or young people','Geographic focus: Brighton & Hove','Not-for-profit volunteer-led organisations','Annual income not exceeding £2 million','Preference for organisations led by and supporting people from underrepresented communities']::text[],
 ARRAY['registered_charity','cio','cic_guarantee','cic_shares','unincorporated','ltd_guarantee','cooperative']::text[],
 'organisation', true,
 ARRAY['young_people','education','community']::text[],
 ARRAY['children','young_people']::text[],
 ARRAY['children','young_people']::text[],
 'Brighton and Hove',
 ARRAY['underrepresented_communities']::text[],
 '{"parent_programme":"scf_main_grants","shared_application_portal":"https://sussexcf.my.site.com/fundseekerportal/s/login","annual_cycle":true,"cohort_relevance_note":"Headline row for Brighton youth-arts queries"}'::jsonb),

-- 1.3 SCF Gatwick Foundation Fund
('staged-scf-gatwick-foundation-fund', 'sussex_community_foundation',
 'Gatwick Foundation Fund (via SCF Main Grants)', 'Sussex Community Foundation',
 'community_foundation', 'grant',
 1000, 10000, '2026-06-05', false, true, false,
 'unchecked', 'https://sussexcommunityfoundation.org/grants/how-to-apply/main-grants/',
 'Gatwick Foundation Fund operates within SCF Main Grants for projects in communities affected by Gatwick Airport. Single Main Grants application covers eligibility. Amount and timing follow Main Grants (£1,000–£10,000, deadline 5 June 2026).',
 ARRAY['Geographic focus: communities affected by Gatwick Airport','Not-for-profit volunteer-led organisations','Annual income not exceeding £2 million']::text[],
 ARRAY['registered_charity','cio','cic_guarantee','cic_shares','unincorporated','ltd_guarantee','cooperative']::text[],
 'organisation', true,
 ARRAY['community','environment']::text[],
 ARRAY[]::text[], ARRAY[]::text[], 'Gatwick area',
 ARRAY[]::text[],
 '{"parent_programme":"scf_main_grants","shared_application_portal":"https://sussexcf.my.site.com/fundseekerportal/s/login","annual_cycle":true}'::jsonb),

-- 1.4 SCF Lewes Fund
('staged-scf-lewes-fund', 'sussex_community_foundation',
 'Lewes Fund (via SCF Main Grants)', 'Sussex Community Foundation',
 'community_foundation', 'grant',
 1000, 10000, '2026-06-05', false, true, false,
 'unchecked', 'https://sussexcommunityfoundation.org/grants/how-to-apply/main-grants/',
 'Lewes Fund operates within SCF Main Grants for projects in the Lewes district. Single Main Grants application covers eligibility. Amount and timing follow Main Grants (£1,000–£10,000, deadline 5 June 2026).',
 ARRAY['Geographic focus: Lewes district','Not-for-profit volunteer-led organisations','Annual income not exceeding £2 million']::text[],
 ARRAY['registered_charity','cio','cic_guarantee','cic_shares','unincorporated','ltd_guarantee','cooperative']::text[],
 'organisation', true,
 ARRAY['community']::text[],
 ARRAY[]::text[], ARRAY[]::text[], 'Lewes',
 ARRAY[]::text[],
 '{"parent_programme":"scf_main_grants","shared_application_portal":"https://sussexcf.my.site.com/fundseekerportal/s/login","annual_cycle":true}'::jsonb),

-- 1.5 SCF Rye Fund
('staged-scf-rye-fund', 'sussex_community_foundation',
 'Rye Fund (via SCF Main Grants)', 'Sussex Community Foundation',
 'community_foundation', 'grant',
 1000, 10000, '2026-06-05', false, true, false,
 'unchecked', 'https://sussexcommunityfoundation.org/grants/how-to-apply/main-grants/',
 'Rye Fund operates within SCF Main Grants for projects in the Rye area of East Sussex. Single Main Grants application covers eligibility. Amount and timing follow Main Grants (£1,000–£10,000, deadline 5 June 2026).',
 ARRAY['Geographic focus: Rye and surrounding area','Not-for-profit volunteer-led organisations','Annual income not exceeding £2 million']::text[],
 ARRAY['registered_charity','cio','cic_guarantee','cic_shares','unincorporated','ltd_guarantee','cooperative']::text[],
 'organisation', true,
 ARRAY['community']::text[],
 ARRAY[]::text[], ARRAY[]::text[], 'Rye',
 ARRAY[]::text[],
 '{"parent_programme":"scf_main_grants","shared_application_portal":"https://sussexcf.my.site.com/fundseekerportal/s/login","annual_cycle":true}'::jsonb),

-- 1.6 SCF Chagossian Fund
('staged-scf-chagossian-fund', 'sussex_community_foundation',
 'The Chagossian Fund', 'Sussex Community Foundation',
 'community_foundation', 'grant',
 NULL, NULL, NULL, false, true, false,
 'unchecked', 'https://sussexcommunityfoundation.org/grants/how-to-apply/additional-grants/',
 'Operates within SCF Additional Grants programme. Supports voluntary sector organisations, charities and community groups supporting Chagossian people living in Crawley and other parts of Sussex.',
 ARRAY['Supporting Chagossian people in Crawley or elsewhere in Sussex','Voluntary sector organisations, charities, community groups']::text[],
 ARRAY['registered_charity','cio','cic_guarantee','cic_shares','unincorporated','ltd_guarantee']::text[],
 'organisation', true,
 ARRAY['community']::text[],
 ARRAY['refugees_migrants','ethnic_minorities']::text[],
 ARRAY['refugees_migrants','ethnic_minorities']::text[],
 'Crawley',
 ARRAY[]::text[],
 '{"parent_programme":"scf_additional_grants","status_at_staging":"open","amount_and_deadline_unknown":"Source page does not state amount range or deadline; ingest as null pending admin verification at activation time."}'::jsonb);
