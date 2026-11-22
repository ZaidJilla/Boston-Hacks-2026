// A little side-view subway train (engine and one car) heading right, in the rank's color. Decorative.
export default function Train({ color, width = 64 }: { color: string; width?: number }) {
  const h = width * (28 / 84);
  return (
    <svg width={width} height={h} viewBox="0 0 84 28" aria-hidden="true" focusable="false" className="train-chug block overflow-visible">
      {/* car */}
      <rect x="1" y="3" width="36" height="19" rx="5" fill="#fff" stroke={color} strokeWidth="2.5" />
      <rect x="1" y="14" width="36" height="4" fill={color} />
      <rect x="6" y="7" width="7" height="6" rx="1.5" fill={color} opacity="0.85" />
      <rect x="16" y="7" width="7" height="6" rx="1.5" fill={color} opacity="0.85" />
      <rect x="26" y="7" width="7" height="6" rx="1.5" fill={color} opacity="0.85" />
      {/* coupler */}
      <rect x="36" y="13" width="6" height="3" fill="#8A9097" />
      {/* engine, nose to the right */}
      <path d="M42 22 V8 Q42 3 47 3 H68 Q80 3 83 15 L83 22 Z" fill={color} stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
      <path d="M62 7 H69 Q75 7 77 14 H62 Z" fill="#fff" opacity="0.95" />
      <rect x="47" y="7" width="9" height="7" rx="1.5" fill="#fff" opacity="0.95" />
      <circle cx="81" cy="17" r="1.8" fill="#FFB81C" />
      {/* wheels */}
      {[10, 28, 52, 72].map((x) => (
        <circle key={x} cx={x} cy="24" r="3.2" fill="#111" stroke="#fff" strokeWidth="1.2" />
      ))}
    </svg>
  );
}
