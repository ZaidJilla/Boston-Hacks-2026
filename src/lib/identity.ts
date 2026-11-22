// Server only. Who is calling? Same rules as /api/checkin: identity comes only from a verified
// Firebase ID token. Without Firebase Admin the header is ignored and demo mode uses the demo user.
import { DEMO_MODE } from "./config";
import { adminConfigured, verifyIdToken } from "./authServer";
import { collegeFromEmail } from "./colleges";

export interface Identity {
  uid: string;
  displayName: string;
  email: string;
  college: string;
}

export async function resolveIdentity(req: Request): Promise<Identity | { error: string; status: number }> {
  const header = req.headers.get("authorization");
  const canVerify = adminConfigured();
  const verified = header && canVerify ? await verifyIdToken(header.replace(/^Bearer\s+/i, "")) : null;
  if (header && canVerify && !verified) return { error: "Your session expired. Sign in again.", status: 401 };
  if (!verified && !DEMO_MODE) return { error: "Sign in first", status: 401 };
  return {
    uid: verified?.uid ?? "demo-user",
    displayName: verified ? verified.name || "Student" : "Demo Student",
    email: verified?.email ?? "",
    college: verified ? collegeFromEmail(verified.email) : "Northeastern",
  };
}
