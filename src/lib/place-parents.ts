/**
 * Place → the areas it sits inside, for the matcher's location check.
 *
 * People type the place they know, not the council that funds it: Paws and
 * Pause entered "LONDON" and later "Brixton and Peckham" while Funding
 * Differently is tagged "Southwark" (21 Sept 2026, scored 15). The matcher
 * compares the fund's tag with the org's typed location as text, so a
 * neighbourhood never met its borough and a village never met its district.
 *
 * This table is read the other way round from REGION_HIERARCHY in matching.ts
 * (county → towns, used when the FUND's tag is a county). Here the ORG's place
 * is looked up and its parents are appended to the text the matcher checks,
 * so "brixton" also reads as "lambeth" and "london", and "ratcliffe-on-soar"
 * as "rushcliffe", "nottinghamshire" and "east midlands".
 *
 * Deliberately a plain table: additive, no fuzzy matching, lower-case keys.
 * A place with no entry behaves exactly as before. Add rows as profiles show
 * the gap; never remove a parent that a fund tag uses.
 */

const LONDON: Record<string, string> = {
  // Lambeth
  brixton: 'lambeth', clapham: 'lambeth', streatham: 'lambeth', stockwell: 'lambeth', vauxhall: 'lambeth',
  kennington: 'lambeth', 'herne hill': 'lambeth', 'west norwood': 'lambeth', 'tulse hill': 'lambeth', waterloo: 'lambeth', 'oval': 'lambeth',
  // Southwark
  peckham: 'southwark', camberwell: 'southwark', dulwich: 'southwark', 'east dulwich': 'southwark', bermondsey: 'southwark',
  rotherhithe: 'southwark', 'elephant and castle': 'southwark', walworth: 'southwark', nunhead: 'southwark', 'surrey quays': 'southwark', borough: 'southwark',
  // Lewisham
  deptford: 'lewisham', 'new cross': 'lewisham', brockley: 'lewisham', catford: 'lewisham', 'forest hill': 'lewisham', sydenham: 'lewisham', blackheath: 'lewisham', 'lee': 'lewisham',
  // Greenwich
  woolwich: 'greenwich', eltham: 'greenwich', charlton: 'greenwich', plumstead: 'greenwich', thamesmead: 'greenwich',
  // Croydon
  'thornton heath': 'croydon', norbury: 'croydon', purley: 'croydon', 'new addington': 'croydon', 'south norwood': 'croydon', coulsdon: 'croydon',
  // Wandsworth
  battersea: 'wandsworth', putney: 'wandsworth', tooting: 'wandsworth', balham: 'wandsworth', earlsfield: 'wandsworth', roehampton: 'wandsworth',
  // Merton
  wimbledon: 'merton', mitcham: 'merton', morden: 'merton', 'colliers wood': 'merton',
  // Sutton, Kingston, Richmond, Bromley, Bexley
  carshalton: 'sutton', wallington: 'sutton', cheam: 'sutton',
  'new malden': 'kingston upon thames', surbiton: 'kingston upon thames', chessington: 'kingston upon thames',
  twickenham: 'richmond upon thames', teddington: 'richmond upon thames', barnes: 'richmond upon thames', 'kew': 'richmond upon thames',
  beckenham: 'bromley', orpington: 'bromley', 'crystal palace': 'bromley', penge: 'bromley', 'biggin hill': 'bromley',
  sidcup: 'bexley', erith: 'bexley', welling: 'bexley', crayford: 'bexley',
  // Hammersmith & Fulham, Kensington & Chelsea, Westminster
  'shepherds bush': 'hammersmith', "shepherd's bush": 'hammersmith', 'white city': 'hammersmith',
  'notting hill': 'kensington', 'north kensington': 'kensington', 'ladbroke grove': 'kensington', 'earls court': 'kensington',
  paddington: 'westminster', pimlico: 'westminster', 'maida vale': 'westminster', soho: 'westminster', marylebone: 'westminster', 'church street': 'westminster',
  // Camden, Islington, Hackney, Tower Hamlets
  'kentish town': 'camden', 'camden town': 'camden', hampstead: 'camden', 'kings cross': 'camden', "king's cross": 'camden', 'somers town': 'camden', kilburn: 'camden', holborn: 'camden',
  finsbury: 'islington', 'finsbury park': 'islington', holloway: 'islington', archway: 'islington', angel: 'islington', clerkenwell: 'islington', highbury: 'islington',
  dalston: 'hackney', shoreditch: 'hackney', hoxton: 'hackney', homerton: 'hackney', 'stoke newington': 'hackney', clapton: 'hackney', 'stamford hill': 'hackney', haggerston: 'hackney',
  'bethnal green': 'tower hamlets', whitechapel: 'tower hamlets', bow: 'tower hamlets', poplar: 'tower hamlets', 'isle of dogs': 'tower hamlets', stepney: 'tower hamlets', 'mile end': 'tower hamlets', limehouse: 'tower hamlets', shadwell: 'tower hamlets', wapping: 'tower hamlets',
  // Newham, Barking & Dagenham, Havering, Redbridge, Waltham Forest
  stratford: 'newham', 'east ham': 'newham', 'west ham': 'newham', plaistow: 'newham', 'canning town': 'newham', 'forest gate': 'newham', beckton: 'newham', 'custom house': 'newham',
  barking: 'barking and dagenham', dagenham: 'barking and dagenham',
  romford: 'havering', hornchurch: 'havering', upminster: 'havering', rainham: 'havering',
  ilford: 'redbridge', wanstead: 'redbridge', woodford: 'redbridge', chadwell: 'redbridge',
  walthamstow: 'waltham forest', leyton: 'waltham forest', leytonstone: 'waltham forest', chingford: 'waltham forest',
  // Haringey, Enfield, Barnet, Harrow, Brent
  tottenham: 'haringey', 'wood green': 'haringey', 'crouch end': 'haringey', hornsey: 'haringey', highgate: 'haringey', 'muswell hill': 'haringey',
  edmonton: 'enfield', 'palmers green': 'enfield', southgate: 'enfield', 'ponders end': 'enfield',
  finchley: 'barnet', hendon: 'barnet', edgware: 'barnet', 'golders green': 'barnet', 'high barnet': 'barnet', 'burnt oak': 'barnet',
  wembley: 'brent', willesden: 'brent', harlesden: 'brent', neasden: 'brent', 'stonebridge': 'brent',
  wealdstone: 'harrow', pinner: 'harrow', stanmore: 'harrow',
  // Ealing, Hounslow, Hillingdon
  acton: 'ealing', southall: 'ealing', hanwell: 'ealing', greenford: 'ealing', northolt: 'ealing',
  feltham: 'hounslow', chiswick: 'hounslow', brentford: 'hounslow', isleworth: 'hounslow',
  uxbridge: 'hillingdon', hayes: 'hillingdon', ruislip: 'hillingdon', northwood: 'hillingdon', 'west drayton': 'hillingdon',
}

