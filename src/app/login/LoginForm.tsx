"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { toast } from "sonner";

function validEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export function LoginForm({ googleEnabled }: { googleEnabled: boolean }) {
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const searchParams = useSearchParams();
  // If the user landed on /login by trying to hit a protected route, the
  // middleware appends ?callbackUrl=<that route>. Honour it on successful
  // sign-in. Otherwise default to the home page (the Forecast scenarios
  // list) — admin is opt-in via the user menu.
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";

  async function onGoogle() {
    setGoogleLoading(true);
    try {
      await signIn("google", { callbackUrl });
    } finally {
      setGoogleLoading(false);
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEmailError(null);
    const normalised = email.trim().toLowerCase();
    if (!validEmail(normalised)) {
      setEmailError("Please enter a valid email address.");
      return;
    }
    setSubmitting(true);
    try {
      const lookup = await fetch("/api/auth/email-exists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalised }),
      });
      if (lookup.ok) {
        const { exists } = (await lookup.json()) as { exists: boolean };
        if (!exists) {
          toast.info("No account found", {
            description:
              "We couldn't find an account for that email. Contact your administrator to be invited.",
          });
          return;
        }
      }

      const result = await signIn("email", {
        email: normalised,
        redirect: false,
        callbackUrl,
      });
      if (result?.error) {
        toast.error("Sign-in failed", {
          description: "We could not send a sign-in link. Please try again.",
        });
        return;
      }
      window.location.href = `/login/verify-request?email=${encodeURIComponent(normalised)}`;
    } catch {
      toast.error("Sign-in failed", {
        description: "Unexpected error. Please try again.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-7">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900">Sign In</h1>
        <p className="mt-2 text-sm text-zinc-500">
          Enter your email — we&apos;ll send you a one-time sign-in link.
        </p>
      </div>

      {googleEnabled ? (
        <div className="flex flex-col gap-4">
          <button
            type="button"
            onClick={onGoogle}
            disabled={googleLoading || submitting}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 disabled:opacity-60"
          >
            <GoogleIcon />
            {googleLoading ? "Continuing…" : "Continue with Google"}
          </button>
          <div className="relative">
            <div className="absolute inset-0 flex items-center" aria-hidden="true">
              <div className="w-full border-t border-zinc-200" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-zinc-50 px-3 text-xs text-zinc-500">
                or sign in with email
              </span>
            </div>
          </div>
        </div>
      ) : null}

      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-zinc-900">
            Email address <span className="text-rose-500">*</span>
          </span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (emailError) setEmailError(null);
            }}
            placeholder="you@company.com"
            className={`rounded-md border bg-white px-3 py-2 text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-1 ${
              emailError
                ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500"
                : "border-zinc-300 focus:border-indigo-500 focus:ring-indigo-500"
            }`}
          />
          {emailError ? (
            <span className="text-xs text-rose-600">{emailError}</span>
          ) : null}
        </label>
        <button
          type="submit"
          disabled={submitting || googleLoading}
          className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
        >
          {submitting ? "Sending link…" : "Sign In"}
        </button>
      </form>

      <p className="text-center text-sm text-zinc-500">
        Don&apos;t have an account? Contact your administrator.
      </p>
    </div>
  );
}

function GoogleIcon() {
  // Minimal multi-colour Google "G" mark.
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.258c-.806.54-1.836.86-3.048.86-2.344 0-4.328-1.584-5.036-3.71H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}
