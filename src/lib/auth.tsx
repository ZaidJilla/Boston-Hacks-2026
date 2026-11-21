"use client";
// useUser(): real Google sign-in when Firebase is configured, a fake user in demo mode.
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { DEMO_MODE } from "./config";
import { collegeFromEmail } from "./colleges";
import { getClientAuth } from "./firebase";

export interface AppUser {
  uid: string;
  displayName: string;
  email: string;
  college: string;
}

interface Ctx {
  user: AppUser | null;
  loading: boolean;
  signIn: () => Promise<void>;
  signOutUser: () => Promise<void>;
}

const DEMO_USER: AppUser = {
  uid: "demo-user",
  displayName: "Demo Student",
  email: "demo@northeastern.edu",
  college: "Northeastern",
};

const AuthContext = createContext<Ctx>({
  user: null,
  loading: true,
  signIn: async () => {},
  signOutUser: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const auth = getClientAuth();
  const [user, setUser] = useState<AppUser | null>(auth ? null : DEMO_MODE ? DEMO_USER : null);
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
          : DEMO_MODE
            ? DEMO_USER
            : null,
      );
      setLoading(false);
    });
  }, [auth]);

  const signIn = async () => {
    if (auth) await signInWithPopup(auth, new GoogleAuthProvider());
    else if (DEMO_MODE) setUser(DEMO_USER);
  };
  const signOutUser = async () => {
    if (auth) await signOut(auth);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOutUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useUser = () => useContext(AuthContext);
