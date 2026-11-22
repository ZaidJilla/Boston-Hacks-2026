"use client";
// useUser(): real Google sign-in when Firebase is configured. The fake demo user is only used
// when Firebase ISN'T configured (no-keys demo), so it never hides the real sign-in button.
// Requests without a token still count as the demo player on the server in demo mode.
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { DEMO_MODE } from "./config";
import { collegeFromEmail } from "./colleges";
import { getClientAuth } from "./firebase";
import { DEMO_USER } from "./seedData";

export interface AppUser {
  uid: string;
  displayName: string;
  email: string;
  college: string;
}

interface Ctx {
  user: AppUser | null;
  loading: boolean;
  /** True when `user` is the built-in demo player, not a real Google account. */
  isDemo: boolean;
  signIn: () => Promise<void>;
  signOutUser: () => Promise<void>;
  /** Firebase ID token for `Authorization: Bearer ...`, or null when signed out / no Firebase. */
  getIdToken: () => Promise<string | null>;
}

const fallbackUser = (): AppUser | null => (DEMO_MODE ? DEMO_USER : null);

const AuthContext = createContext<Ctx>({
  user: null,
  loading: true,
  isDemo: false,
  signIn: async () => {},
  signOutUser: async () => {},
  getIdToken: async () => null,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const auth = getClientAuth();
  const [user, setUser] = useState<AppUser | null>(auth ? null : fallbackUser());
  const [loading, setLoading] = useState(Boolean(auth));

  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, (u) => {
      setUser(
        u
          ? {
              uid: u.uid,
              displayName: u.displayName ?? "Student",
              email: u.email ?? "",
              college: collegeFromEmail(u.email ?? ""),
            }
          : null,
      );
      setLoading(false);
    });
  }, [auth]);

  const signIn = async () => {
    if (auth) await signInWithPopup(auth, new GoogleAuthProvider());
    else setUser(fallbackUser());
  };
  const signOutUser = async () => {
    if (auth) await signOut(auth);
    setUser(null);
  };
  const getIdToken = async () => (auth?.currentUser ? auth.currentUser.getIdToken() : null);

  return (
    <AuthContext.Provider
      value={{ user, loading, isDemo: user?.uid === DEMO_USER.uid, signIn, signOutUser, getIdToken }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useUser = () => useContext(AuthContext);
