/**
 * The style every card-header link on the dashboard uses.
 *
 * Shared rather than inlined five times because that is exactly the set that
 * drifts: before this existed, four of the six were `#3B6D11` and none of them
 * were underlined.
 *
 * THE RULE: #3B6D11 means "this is true", never "go here". Green is reserved
 * for status — "Ready to match" is a state and keeps it. Navigation is --deep.
 * Both pass contrast (green 6.21:1, deep 11.88:1 on white), so this is
 * consistency rather than accessibility, but a colour that means two things
 * means neither.
 *
 * The 1.5px rule is what makes these read as links rather than as coloured
 * text. It is a border-bottom rather than text-decoration so it clears the
 * descenders and sits at a controlled distance.
 */
export const CARD_LINK: React.CSSProperties = {
  fontFamily: 'var(--font-space-grotesk)',
  fontSize: 13.5,
  fontWeight: 600,
  color: '#1D3C3E',
  textDecoration: 'none',
  borderBottom: '1.5px solid rgba(29,60,62,0.28)',
  paddingBottom: 1,
  whiteSpace: 'nowrap',
}
