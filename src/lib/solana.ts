// Server only. Solana devnet. Never throws: falls back to fake values. Real calls: Person 4.
import { demoBadgeMint, demoTxSignature } from "./demo";

const configured = () => Boolean(process.env.SOLANA_PRIVATE_KEY);

/** Mint a neighborhood badge NFT to the player. Returns the mint address. */
export async function mintBadge(_uid: string, _neighborhood: string): Promise<string> {
  if (!configured()) return demoBadgeMint();
  try {
    // TODO(Person 4): create a 0-decimal SPL mint (supply 1) with @solana/spl-token,
    // keep the mint address in unlocks.badge_mint.
    return demoBadgeMint();
  } catch {
    return demoBadgeMint();
  }
}

/** Write a check-in on-chain with the Memo program. Returns the tx signature. */
export async function logCheckin(_payload: Record<string, unknown>): Promise<string> {
  if (!configured()) return demoTxSignature();
  try {
    // TODO(Person 4): send a Memo instruction with a compact JSON payload.
    return demoTxSignature();
  } catch {
    return demoTxSignature();
  }
}
