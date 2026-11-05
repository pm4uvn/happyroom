"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * OAuth return page (Google via Supabase Auth, implicit flow). Reads the access token from the URL
 * fragment (never sent to our server logs), posts it once to /api/auth/google/complete for
 * server-side verification, then clears the fragment.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = params.get("access_token");
    window.history.replaceState(null, "", "/auth/callback");
    if (!accessToken) {
      queueMicrotask(() => setFailed(true));
      return;
    }
    void fetch("/api/auth/google/complete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accessToken }),
    }).then(
      (r) => (r.ok ? router.replace("/world/character") : setFailed(true)),
      () => setFailed(true),
    );
  }, [router]);
  return (
    <main id="main" className="grid min-h-dvh place-items-center p-6 text-center">
      <p role="status" className="font-semibold text-ink">
        {failed ? "Sign-in failed. Please go back and try again." : "Signing you in…"}
      </p>
    </main>
  );
}
