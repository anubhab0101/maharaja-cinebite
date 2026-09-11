import { useState, useMemo } from "react";
import { ArrowLeft, Check, ChefHat, Copy, ExternalLink, LayoutDashboard, ShieldAlert, ShieldCheck, Sparkles } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";

export default function Login() {
  const params = new URLSearchParams(window.location.search);
  const redirectTarget = params.get("redirect") || "/admin";
  const errorParam = params.get("error");
  const rejectedEmail = params.get("email");
  const [copied, setCopied] = useState(false);

  const callbackUri = `${window.location.origin}/api/auth/google/callback`;

  const errorMessage = useMemo(() => {
    if (!errorParam) return null;
    if (errorParam === "unauthorized_account") {
      return `Access Denied: "${rejectedEmail || "Your Google account"}" is not authorized as cinema staff. Only approved theatre accounts can access staff consoles.`;
    }
    if (errorParam === "csrf_validation_failed") {
      return "Security validation failed (CSRF mismatch). Please try logging in again.";
    }
    if (errorParam === "token_exchange_failed" || errorParam === "userinfo_fetch_failed") {
      return "Google sign-in could not be completed. Please check your internet connection or credentials.";
    }
    return `Login failed: ${errorParam}`;
  }, [errorParam, rejectedEmail]);

  function handleGoogleLogin() {
    window.location.href = `/api/auth/google?redirect=${encodeURIComponent(redirectTarget)}`;
  }

  function handleCopyUri() {
    navigator.clipboard.writeText(callbackUri);
    setCopied(true);
    toast.success("Callback URI copied to clipboard!");
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <main className="min-h-screen bg-[#050505] flex flex-col justify-between px-4 py-8 text-[#dedad2] sm:px-6">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between">
        <Link href="/" className="flex items-center gap-2 text-sm text-[#85827b] transition hover:text-[#dedad2]">
          <ArrowLeft size={16} /> Back to CineBites
        </Link>
        <div className="flex items-center gap-2 text-xs text-[#85827b]">
          <ShieldCheck size={14} className="text-emerald-400" />
          <span>Google OAuth 2.0 Protected</span>
        </div>
      </header>

      <div className="mx-auto my-auto w-full max-w-md">
        <div className="rounded-3xl border border-white/10 bg-[#0d0d0c] p-8 shadow-2xl backdrop-blur-xl">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-400 to-amber-600 shadow-lg shadow-orange-500/20">
              <Sparkles size={24} className="text-black" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-[#dedad2]">Staff & Admin Portal</h1>
            <p className="mt-2 text-sm text-[#85827b]">
              Sign in with your authorized theatre Google account to access the operations console.
            </p>
          </div>

          {errorMessage && (
            <div className="mt-6 flex items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
              <ShieldAlert className="mt-0.5 shrink-0 text-red-400" size={18} />
              <div>
                <strong>Authentication Blocked</strong>
                <p className="mt-1 text-xs text-red-300/90">{errorMessage}</p>
              </div>
            </div>
          )}

          <div className="mt-8 space-y-4">
            <button
              onClick={handleGoogleLogin}
              className="flex w-full items-center justify-center gap-3 rounded-2xl border border-white/15 bg-[#141414] px-5 py-3.5 text-sm font-semibold text-[#dedad2] shadow-md transition hover:bg-[#1f1f1f] hover:border-white/25 active:scale-[0.98]"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              Sign in with Google
            </button>

            {/* Quick 1-Click Dev Sign-In */}
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-200 space-y-2">
              <p className="font-semibold text-amber-300 flex items-center gap-1.5">
                <Sparkles size={14} /> 1-Click Instant Sign-In (Localhost):
              </p>
              <p className="text-white/70 text-[11px]">
                Direct test as verified Admin or Kitchen without waiting for Google Cloud Console setup:
              </p>
              <div className="grid grid-cols-1 gap-2 pt-1">
                <a
                  href={`/api/auth/dev-login?role=OWNER_ADMIN&redirect=${encodeURIComponent(redirectTarget)}`}
                  className="block w-full text-center rounded-xl bg-amber-400 hover:bg-amber-300 text-black py-2.5 font-semibold text-xs transition shadow"
                >
                  ⚡ Enter as Owner Admin (anubhabmohapatra.01@gmail.com)
                </a>
                <a
                  href={`/api/auth/dev-login?role=KITCHEN&redirect=/kitchen`}
                  className="block w-full text-center rounded-xl border border-white/20 bg-white/5 hover:bg-white/10 text-white/80 py-2 text-[11px] font-medium transition"
                >
                  👨‍🍳 Enter as Kitchen Display
                </a>
              </div>
            </div>

            {/* Google Cloud Console Setup Helper */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3.5 text-[11px] text-white/60 space-y-2">
              <p className="font-medium text-white/80 flex items-center justify-between">
                <span>Google OAuth 400 Mismatch Fix:</span>
                <a
                  href="https://console.cloud.google.com/apis/credentials"
                  target="_blank"
                  rel="noreferrer"
                  className="text-orange-400 hover:underline flex items-center gap-1"
                >
                  Google Console <ExternalLink size={10} />
                </a>
              </p>
              <p className="text-white/50 text-[10px]">
                Google Cloud me Client ID ke <strong>Authorized redirect URIs</strong> me yeh exact link paste karein:
              </p>
              <div className="flex items-center justify-between bg-black/40 rounded-lg p-2 border border-white/5 font-mono text-[10px] text-amber-300 select-all">
                <span className="truncate pr-2">{callbackUri}</span>
                <button
                  onClick={handleCopyUri}
                  className="shrink-0 flex items-center gap-1 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded px-2 py-0.5"
                  title="Copy URI"
                >
                  {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                  <span>{copied ? "Copied" : "Copy"}</span>
                </button>
              </div>
            </div>

            <div className="relative my-4 text-center">
              <span className="absolute inset-x-0 top-1/2 -translate-y-1/2 border-t border-white/10" />
              <span className="relative bg-[#161616] px-3 text-[10px] uppercase tracking-widest text-white/40">
                Security Policy
              </span>
            </div>

            <div className="space-y-2 rounded-2xl bg-white/[0.03] p-3.5 text-xs text-white/60">
              <div className="flex items-center gap-2">
                <ShieldCheck size={14} className="text-orange-400" />
                <span>Only pre-authorized staff emails can sign in</span>
              </div>
              <div className="flex items-center gap-2">
                <ChefHat size={14} className="text-violet-400" />
                <span>Kitchen accounts load only the live cooking queue</span>
              </div>
              <div className="flex items-center gap-2">
                <LayoutDashboard size={14} className="text-amber-400" />
                <span>Admin console requires Owner or Manager privileges</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <footer className="text-center text-xs text-white/40">
        Maharaja Cinema • CineBites In-Seat System &copy; {new Date().getFullYear()}
      </footer>
    </main>
  );
}
