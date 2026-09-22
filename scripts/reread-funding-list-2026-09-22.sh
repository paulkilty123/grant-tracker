#!/bin/zsh
# Re-read the 22 Sept funding-list rows the way the review queue's Re-read
# button does: enrich-grant, classify-grants, verify-rows. Paul's go, 22 Sept,
# at about 2.4p a row on the production key.
#   ./scripts/reread-funding-list-2026-09-22.sh <ids...>
set -u
cd "$(dirname "$0")/.."
SECRET=$(grep '^ADMIN_SECRET=' .env.local | cut -d= -f2- | tr -d '"')
BASE=https://www.shootsfunding.co.uk
n=0; ok=0
for id in "$@"; do
  n=$((n+1))
  t=$(date +%H:%M:%S)
  e=$(curl -s -m 120 -X POST "$BASE/api/admin/enrich-grant" -H "Authorization: Bearer $SECRET" -H 'Content-Type: application/json' -d "{\"grantId\":\"$id\"}")
  es=$(echo "$e" | python3 -c 'import sys,json
try:
  j=json.load(sys.stdin); print("ok" if j.get("ok",True) and not j.get("error") else "ERR "+str(j.get("error"))[:80], "| brief:"+str(j.get("brief_source") or j.get("source") or "")[:20], "| rejected:"+str(len(j.get("rejected") or [])))
except Exception as ex: print("ERR nojson")')
  c=$(curl -s -m 120 -X POST "$BASE/api/admin/classify-grants" -H "Authorization: Bearer $SECRET" -H 'Content-Type: application/json' -d "{\"grant_ids\":[\"$id\"],\"include_review\":true,\"force\":true,\"preserve_empty\":true}")
  cs=$(echo "$c" | python3 -c 'import sys,json
try:
  j=json.load(sys.stdin); print("ok" if not j.get("error") else "ERR "+str(j.get("error"))[:60])
except Exception: print("ERR nojson")')
  v=$(curl -s -m 180 "$BASE/api/cron/verify-rows?ids=$id&run=true" -H "Authorization: Bearer $SECRET")
  vs=$(echo "$v" | python3 -c 'import sys,json
try:
  j=json.load(sys.stdin); o=(j.get("verify") or {}).get("outcomes") or {}; print("ran" if j.get("ranWork") else "skipped:"+str(j.get("skipped")), "|", ",".join(f"{k}={x}" for k,x in o.items()), "| failures", (j.get("verify") or {}).get("failures"))
except Exception: print("ERR nojson")')
  echo "$n/$# $t ${id:0:8} enrich[$es] classify[$cs] verify[$vs]"
  [[ "$es" == ok* && "$cs" == ok* ]] && ok=$((ok+1))
done
echo "DONE $ok of $n rows enriched and re-tagged"
