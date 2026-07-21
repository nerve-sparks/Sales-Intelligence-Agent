import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "./firebase";

/* Tracks Firebase's real auth state (not the org/workspace session in
 * lib/session.ts, which is a separate, unrelated concept - a signed-in
 * Firebase user might not have an org/workspace yet, and vice versa isn't
 * possible since onboarding itself now requires being signed in). */
export function useAuth(): { user: User | null; loading: boolean } {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  return { user, loading };
}
