// Server only. Verifies Firebase ID tokens. Never trust a uid sent in a request body
// outside demo mode: the repo is public and anyone can call the API.
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { collegeFromEmail } from "./colleges";
import { DEMO_MODE } from "./config";
import { DEMO_USER } from "./seedData";
import type { StoreUser } from "./store";

function adminConfigured(): boolean {
  const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env;
  return Boolean(FIREBASE_PROJECT_ID && FIREBASE_CLIENT_EMAIL && FIREBASE_PRIVATE_KEY);
}

export async function verifyIdToken(
  token: string | null,
): Promise<{ uid: string; email: string; name: string } | null> {
  if (!token || !adminConfigured()) return null;
  const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env;
  try {
    const app =
      getApps()[0] ??
      initializeApp({
        credential: cert({
          projectId: FIREBASE_PROJECT_ID,
          clientEmail: FIREBASE_CLIENT_EMAIL,
          privateKey: FIREBASE_PRIVATE_KEY!.replace(/\\n/g, "\n"),
        }),
      });
    const decoded = await getAuth(app).verifyIdToken(token);
    return { uid: decoded.uid, email: decoded.email ?? "", name: (decoded.name as string | undefined) ?? "" };
  } catch {
    return null;
  }
}

export type AuthResult = { ok: true; user: StoreUser } | { ok: false; status: 401; error: string };

/**
 * Who is making this request?
 * 1. A valid `Authorization: Bearer <Firebase ID token>` always wins.
 * 2. A token that was sent but fails verification (e.g. expired) is rejected, never quietly
 *    downgraded to the demo player (that would credit a real user's meal to Demo Student).
 *    Exception: if the server has no Firebase Admin keys it can't verify anything, so tokens are ignored.
 * 3. No token: the demo player in demo mode (optionally with body hints), otherwise 401.
 */
export async function userFromRequest(req: Request, demoHint: Partial<StoreUser> = {}): Promise<AuthResult> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;

  if (token && adminConfigured()) {
    const verified = await verifyIdToken(token);
    if (!verified) return { ok: false, status: 401, error: "Your session expired. Sign in again" };
    return {
      ok: true,
      user: {
        uid: verified.uid,
        email: verified.email,
        displayName: verified.name || "Student",
        college: collegeFromEmail(verified.email),
      },
    };
  }

  if (DEMO_MODE) {
    return {
      ok: true,
      user: {
        uid: demoHint.uid || DEMO_USER.uid,
        displayName: demoHint.displayName || DEMO_USER.displayName,
        email: demoHint.email || DEMO_USER.email,
        college: demoHint.college || DEMO_USER.college,
      },
    };
  }
  return { ok: false, status: 401, error: "Sign in to check in" };
}
