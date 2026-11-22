// The concierge's face: a service bell on a T-blue disc, with a little sparkle. Decorative.
export default function ConciergeMark({ size = 96 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" aria-hidden="true" focusable="false">
      <circle cx="48" cy="48" r="46" fill="#003DA5" />
      <circle cx="48" cy="48" r="46" fill="none" stroke="#fff" strokeWidth="3" opacity="0.35" />
      {/* bell dome, knob and base */}
      <path d="M22 62 C22 44 33 32 48 32 C63 32 74 44 74 62 Z" fill="#fff" />
      <path d="M30 56 C31 47 36 41 43 38" fill="none" stroke="#003DA5" strokeWidth="3" strokeLinecap="round" opacity="0.35" />
      <rect x="44" y="24" width="8" height="8" rx="2.5" fill="#FFB81C" />
      <rect x="17" y="62" width="62" height="8" rx="4" fill="#FFB81C" />
      {/* sparkle */}
      <path d="M78 22 L80 28 L86 30 L80 32 L78 38 L76 32 L70 30 L76 28 Z" fill="#FFB81C" />
    </svg>
  );
}
