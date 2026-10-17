/** In-house SVG illustrations. Colors come from CSS variables so they follow light and dark themes. */
const c = (n: string) => `rgb(var(--${n}))`;

export function HeroArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 520 360" className={className} role="img" aria-label="A lecture video turning into a study guide, flashcards and a quiz">
      <defs>
        <linearGradient id="hg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={c('brand-100')} /><stop offset="1" stopColor={c('sun-100')} /></linearGradient>
        <filter id="sh" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="8" stdDeviation="10" floodColor="#1c2028" floodOpacity=".14" /></filter>
      </defs>
      <ellipse cx="270" cy="190" rx="240" ry="160" fill="url(#hg)" />
      <circle cx="450" cy="60" r="26" fill={c('sun-500')} opacity=".9" className="animate-floaty" />
      <circle cx="60" cy="300" r="14" fill={c('coral-500')} opacity=".85" />
      <circle cx="480" cy="290" r="9" fill={c('grape-500')} opacity=".8" />
      {/* video card */}
      <g filter="url(#sh)" className="animate-floaty" style={{ animationDelay: '.3s' }}>
        <rect x="36" y="86" width="190" height="124" rx="18" fill={c('surface')} />
        <rect x="46" y="96" width="170" height="86" rx="12" fill={c('ink')} opacity=".92" />
        <circle cx="131" cy="139" r="22" fill={c('coral-500')} />
        <path d="M124 128l18 11-18 11z" fill="#fff" />
        <rect x="46" y="192" width="104" height="7" rx="3.5" fill={c('line')} />
        <rect x="46" y="204" width="60" height="5" rx="2.5" fill={c('line')} opacity=".7" />
      </g>
      {/* arrow + sparkle */}
      <path d="M232 150c22-2 34 6 50 18" stroke={c('brand-500')} strokeWidth="4" strokeLinecap="round" strokeDasharray="2 9" fill="none" />
      <path d="M296 120l5 11 11 5-11 5-5 11-5-11-11-5 11-5z" fill={c('sun-500')} />
      {/* study guide doc */}
      <g filter="url(#sh)" className="animate-floaty" style={{ animationDelay: '.9s' }}>
        <rect x="310" y="40" width="150" height="190" rx="16" fill={c('surface')} />
        <rect x="310" y="40" width="150" height="46" rx="16" fill={c('brand-600')} />
        <rect x="310" y="70" width="150" height="16" fill={c('brand-600')} />
        <rect x="326" y="55" width="72" height="9" rx="4.5" fill="#fff" opacity=".95" />
        {[100, 118, 136, 172, 190].map((y, i) => <rect key={y} x="326" y={y} width={i === 2 ? 70 : 118} height="7" rx="3.5" fill={c('line')} />)}
        <rect x="326" y="150" width="118" height="16" rx="6" fill={c('sun-100')} />
        <rect x="334" y="155" width="80" height="6" rx="3" fill={c('sun-500')} />
        <circle cx="440" cy="208" r="9" fill={c('brand-100')} /><path d="M435.500 208l3 3 6-6" stroke={c('brand-600')} strokeWidth="2.500" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      {/* flashcards */}
      <g filter="url(#sh)" className="animate-floaty" style={{ animationDelay: '1.4s' }}>
        <rect x="90" y="236" width="130" height="86" rx="14" fill={c('grape-100')} transform="rotate(-8 155 279)" />
        <rect x="96" y="232" width="130" height="86" rx="14" fill={c('sky-100')} transform="rotate(-2 161 275)" />
        <rect x="104" y="232" width="130" height="86" rx="14" fill={c('surface')} />
        <rect x="120" y="252" width="62" height="8" rx="4" fill={c('brand-600')} />
        <rect x="120" y="270" width="96" height="6" rx="3" fill={c('line')} /><rect x="120" y="284" width="80" height="6" rx="3" fill={c('line')} />
        <circle cx="214" cy="304" r="5" fill={c('coral-500')} />
      </g>
      {/* quiz */}
      <g filter="url(#sh)" className="animate-floaty" style={{ animationDelay: '2s' }}>
        <rect x="290" y="250" width="170" height="78" rx="14" fill={c('surface')} />
        {[0, 1, 2].map((i) => (
          <g key={i}><circle cx="312" cy={270 + i * 20} r="6" fill={i === 1 ? c('brand-500') : 'none'} stroke={i === 1 ? c('brand-500') : c('line')} strokeWidth="2" /><rect x="326" y={266 + i * 20} width={i === 1 ? 110 : 90} height="7" rx="3.500" fill={i === 1 ? c('brand-100') : c('line')} /></g>
        ))}
      </g>
    </svg>
  );
}

