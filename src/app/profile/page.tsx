"use client";
import { useUser } from "@/lib/auth";
import Button from "@/components/ui/Button";

export default function ProfilePage() {
  const { user, signIn } = useUser();
  // TODO(Person 4): unlocked neighborhoods (x/3), NFT badges, line quests, points, CO2 saved.
  return (
    <div className="p-4">
      <h1 className="text-xl font-bold">Profile</h1>
      {user ? (
        <p className="mt-2">{user.displayName} · {user.college}</p>
      ) : (
        <Button className="mt-4" onClick={signIn}>Sign in with Google</Button>
      )}
    </div>
  );
}