/** Outside London: place → district, then county or city-region. Grow as profiles show the gap. */
const ENGLAND: Record<string, string[]> = {
  // Nottinghamshire
  'ratcliffe-on-soar': ['rushcliffe', 'nottinghamshire', 'east midlands'], 'ratcliffe on soar': ['rushcliffe', 'nottinghamshire', 'east midlands'],
  'west bridgford': ['rushcliffe', 'nottinghamshire', 'east midlands'], bingham: ['rushcliffe', 'nottinghamshire', 'east midlands'],
  beeston: ['broxtowe', 'nottinghamshire', 'east midlands'], stapleford: ['broxtowe', 'nottinghamshire', 'east midlands'],
  arnold: ['gedling', 'nottinghamshire', 'east midlands'], carlton: ['gedling', 'nottinghamshire', 'east midlands'],
  hucknall: ['ashfield', 'nottinghamshire', 'east midlands'], 'sutton-in-ashfield': ['ashfield', 'nottinghamshire', 'east midlands'], 'kirkby-in-ashfield': ['ashfield', 'nottinghamshire', 'east midlands'],
  mansfield: ['nottinghamshire', 'east midlands'], worksop: ['bassetlaw', 'nottinghamshire', 'east midlands'], retford: ['bassetlaw', 'nottinghamshire', 'east midlands'],
  newark: ['newark and sherwood', 'nottinghamshire', 'east midlands'], nottingham: ['nottinghamshire', 'east midlands'],
  // East Riding and Hull. No "yorkshire" parents on purpose: the matcher
  // compares by substring and a "York" tag would meet "yorkshire" (Men in
  // Sheds Hull gained York micro grants on the first A/B, 21 Sept 2026).
  bridlington: ['east riding'], beverley: ['east riding'], driffield: ['east riding'], goole: ['east riding'],
  // Suffolk
  sudbury: ['babergh', 'suffolk', 'east anglia', 'east of england'], hadleigh: ['babergh', 'suffolk', 'east anglia', 'east of england'],
  stowmarket: ['mid suffolk', 'suffolk', 'east anglia', 'east of england'], 'bury st edmunds': ['west suffolk', 'suffolk', 'east anglia', 'east of england'],
  haverhill: ['west suffolk', 'suffolk', 'east anglia', 'east of england'], newmarket: ['west suffolk', 'suffolk', 'east anglia', 'east of england'],
  ipswich: ['suffolk', 'east anglia', 'east of england'], lowestoft: ['east suffolk', 'suffolk', 'east anglia', 'east of england'],
  felixstowe: ['east suffolk', 'suffolk', 'east anglia', 'east of england'], woodbridge: ['east suffolk', 'suffolk', 'east anglia', 'east of england'],
  // Essex
  colchester: ['essex', 'east of england'], chelmsford: ['essex', 'east of england'], braintree: ['essex', 'east of england'],
  'saffron walden': ['uttlesford', 'essex', 'east of england'], maldon: ['essex', 'east of england'], witham: ['braintree', 'essex', 'east of england'],
  clacton: ['tendring', 'essex', 'east of england'], harwich: ['tendring', 'essex', 'east of england'], 'southend-on-sea': ['southend', 'essex', 'east of england'],
  basildon: ['essex', 'east of england'], brentwood: ['essex', 'east of england'], harlow: ['essex', 'east of england'],
  // Greater Manchester
  salford: ['greater manchester', 'north west'], stockport: ['greater manchester', 'north west'], oldham: ['greater manchester', 'north west'],
  rochdale: ['greater manchester', 'north west'], bury: ['greater manchester', 'north west'], bolton: ['greater manchester', 'north west'],
  wigan: ['greater manchester', 'north west'], tameside: ['greater manchester', 'north west'], trafford: ['greater manchester', 'north west'],
  manchester: ['greater manchester', 'north west'], 'ashton-under-lyne': ['tameside', 'greater manchester', 'north west'], altrincham: ['trafford', 'greater manchester', 'north west'],
  // West Yorkshire: same substring trap ("west yorkshire" contains "york"), so
  // only the district goes in where the town is not the district.
  huddersfield: ['kirklees'], halifax: ['calderdale'], dewsbury: ['kirklees'],
  // Merseyside
  liverpool: ['merseyside', 'liverpool city region', 'north west'], birkenhead: ['wirral', 'merseyside', 'liverpool city region', 'north west'],
  bootle: ['sefton', 'merseyside', 'liverpool city region', 'north west'], 'st helens': ['merseyside', 'liverpool city region', 'north west'],
  // West Midlands
  birmingham: ['west midlands'], coventry: ['west midlands'], wolverhampton: ['west midlands', 'black country'], walsall: ['west midlands', 'black country'],
  dudley: ['west midlands', 'black country'], 'west bromwich': ['sandwell', 'west midlands', 'black country'], solihull: ['west midlands'],
  // Dorset (Sam, 16 Sept)
  bournemouth: ['bcp', 'bournemouth, christchurch and poole', 'dorset', 'south west'], poole: ['bcp', 'bournemouth, christchurch and poole', 'dorset', 'south west'],
  christchurch: ['bcp', 'bournemouth, christchurch and poole', 'dorset', 'south west'],
}

const SPLIT = /\s*(?:,|&|\band\b|\/)\s*/i

/**
 * Areas the org's typed place sits inside, lower-case, deduplicated.
 * "Brixton and Peckham" → lambeth, southwark, london. Unknown places → [].
 */
export function placeParents(place: string | null | undefined): string[] {
  if (!place) return []
  const out = new Set<string>()
  for (const raw of place.toLowerCase().split(SPLIT)) {
    const p = raw.trim().replace(/\s+/g, ' ')
    if (!p) continue
    const borough = LONDON[p]
    if (borough) { out.add(borough); out.add('london') }
    for (const parent of ENGLAND[p] ?? []) out.add(parent)
  }
  return Array.from(out)
}
