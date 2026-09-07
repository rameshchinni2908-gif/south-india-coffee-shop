/** Inline artwork keeps the welcome screen independent of image downloads. */
export const CoffeeCup = () => (
  <svg viewBox="0 0 240 220" width="240" height="220" aria-hidden="true" focusable="false">
    <circle cx="120" cy="110" r="95" fill="#f1dfc2" />
    <circle cx="120" cy="110" r="80" fill="none" stroke="#d9b987" strokeDasharray="2 9" />
    <ellipse cx="120" cy="187" rx="76" ry="10" fill="#442012" opacity=".1" />
    <path d="M42 160h156l-14 19c-23 14-105 14-128 0z" fill="#b87935" />
    <ellipse cx="120" cy="160" rx="78" ry="17" fill="#e5bb75" stroke="#8a5429" strokeWidth="2" />
    <ellipse cx="120" cy="159" rx="58" ry="9" fill="#c3904c" />
    <path d="M77 89h86l-10 65c-2 18-64 18-66 0z" fill="#d5a456" stroke="#8a5429" strokeWidth="2" />
    <path d="m87 99 8 51c1 5 7 7 11 7l-5-58z" fill="#f6d99b" />
    <path d="m148 100-7 54" fill="none" stroke="#ae7535" strokeWidth="5" />
    <ellipse cx="120" cy="89" rx="43" ry="12" fill="#f5d492" stroke="#8a5429" strokeWidth="2" />
    <ellipse cx="120" cy="90" rx="36" ry="8" fill="#6f3219" />
    <path
      d="M94 90c12-5 39-5 51 0"
      fill="none"
      stroke="#e9bc7d"
      strokeWidth="3"
      strokeLinecap="round"
    />
    <g fill="none" stroke="#a85d36" strokeWidth="3" strokeLinecap="round">
      <path className="coffee-steam" d="M103 67c-13-13 12-17 0-31" />
      <path className="coffee-steam coffee-steam-middle" d="M121 62c-13-13 12-17 0-31" />
      <path className="coffee-steam coffee-steam-last" d="M139 67c-13-13 12-17 0-31" />
    </g>
  </svg>
);
