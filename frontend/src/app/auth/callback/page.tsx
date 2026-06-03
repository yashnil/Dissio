"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase";

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const code = searchParams.get("code");

        if (!code) {
          // No code present, redirect to login with error
          router.replace("/login?error=oauth_callback_failed");
          return;
        }

        const supabase = createClient();

        // Exchange the code for a session
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

        if (exchangeError) {
          console.error("OAuth callback error:", exchangeError);
          router.replace("/login?error=oauth_callback_failed");
          return;
        }

        // Success - redirect to dashboard
        router.replace("/dashboard");
      } catch (err) {
        console.error("Unexpected callback error:", err);
        setError("An unexpected error occurred during sign-in.");
        setTimeout(() => router.replace("/login?error=oauth_callback_failed"), 2000);
      }
    };

    handleCallback();
  }, [router, searchParams]);

  return (
    <div className="flex flex-col items-center gap-4">
      {error ? (
        <>
          <p className="text-sm text-danger">{error}</p>
          <p className="text-xs text-ink-faint">Redirecting to login...</p>
        </>
      ) : (
        <>
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-lav border-t-transparent" />
          <p className="text-sm text-ink-subtle">Completing sign-in...</p>
        </>
      )}
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <Suspense fallback={
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-lav border-t-transparent" />
          <p className="text-sm text-ink-subtle">Loading...</p>
        </div>
      }>
        <AuthCallbackContent />
      </Suspense>
    </main>
  );
}
