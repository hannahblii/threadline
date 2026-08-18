import React, { useEffect, useState } from "react";
import { ArrowLeftRight, Repeat, Heart, Users, Tag, MessageCircle } from "lucide-react";
import { supabase, ALLOWED_EMAIL_DOMAIN } from "./lib/supabaseClient";
import Auth from "./components/Auth";
import Feed from "./components/Feed";
import Swipe from "./components/Swipe";
import Circles from "./components/Circles";
import Closet from "./components/Closet";
import Matches from "./components/Matches";

export default function App() {
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);
  const [tab, setTab] = useState("feed");
  const [domainError, setDomainError] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChecking(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) setDomainError("");
  }, [session]);

  // Make sure a profiles row exists for this user the first time they sign in.
  useEffect(() => {
    if (!session) return;
    async function ensureProfile() {
      const { data: existing } = await supabase.from("profiles").select("id").eq("id", session.user.id).maybeSingle();
      if (!existing) {
        await supabase.from("profiles").insert({
          id: session.user.id,
          email: session.user.email,
          name: session.user.email.split("@")[0],
        });
      }
    }
    ensureProfile();
  }, [session]);

  if (checking) return null;
  if (!session) return <Auth errorMessage={domainError} />;

  const tabs = [
    { id: "feed", label: "Feed", icon: Repeat },
    { id: "swipe", label: "Swipe", icon: Heart },
    { id: "matches", label: "Matches", icon: MessageCircle },
    { id: "circles", label: "Circles", icon: Users },
    { id: "closet", label: "My closet", icon: Tag },
  ];

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="border-b border-stone-200 bg-white px-4 py-4">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-800 flex items-center justify-center">
              <ArrowLeftRight className="text-white" size={16} />
            </div>
            <div>
              <p className="font-black text-stone-900 leading-none">Threadline</p>
              <p className="text-[11px] text-stone-400 leading-none mt-0.5">UCLA edition</p>
            </div>
          </div>
          <button onClick={() => supabase.auth.signOut()} className="text-xs text-stone-400 font-bold">
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-5 pb-24">
        {tab === "feed" && <Feed />}
        {tab === "swipe" && <Swipe session={session} onGoToMatches={() => setTab("matches")} />}
        {tab === "matches" && <Matches session={session} />}
        {tab === "circles" && <Circles session={session} />}
        {tab === "closet" && <Closet session={session} />}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-stone-200">
        <div className="max-w-md mx-auto grid grid-cols-5">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-bold ${
                tab === t.id ? "text-emerald-800" : "text-stone-400"
              }`}
            >
              <t.icon size={18} strokeWidth={tab === t.id ? 2.5 : 2} />
              {t.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
