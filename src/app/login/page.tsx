"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    searchParams.get("error") === "auth" ? "Sign-in failed. Try again." : null
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    const supabase = createClient();

    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(error.message);
      } else {
        router.replace(next);
        router.refresh();
      }
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setError(
          error.message.includes("invite-only") || error.message.includes("Database error")
            ? "Signups are invite-only. Ask a Bughaw admin to add your email to the allowlist."
            : error.message
        );
      } else if (data.session) {
        router.replace(next);
        router.refresh();
      } else {
        setNotice("Check your email to confirm your account, then sign in.");
      }
    }
    setBusy(false);
  }

  async function handleGoogle() {
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (error) setError(error.message);
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-paper px-4">
      <div className="w-full max-w-sm">
        <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-coir-dark mb-1.5">
          Bughaw Innovations — Internal
        </p>
        <h1 className="font-display text-3xl font-semibold text-ink mb-6">
          Calculators Hub
        </h1>

        <form
          onSubmit={handleSubmit}
          className="bg-panel border border-line rounded-xl p-6 space-y-4"
        >
          <div>
            <label className="block text-xs text-ink-soft mb-1.5" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-coir focus:ring-2 focus:ring-coir/20"
            />
          </div>
          <div>
            <label className="block text-xs text-ink-soft mb-1.5" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-coir focus:ring-2 focus:ring-coir/20"
            />
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}
          {notice && <p className="text-sm text-coir-dark">{notice}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full bg-coir hover:bg-coir-dark text-white font-semibold text-sm rounded-md py-2.5 disabled:opacity-60"
          >
            {busy ? "…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>

          <button
            type="button"
            onClick={handleGoogle}
            className="w-full border border-line hover:border-ink-soft text-ink text-sm rounded-md py-2.5"
          >
            Continue with Google
          </button>

          <p className="text-xs text-ink-soft text-center">
            {mode === "signin" ? (
              <>
                Invited but no account yet?{" "}
                <button
                  type="button"
                  className="text-coir-dark underline"
                  onClick={() => setMode("signup")}
                >
                  Create one
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button
                  type="button"
                  className="text-coir-dark underline"
                  onClick={() => setMode("signin")}
                >
                  Sign in
                </button>
              </>
            )}
          </p>
        </form>

        <p className="text-[11px] text-ink-soft mt-4 text-center">
          Access is invite-only. Your email must be on the team allowlist.
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
