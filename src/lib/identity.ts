// Server only. Who is calling? Uses the same rule as /api/checkin (userFromRequest): identity comes
// only from a verified Firebase ID token, or the demo player in demo mode. Never from the body.
import { userFromRequest } from "./authServer";

export interface Identity {
  uid: string;
  displayName: string;
  email: string;
  college: string;
}

export async function resolveIdentity(req: Request): Promise<Identity | { error: string; status: number }> {
  const auth = await userFromRequest(req);
  return auth.ok ? auth.user : { error: auth.error, status: auth.status };
}
