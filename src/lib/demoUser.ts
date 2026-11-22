// The signed-out demo player. Its own tiny module because auth.tsx (client, on every page)
// needs it, and seedData.ts would pull the whole restaurant list into the browser bundle.
import type { StoreUser } from "./store";

export const DEMO_USER: StoreUser = {
  uid: "demo-user",
  displayName: "Demo Student",
  email: "demo@northeastern.edu",
  college: "Northeastern",
};
