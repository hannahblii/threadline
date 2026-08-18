import React, { useEffect, useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { supabase } from "../lib/supabaseClient";

export default function Auth({ errorMessage }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(errorMessage || "");

  useEffect(() => {
    if (errorMessage) setError(errorMessage);
  }, [errorMessage]);

  async function signInWithGoogle() {
    setError("");
    setLoading(true);
    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (signInError) {
      setError(signInError.message);
      setLoading(false);
    }
    // On success, Supabase redirects to Google, then back to the app —
    // no further code runs here.
  }

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4">
      <div className="w-full max-w-xs text-center">
        <div className="flex items-center gap-2 mb-8 justify-center">
          <div className="w-8 h-8 rounded-lg bg-emerald-800 flex items-center justify-center">
            <ArrowLeftRight className="text-white" size={16} />
          </div>
          <p className="font-black text-stone-900 text-lg">Threadline</p>
        </div>

        <p className="text-sm text-stone-500 mb-6">
          Sign in with your Google account to start swapping closets on campus.
        </p>

        <button
          onClick={signInWithGoogle}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 border border-stone-300 rounded-lg py-2.5 text-sm font-bold text-stone-700 hover:bg-stone-100 disabled:opacity-60"
        >
          <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l6-6C33.6 5.1 29 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21 21-9.4 21-21c0-1.2-.1-2.4-.4-3.5z"/>
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.6 18.9 12 24 12c3.1 0 5.8 1.1 8 3l6-6C33.6 5.1 29 3 24 3 16.3 3 9.7 7.3 6.3 14.7z"/>
            <path fill="#4CAF50" d="M24 45c5.1 0 9.7-1.9 13.2-5.1l-6.1-5.1C29.1 36.6 26.7 37.5 24 37.5c-5.3 0-9.7-3.4-11.3-8.1l-6.5 5C9.6 40.6 16.2 45 24 45z"/>
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.2 5.7l6.1 5.1C40.9 36.3 44 30.7 44 24c0-1.2-.1-2.4-.4-3.5z"/>
          </svg>
          {loading ? "Redirecting..." : "Continue with Google"}
        </button>

        {error && <p className="text-xs text-red-600 mt-3">{error}</p>}
      </div>
    </div>
  );
}
