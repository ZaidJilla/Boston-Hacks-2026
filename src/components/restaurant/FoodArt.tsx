// Original flat illustrations, one per food category (the `category` field in data/restaurants.json),
// drawn in the signage style: thick black outlines, T-line colors. Used when a restaurant has no photo.
import type { ReactNode } from "react";

const INK = "#000000";
const RED = "#DA291C";
const ORANGE = "#ED8B00";
const GREEN = "#00843D";
const BLUE = "#003DA5";
const AMBER = "#FFB81C";
const BREAD = "#E2A55A";
const BROWN = "#6B3A1E";
const WOOD = "#B07A45";
const CREAM = "#FFF4DC";

/** Soft background tint per category, so the dish stands out. */
export const FOOD_BG: Record<string, string> = {
  pizza: "#FDE3C8",
  burgers: "#FDE7C4",
  chicken: "#FBE0C2",
  tacos: "#FFF0C2",
  sushi: "#DCEFE3",
  chinese: "#FBD9D5",
  korean: "#E4E7EA",
  "thai-viet": "#DDE8F7",
  indian: "#FCE1C9",
  mediterranean: "#E8F1DC",
  italian: "#FBE3DF",
  seafood: "#D9ECF7",
  sandwiches: "#F6EBD7",
  breakfast: "#FDF0D2",
  healthy: "#DDF1E3",
  american: "#FBDCD8",
  dessert: "#FBE2EC",
  coffee: "#EFE4DA",
  other: "#F1F1EF",
};

// Shared stroke style for every shape.
const S = { stroke: INK, strokeWidth: 3, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };

/** A bowl seen from the side, rim at y, used by several dishes. */
const Bowl = ({ fill, rim, y = 60 }: { fill: string; rim: string; y?: number }) => (
  <>
    <path d={`M18 ${y} L102 ${y} Q98 ${y + 40} 60 ${y + 42} Q22 ${y + 40} 18 ${y} Z`} fill={fill} {...S} />
    <ellipse cx="60" cy={y} rx="42" ry="9" fill={rim} {...S} />
  </>
);

