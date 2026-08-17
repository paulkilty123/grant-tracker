# SQL Commands for Audit Follow-Up

## 1. Deactivate Irrelevant Programmes

```sql
-- Deactivate Goldman Sachs and TiE Women programs
UPDATE scraped_grants
SET is_active = false,
    civil_society_relevant = false,
    updated_at = now()
WHERE id IN (
  'dd307785-6c27-4c1a-a19a-8c9572550b55',  -- 10,000 Small Businesses
  'a1f5fc6e-08ca-4ef2-8c74-8cf5efbcc565'   -- TiE Women Program 2026
)
RETURNING id, title, is_active, civil_society_relevant;
```

## 2. Fix Bad URLs - Quick Checks

Once you have corrected URLs, use this pattern to update:

```sql
-- Example: Update Growth Impact Fund with correct URL
UPDATE scraped_grants
SET apply_url = 'https://growthimpactfund.org.uk/become-investment-ready/'
WHERE id = '18dcac42-fa21-4f81-a689-57da1bd0dd92'
RETURNING id, title, apply_url;
```

### Grants Needing URL Investigation:

1. Growth Impact Fund (18dcac42)
   - Current: https://growthimpactfund.org.uk/
   - Look for: /apply, /funding, /invest, /become-investment-ready

2. Big Issue Invest (124a6b30)
   - Current: https://www.bigissueinvest.com/
   - Look for: /invest, /investment, /apply

3. Fredericks Foundation (d33aa458)
   - Current: https://www.fredericksfoundation.org/
   - Look for: /apply, /loans, /grants

4. Runnymede Trust (6492a3f7)
   - Current: https://www.runnymedetrust.org/
   - Look for: /apply, /grants, /funding

5. Woodward Charitable Trust (9881ceae)
   - Current: https://www.woodwardcharitabletrust.org.uk/
   - Look for: /apply, /grants

6. Sainsbury Family Charitable Trusts — Linbury Trust (65ddb4f5)
   - Current: https://www.linburytrust.org.uk/
   - Look for: /apply, /grants, /apply-for-funding

7. The True Colours Trust (85286aab)
   - Current: https://www.truecolourstrust.org.uk/
   - Look for: /apply, /grants

8. The Climate Change Collaboration (3a7ce03a)
   - Current: https://climatechangecollaboration.org.uk/
   - Look for: /grants, /funding, /apply

9. The Alan and Babette Sainsbury Charitable Fund (05d6dbdf)
   - Current: https://abscharitablefund.org.uk/
   - Look for: /apply, /grants, /funding

10. Aurora Trust (e2b9494b)
    - Current: https://auroratrust.org.uk/
    - Look for: /apply, /grants, /funding

11. Gatsby Charitable Foundation (3b836a87)
    - Current: https://www.gatsby.org.uk/
    - Look for: /apply, /funding (note: may have restricted applications)

12. Tesco Stronger Starts (9f370210)
    - Current: https://tescostrongerstarts.org.uk/
    - Look for: /apply, /grants, /community-grants

13. Morrisons Foundation (497400aa)
    - Current: https://www.morrisonsfoundation.com/
    - Look for: /apply, /grants, /funding

14. Rowing Foundation (e045020f)
    - Current: https://therowingfoundation.org.uk/
    - Look for: /apply, /grants, /funding

15. Go! London Fund (19593b12)
    - Current: https://golondon.org.uk/
    - Look for: /apply, /grants, /funding

16. Entrepreneurs' Award in Social Innovation (47ff81ff)
    - Current: https://www.entrepreneurscompany.org/
    - Look for: /apply, /awards, /easi

## 3. Mark Grants as Reviewed

Once you've gone through the 71 valid grants, use this to bulk-mark those that are relevant:

```sql
-- Example: Mark a batch of grants as relevant
UPDATE scraped_grants
SET civil_society_relevant = true
WHERE id IN (
  '7bda3614-cadc-4e46-8414-7ce629cbe2c7',  -- Severn Trent Community Fund
  'c904362e-924f-4bad-82a5-e3c705b0d717',  -- Anglian Water Thriving Communities
  'f4225849-0663-4532-b73e-b8720dd67fb2'   -- Severn Trent Community Fund New Projects
)
RETURNING id, title, civil_society_relevant;
```

## 4. Verify Audit Results

Check current state of needs-review grants:

```sql
SELECT 
  COUNT(*) FILTER (WHERE civil_society_relevant IS NULL) as "Still Needs Review",
  COUNT(*) FILTER (WHERE civil_society_relevant = true) as "Approved as Relevant",
  COUNT(*) FILTER (WHERE civil_society_relevant = false) as "Marked Irrelevant"
FROM scraped_grants
WHERE is_active = true;
```

## 5. Export List of Valid Grants for Bulk Review

```sql
-- Export all 71 valid grants as CSV for external review
SELECT 
  id,
  title,
  funder,
  source,
  apply_url,
  substring(description, 1, 200) as description_excerpt,
  first_seen_at
FROM scraped_grants
WHERE is_active = true 
AND civil_society_relevant IS NULL
AND id NOT IN (
  'dd307785-6c27-4c1a-a19a-8c9572550b55',
  'a1f5fc6e-08ca-4ef2-8c74-8cf5efbcc565',
  '18dcac42-fa21-4f81-a689-57da1bd0dd92',
  '124a6b30-fc2a-4244-9b4e-a4cd5d61ffb0',
  'd33aa458-0eb8-473a-8b28-547cd8557a71',
  '6492a3f7-ab34-4109-8d1a-89b00749b173',
  '9881ceae-7713-4045-aa69-aa537440654e',
  '65ddb4f5-bf2b-4350-80c8-379cbf13fad1',
  '85286aab-8a73-4259-ba56-1b7fa99163cf',
  '3a7ce03a-4fc8-49d4-b87e-f1a904e22e54',
  '05d6dbdf-d370-4d34-9a5b-80540e3b06fa',
  'e2b9494b-b4af-4e29-9843-df8a3980aa3c',
  '3b836a87-fd0e-4d5c-bfdc-b44f7c793eb1',
  '9f370210-144c-44c5-9a8f-f18522ad6e9d',
  '497400aa-4785-41b3-ae15-88e35fe38845',
  'e045020f-3f5b-4457-9b2f-209de9845d5a',
  '19593b12-93e1-4207-a0a6-909fb03d0ad3',
  '47ff81ff-5818-4ff4-821d-fbeec98016bd'
)
ORDER BY source, funder, title;
```

