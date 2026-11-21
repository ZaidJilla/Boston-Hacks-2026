// Server only. Verifies Firebase ID tokens. Never trust a uid sent in a request body
// outside demo mode: the repo is public and anyone can call the API.
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { collegeFromEmail } from "./colleges";
import { DEMO_MODE } from "./config";
import { DEMO_USER } from "./seedData";
import type { StoreUser } from "./store";

export async function verifyIdToken(
  token: string | null,
): Promise<{ uid: string; email: string; name: string } | null> {
  const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env;
  if (!token || !FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) return null;
  try {
    const app =
      getApps()[0] ??
      initializeApp({
        credential: cert({
          projectId: FIREBASE_PROJECT_ID,
          clientEmail: FIREBASE_CLIENT_EMAIL,
          privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
        }),
      });
    const decoded = await getAuth(app).verifyIdToken(token);
    return { uid: decoded.uid, email: decoded.email ?? "", name: (decoded.name as string | undefined) ?? "" };
  } catch {
    return null;
  }
}

/**
 * Who is making this request?
 * 1. A valid `Authorization: Bearer <Firebase ID token>` always wins.
 * 2. Otherwise, in demo mode only, fall back to the demo user (optionally with body hints).
 * 3. Otherwise null, and the route answers 401.
 */
export async function userFromRequest(
  req: Request,
  demoHint: Partial<StoreUser> = {},
): Promise<StoreUser | null> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  const verified = await verifyIdToken(token);
  if (verified) {
    return {
      uid: verified.uid,
      email: verified.email,
      displayName: verified.name || "Student",
      college: collegeFromEmail(verified.email),
    };
  }

  if (DEMO_MODE) {
    // Body hints only matter while CheckinPanel doesn't send a token yet.
    return {
      uid: demoHint.uid || DEMO_USER.uid,
      displayName: demoHint.displayName || DEMO_USER.displayName,
      email: demoHint.email || DEMO_USER.email,
      college: demoHint.college || DEMO_USER.college,
    };
  }
  return null;
}