const ART: Record<string, ReactNode> = {
  pizza: (
    <>
      <path d="M24 40 L60 106 L96 40 Q60 28 24 40 Z" fill="#FFC94D" {...S} />
      <path d="M18 36 Q60 18 102 36 L97 46 Q60 30 23 46 Z" fill="#D98A3A" {...S} />
      <circle cx="50" cy="56" r="7" fill={RED} {...S} />
      <circle cx="70" cy="58" r="6" fill={RED} {...S} />
      <circle cx="60" cy="80" r="6" fill={RED} {...S} />
      <path d="M44 70 q4 -6 8 0 q-4 6 -8 0 Z" fill={GREEN} {...S} strokeWidth={2} />
    </>
  ),
  burgers: (
    <>
      <path d="M20 84 L100 84 Q100 100 86 100 L34 100 Q20 100 20 84 Z" fill={BREAD} {...S} />
      <rect x="18" y="68" width="84" height="15" rx="7.5" fill={BROWN} {...S} />
      <path d="M20 66 L100 66 L94 76 L82 69 L70 78 L58 69 L46 77 L34 69 L26 75 Z" fill={AMBER} {...S} />
      <path d="M16 62 Q24 54 32 62 Q40 54 48 62 Q56 54 64 62 Q72 54 80 62 Q88 54 96 62 Q102 56 104 62" fill="none" {...S} stroke={GREEN} strokeWidth={6} />
      <path d="M20 58 Q20 22 60 22 Q100 22 100 58 Z" fill={BREAD} {...S} />
      <ellipse cx="46" cy="36" rx="3" ry="1.8" fill={CREAM} />
      <ellipse cx="62" cy="32" rx="3" ry="1.8" fill={CREAM} />
      <ellipse cx="76" cy="40" rx="3" ry="1.8" fill={CREAM} />
      <ellipse cx="54" cy="46" rx="3" ry="1.8" fill={CREAM} />
    </>
  ),
  chicken: (
    <>
      <line x1="56" y1="74" x2="32" y2="98" stroke={INK} strokeWidth={13} strokeLinecap="round" />
      <line x1="56" y1="74" x2="32" y2="98" stroke="#FFFFFF" strokeWidth={7} strokeLinecap="round" />
      <circle cx="26" cy="96" r="7" fill="#FFFFFF" {...S} />
      <circle cx="34" cy="104" r="7" fill="#FFFFFF" {...S} />
      <line x1="40" y1="90" x2="30" y2="100" stroke="#FFFFFF" strokeWidth={7} strokeLinecap="round" />
      <path d="M44 34 C68 12 104 34 92 62 C84 82 64 86 52 78 C38 68 30 48 44 34 Z" fill="#C9772F" {...S} />
      <path d="M58 36 q8 -4 14 2 M70 52 q8 -2 12 4" fill="none" {...S} stroke="#E8A35C" strokeWidth={3} />
    </>
  ),
  tacos: (
    // folded shell seen from the side, tilted, fillings spilling out of the open edge
    <g transform="rotate(-14 60 64)">
      <path d="M16 78 Q22 92 32 86 Q38 98 50 88 Q58 100 70 88 Q80 98 88 86 Q98 92 104 78 Z" fill={GREEN} {...S} />
      <circle cx="40" cy="88" r="4.5" fill={RED} {...S} strokeWidth={2} />
      <circle cx="62" cy="92" r="4.5" fill={RED} {...S} strokeWidth={2} />
      <circle cx="84" cy="88" r="4.5" fill={RED} {...S} strokeWidth={2} />
      <path d="M22 80 Q60 90 98 80" fill="none" stroke={BROWN} strokeWidth={7} strokeLinecap="round" />
      <path d="M12 80 A48 48 0 0 1 108 80 Z" fill="#F2C14E" {...S} />
      <path d="M30 62 l3 3 M50 46 l3 3 M72 46 l3 3 M88 62 l3 3 M60 64 l3 3" {...S} stroke={ORANGE} />
    </g>
  ),
  sushi: (
    <>
      <line x1="18" y1="26" x2="102" y2="40" stroke={WOOD} strokeWidth={6} strokeLinecap="round" />
      <line x1="20" y1="36" x2="104" y2="50" stroke={WOOD} strokeWidth={6} strokeLinecap="round" />
      {/* maki roll */}
      <circle cx="34" cy="80" r="20" fill="#1F3B2D" {...S} />
      <circle cx="34" cy="80" r="14" fill="#FFFFFF" {...S} strokeWidth={2} />
      <circle cx="34" cy="80" r="6.5" fill="#F47B4F" {...S} strokeWidth={2} />
      <circle cx="32" cy="79" r="2.5" fill={GREEN} />
      {/* salmon nigiri */}
      <path d="M62 90 Q62 74 84 74 Q106 74 106 90 Q106 98 84 98 Q62 98 62 90 Z" fill="#FFFFFF" {...S} />
      <path d="M58 80 Q60 62 84 62 Q110 62 110 78 Q100 84 84 84 Q66 84 58 80 Z" fill="#F47B4F" {...S} />
      <path d="M72 66 q4 8 2 16 M86 64 q4 9 2 19 M99 66 q3 7 1 15" fill="none" stroke="#FFD3C2" strokeWidth={2.5} strokeLinecap="round" />
    </>
  ),
  chinese: (
    <>
      <line x1="66" y1="44" x2="86" y2="10" stroke={WOOD} strokeWidth={6} strokeLinecap="round" />
      <line x1="72" y1="46" x2="96" y2="14" stroke={WOOD} strokeWidth={6} strokeLinecap="round" />
      <path d="M42 42 Q60 14 78 42" fill="none" {...S} stroke="#7C878E" />
      <path d="M28 50 L38 36 L82 36 L92 50 Z" fill="#E9E9E6" {...S} />
      <path d="M28 50 L92 50 L83 104 L37 104 Z" fill="#FFFFFF" {...S} />
      <path d="M31.5 66 L88.5 66 L86.6 78 L33.4 78 Z" fill={RED} {...S} />
    </>
  ),
  korean: (
    <>
      <Bowl fill="#3A3F44" rim="#F6EAD2" y={60} />
      <path d="M24 58 Q30 52 38 56 L40 62 Q30 64 24 58 Z" fill={GREEN} {...S} strokeWidth={2} />
      <path d="M78 54 h14 l-2 6 h-14 Z" fill={ORANGE} {...S} strokeWidth={2} />
      <path d="M30 64 h10 l-1 4 h-10 Z" fill={BROWN} {...S} strokeWidth={2} />
      <ellipse cx="60" cy="54" rx="13" ry="7" fill="#FFFFFF" {...S} />
      <circle cx="60" cy="53" r="4.5" fill={AMBER} {...S} strokeWidth={2} />
      <circle cx="84" cy="64" r="3.5" fill={RED} />
    </>
  ),
  "thai-viet": (
    <>
      <line x1="70" y1="56" x2="94" y2="14" stroke={WOOD} strokeWidth={6} strokeLinecap="round" />
      <line x1="78" y1="58" x2="104" y2="20" stroke={WOOD} strokeWidth={6} strokeLinecap="round" />
      <Bowl fill="#FFFFFF" rim="#E7B867" y={60} />
      <path d="M26 74 Q60 82 94 74" fill="none" {...S} stroke={BLUE} strokeWidth={5} />
      <path d="M76 32 Q72 44 78 56 M84 34 Q80 46 86 58 M80 30 Q76 42 82 54" fill="none" stroke="#F5DFA0" strokeWidth={4} strokeLinecap="round" />
      <path d="M32 56 q6 -8 12 0 q-6 6 -12 0 Z" fill={GREEN} {...S} strokeWidth={2} />
      <path d="M48 58 a7 7 0 0 1 12 0 Z" fill="#9BD34A" {...S} strokeWidth={2} />
    </>
  ),
  indian: (
    <>
      <path d="M14 72 Q8 40 42 32 Q70 28 62 60 Q54 86 14 72 Z" fill="#E9C27A" {...S} />
      <circle cx="30" cy="52" r="2.5" fill={BROWN} />
      <circle cx="44" cy="44" r="2.5" fill={BROWN} />
      <circle cx="36" cy="64" r="2.5" fill={BROWN} />
      <path d="M44 64 L106 64 Q102 100 75 102 Q48 100 44 64 Z" fill={ORANGE} {...S} />
      <ellipse cx="75" cy="64" rx="31" ry="8" fill="#C9461B" {...S} />
      <path d="M70 60 q5 -6 10 0 q-5 4 -10 0 Z" fill={GREEN} {...S} strokeWidth={2} />
      <path d="M52 84 Q75 90 98 84" fill="none" {...S} stroke={AMBER} strokeWidth={4} />
    </>
  ),
  mediterranean: (
    <>
      {/* kebab skewer on a pita */}
      <path d="M14 82 Q60 66 106 82 Q60 98 14 82 Z" fill="#EFCB8A" {...S} />
      <g transform="rotate(-12 60 56)">
        <line x1="8" y1="56" x2="112" y2="56" stroke="#7C878E" strokeWidth={4} strokeLinecap="round" />
        {[
          { x: 20, fill: BROWN },
          { x: 40, fill: RED },
          { x: 60, fill: BROWN },
          { x: 80, fill: GREEN },
          { x: 100, fill: BROWN },
        ].map((p) => (
          <rect key={p.x} x={p.x - 9} y="38" width="19" height="36" rx="5" fill={p.fill} {...S} />
        ))}
        <path d="M20 46 v5 M60 46 v5 M100 46 v5" {...S} stroke="#A0613A" strokeWidth={2} />
      </g>
    </>
  ),
  italian: (
    <>
      <ellipse cx="56" cy="80" rx="46" ry="18" fill="#FFFFFF" {...S} />
      <ellipse cx="56" cy="78" rx="32" ry="11" fill="none" {...S} stroke="#D9DCDF" />
      <path d="M30 78 Q32 52 56 50 Q80 52 82 78 Q56 86 30 78 Z" fill="#F2C45A" {...S} />
      <path d="M38 70 Q48 60 58 70 Q66 78 74 66 M42 62 Q54 56 66 62" fill="none" stroke="#D9A23A" strokeWidth={2.5} strokeLinecap="round" />
      <circle cx="56" cy="56" r="9" fill={RED} {...S} />
      <path d="M102 18 v58 M96 18 v14 q0 6 6 6 q6 0 6 -6 v-14" fill="none" {...S} stroke="#7C878E" strokeWidth={3.5} />
    </>
  ),
  seafood: (
    <>
      <path d="M82 60 L104 42 L104 78 Z" fill="#2F6FCF" {...S} />
      <path d="M18 60 Q46 26 84 60 Q46 94 18 60 Z" fill="#4A8FE0" {...S} />
      <path d="M48 44 Q56 34 66 46" fill="#2F6FCF" {...S} />
      <path d="M44 50 Q50 60 44 70" fill="none" {...S} stroke="#1F4E99" />
      <circle cx="32" cy="56" r="4.5" fill="#FFFFFF" {...S} strokeWidth={2} />
      <circle cx="33" cy="56" r="1.8" fill={INK} />
      <path d="M56 58 q4 -4 8 0 M64 64 q4 -4 8 0" fill="none" {...S} stroke="#9CC6F2" strokeWidth={2} />
      <path d="M30 92 q8 -6 16 0 q8 6 16 0 q8 -6 16 0 q8 6 16 0" fill="none" stroke="#4A8FE0" strokeWidth={3} strokeLinecap="round" />
    </>
  ),
  sandwiches: (
    <>
      <rect x="14" y="74" width="92" height="16" rx="8" fill={BREAD} {...S} />
      <rect x="16" y="66" width="88" height="9" rx="3" fill="#F2A1A1" {...S} />
      <path d="M16 64 L104 64 L98 72 L86 66 L74 73 L62 66 L50 73 L38 66 L26 72 Z" fill={AMBER} {...S} />
      <rect x="18" y="58" width="84" height="7" rx="3.5" fill={RED} {...S} />
      <path d="M12 56 Q20 48 28 56 Q36 48 44 56 Q52 48 60 56 Q68 48 76 56 Q84 48 92 56 Q100 48 108 56" fill="none" stroke={GREEN} strokeWidth={6} strokeLinecap="round" />
      <path d="M14 54 Q14 34 34 34 L86 34 Q106 34 106 54 Z" fill={BREAD} {...S} />
      <path d="M34 42 l4 -3 M56 40 l4 -3 M78 42 l4 -3" {...S} stroke={CREAM} />
    </>
  ),
  breakfast: (
    <>
      <ellipse cx="60" cy="94" rx="48" ry="10" fill="#FFFFFF" {...S} />
      {[84, 72, 60].map((y) => (
        <path key={y} d={`M22 ${y} Q22 ${y - 10} 60 ${y - 10} Q98 ${y - 10} 98 ${y} Q98 ${y + 10} 60 ${y + 10} Q22 ${y + 10} 22 ${y} Z`} fill="#E6A85A" {...S} />
      ))}
      <path d="M26 52 Q60 38 94 52 Q90 60 82 58 L80 68 Q76 70 76 64 L74 58 Q60 62 46 58 L44 66 Q40 68 40 62 L38 58 Q30 60 26 52 Z" fill="#8B4513" {...S} />
      <rect x="52" y="36" width="16" height="11" rx="2" fill="#FFE27A" {...S} />
    </>
  ),
  healthy: (
    <>
      <path d="M26 58 Q22 36 40 34 Q44 48 36 58 Z" fill={GREEN} {...S} />
      <path d="M44 56 Q42 26 62 24 Q70 42 56 58 Z" fill="#4FB05E" {...S} />
      <path d="M64 58 Q66 32 88 32 Q90 48 76 60 Z" fill={GREEN} {...S} />
      <circle cx="40" cy="52" r="7" fill={RED} {...S} />
      <path d="M72 46 a9 9 0 0 1 18 0 Q90 58 81 58 Q72 58 72 46 Z" fill="#B5D86A" {...S} />
      <circle cx="81" cy="49" r="3.5" fill={BROWN} />
      <Bowl fill="#FFFFFF" rim="#DDF1E3" y={60} />
      <path d="M26 76 Q60 84 94 76" fill="none" {...S} stroke={GREEN} strokeWidth={5} />
    </>
  ),
  american: (
    <>
      {[
        [42, 28, -8],
        [52, 20, -3],
        [62, 24, 2],
        [72, 18, 6],
        [80, 30, 10],
        [47, 34, 4],
        [67, 32, -4],
      ].map(([x, y, rot]) => (
        <rect key={`${x}-${y}`} x={x - 4} y={y} width="9" height="52" rx="2" fill="#FFD24A" {...S} strokeWidth={2.5} transform={`rotate(${rot} ${x} ${y + 26})`} />
      ))}
      <path d="M32 56 Q60 72 88 56 L80 106 L40 106 Z" fill={BLUE} {...S} />
      <path d="M38 82 Q60 90 82 82" fill="none" stroke="#FFFFFF" strokeWidth={5} strokeLinecap="round" />
    </>
  ),
  dessert: (
    <>
      <path d="M40 60 L80 60 L60 108 Z" fill={BREAD} {...S} />
      <path d="M46 70 L70 94 M54 66 L76 86 M74 70 L52 94 M66 66 L46 84" {...S} stroke="#B87A3A" strokeWidth={2} />
      <circle cx="60" cy="52" r="21" fill="#F4A3C0" {...S} />
      <circle cx="60" cy="28" r="16" fill="#8B5A3C" {...S} />
      <circle cx="62" cy="11" r="5" fill={RED} {...S} />
      <path d="M62 6 q4 -6 8 -6" fill="none" {...S} strokeWidth={2} />
      <path d="M44 58 q4 6 8 0 q4 6 8 0 q4 6 8 0 q4 6 8 0" fill="none" {...S} stroke="#E07BA0" strokeWidth={2} />
    </>
  ),
  coffee: (
    <>
      <path d="M44 30 q-6 -8 0 -16 M58 30 q-6 -8 0 -16 M72 30 q-6 -8 0 -16" fill="none" {...S} stroke="#7C878E" />
      <path d="M86 52 h6 a12 12 0 0 1 0 24 h-6" fill="none" {...S} strokeWidth={6} />
      <path d="M86 52 h6 a12 12 0 0 1 0 24 h-6" fill="none" stroke="#FFFFFF" strokeWidth={2} />
      <path d="M28 40 L88 40 L84 96 Q83 104 74 104 L42 104 Q33 104 32 96 Z" fill="#FFFFFF" {...S} />
      <ellipse cx="58" cy="40" rx="30" ry="6" fill="#6B3A1E" {...S} />
      <rect x="30" y="62" width="56" height="16" fill={BLUE} {...S} />
    </>
  ),
  other: (
    <>
      <circle cx="60" cy="62" r="34" fill="#FFFFFF" {...S} />
      <circle cx="60" cy="62" r="22" fill="none" {...S} stroke="#D9DCDF" />
      <path d="M16 26 v70 M10 26 v14 q0 7 6 7 q6 0 6 -7 v-14" fill="none" {...S} stroke="#7C878E" strokeWidth={3.5} />
      <path d="M104 96 V26 q-10 8 -10 30 q0 8 10 8" fill="#D9DCDF" {...S} stroke="#7C878E" strokeWidth={3.5} />
    </>
  ),
};

export function hasFoodArt(category: string): boolean {
  return category in ART;
}

/** The illustration for a category, or a plate with cutlery when there isn't one. */
export default function FoodArt({ category, className }: { category: string; className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden="true" focusable="false">
      {ART[category] ?? ART.other}
    </svg>
  );
}
