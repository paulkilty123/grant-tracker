const RadioWaveIcon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    {/* Center dot */}
    <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
    {/* Inner arc – upper-right quadrant */}
    <path d="M12 7a5 5 0 0 1 5 5" strokeWidth="2" />
    {/* Outer arc – upper-right quadrant */}
    <path d="M12 3.5a8.5 8.5 0 0 1 8.5 8.5" strokeWidth="1.8" />
    {/* Search handle – diagonal */}
    <line x1="14.1" y1="14.1" x2="19" y2="19" strokeWidth="2.5" />
  </svg>
)

export default RadioWaveIcon