export function EmptyArt({ kind = 'books', className = 'h-36 w-auto' }: { kind?: 'books' | 'cards' | 'chart' | 'trophy'; className?: string }) {
  return (
    <svg viewBox="0 0 200 140" className={className} aria-hidden="true">
      <ellipse cx="100" cy="124" rx="70" ry="9" fill={c('line')} />
      {kind === 'books' && (<g>
        <rect x="46" y="62" width="30" height="62" rx="5" fill={c('brand-500')} /><rect x="80" y="44" width="30" height="80" rx="5" fill={c('coral-500')} />
        <rect x="114" y="70" width="30" height="54" rx="5" fill={c('sun-500')} /><rect x="148" y="56" width="22" height="68" rx="5" fill={c('sky-500')} />
        <rect x="52" y="74" width="18" height="4" rx="2" fill="#fff" opacity=".8" /><rect x="86" y="58" width="18" height="4" rx="2" fill="#fff" opacity=".8" />
        <circle cx="100" cy="26" r="9" fill={c('sun-500')} opacity=".7" className="animate-floaty" />
      </g>)}
      {kind === 'cards' && (<g>
        <rect x="52" y="40" width="96" height="68" rx="10" fill={c('grape-100')} transform="rotate(-10 100 74)" />
        <rect x="52" y="38" width="96" height="68" rx="10" fill={c('sky-100')} transform="rotate(-3 100 72)" />
        <rect x="52" y="36" width="96" height="68" rx="10" fill={c('surface')} stroke={c('line')} strokeWidth="2" />
        <rect x="66" y="52" width="40" height="7" rx="3.500" fill={c('brand-600')} /><rect x="66" y="68" width="68" height="5" rx="2.500" fill={c('line')} /><rect x="66" y="80" width="52" height="5" rx="2.500" fill={c('line')} />
      </g>)}
      {kind === 'chart' && (<g>
        <rect x="46" y="86" width="22" height="38" rx="5" fill={c('brand-200')} /><rect x="76" y="64" width="22" height="60" rx="5" fill={c('brand-400')} />
        <rect x="106" y="74" width="22" height="50" rx="5" fill={c('brand-500')} /><rect x="136" y="40" width="22" height="84" rx="5" fill={c('brand-600')} />
        <path d="M52 70L88 48l30 12 40-30" stroke={c('coral-500')} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </g>)}
      {kind === 'trophy' && (<g>
        <path d="M70 30h60v28c0 20-14 32-30 32S70 78 70 58z" fill={c('sun-500')} /><rect x="90" y="88" width="20" height="16" fill={c('sun-600')} /><rect x="74" y="104" width="52" height="12" rx="5" fill={c('sun-600')} />
        <path d="M70 38H52c0 18 8 28 20 30M130 38h18c0 18-8 28-20 30" stroke={c('sun-500')} strokeWidth="6" fill="none" strokeLinecap="round" />
        <path d="M100 42l5 10 11 1-8 8 2 11-10-6-10 6 2-11-8-8 11-1z" fill="#fff" opacity=".9" />
      </g>)}
    </svg>
  );
}

export function CelebrateArt({ className = 'h-40 w-auto' }: { className?: string }) { return <EmptyArt kind="trophy" className={className} />; }

const ICONS: Record<string, string> = {
  graduation: 'M12 3 2 8l10 5 8-4v6h2V8L12 3Zm-6 9.500V16c0 1.700 2.700 3 6 3s6-1.300 6-3v-3.500l-6 3-6-3Z',
  rocket: 'M12 2c3 2 5 5 5 9l2 3-3 1-1 3-3-2-3 2-1-3-3-1 2-3c0-4 2-7 5-9Zm0 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z',
  stethoscope: 'M6 3v6a4 4 0 0 0 8 0V3h-2v6a2 2 0 0 1-4 0V3H6Zm4 12v1a5 5 0 0 0 10 0v-1.100a3 3 0 1 0-2 0V16a3 3 0 0 1-6 0v-1h-2Z',
  heart: 'M12 21s-8-5.300-8-11a4.500 4.500 0 0 1 8-2.800A4.500 4.500 0 0 1 20 10c0 5.700-8 11-8 11Z',
  pill: 'M8.500 3.500a5 5 0 0 1 7 7l-5 5a5 5 0 0 1-7-7l5-5Zm1.400 1.400L7 7.800l5.200 5.200 2.900-2.900a3.500 3.500 0 0 0-5.200-5.200ZM14 14l5.500 5.500a2 2 0 0 0 2.800-2.800L16.800 11.200 14 14Z',
  clipboard: 'M9 2h6v2h3a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3V2Zm1.500 1.500v1h3v-1h-3ZM8 10h8v1.500H8V10Zm0 3.500h8V15H8v-1.500Zm0 3.500h5v1.500H8V17Z',
  hand: 'M9 11V5a1.500 1.500 0 0 1 3 0v5h1V4a1.500 1.500 0 0 1 3 0v6h1V6a1.500 1.500 0 0 1 3 0v8c0 4-3 7-7 7h-1c-3 0-5-2-6.500-5l-1.500-3a1.500 1.500 0 0 1 2.500-1.500L9 14v-3Z',
  calculator: 'M6 2h12a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Zm1.500 2.500v4h9v-4h-9ZM8 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2Zm4 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2Zm4 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2ZM8 15a1 1 0 1 0 0 2 1 1 0 0 0 0-2Zm4 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2Zm4 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z',
};
export function ProgramIcon({ name, className = 'h-6 w-6' }: { name: string; className?: string }) {
  return <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true"><path d={ICONS[name] || ICONS.graduation} /></svg>;
}
