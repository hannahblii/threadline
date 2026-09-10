import React, { useEffect, useState } from "react";
import { ArrowLeftRight, Repeat, Users, Tag, MessageCircle, Bookmark, Bell, Pencil } from "lucide-react";
import { supabase } from "./lib/supabaseClient";
import Auth from "./components/Auth";
import Browse from "./components/Browse";
import Circles from "./components/Circles";
import Closet from "./components/Closet";
import Matches from "./components/Matches";
import Wishlist from "./components/Wishlist";
import Notifications from "./components/Notifications";
import Profile from "./components/Profile";
import EditProfile from "./components/EditProfile";

export default function App() {
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);
  const [tab, setTab] = useState("browse");
  const [domainError, setDomainError] = useState("");
  const [pendingConversationId, setPendingConversationId] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [viewingProfileId, setViewingProfileId] = useState(null);
  const [editingOwnProfile, setEditingOwnProfile] = useState(false);
  const [myProfile, setMyProfile] = useState(null);
  const [campus, setCampus] = useState(null);
  const [officialCircleId, setOfficialCircleId] = useState(null);
  const CAMPUSES = ["UCLA", "UCSD", "UT Austin"];

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

  // No school-domain restriction — any Google account can sign in.
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

  useEffect(() => {
    if (!session) return;
    supabase
      .from("profiles")
      .select("name, avatar_url")
      .eq("id", session.user.id)
      .maybeSingle()
      .then(({ data }) => setMyProfile(data));
  }, [session]);

  // Load the user's campus once their profile exists.
  useEffect(() => {
    if (!session) return;
    supabase
      .from("profiles")
      .select("campus")
      .eq("id", session.user.id)
      .maybeSingle()
      .then(({ data }) => setCampus(data?.campus || "UCLA"));
  }, [session]);

  // "Visible Campus Wide" actually means "posted to the official campus
  // circle" — everyone on that campus is auto-joined to it, so it's the
  // same thing as campus-wide visibility, but it also means those items now
  // correctly show up if you open that circle directly.
  useEffect(() => {
    if (!campus || !session) return;
    supabase
      .from("circles")
      .select("id")
      .eq("campus_tag", campus)
      .maybeSingle()
      .then(async ({ data }) => {
        setOfficialCircleId(data?.id || null);
        if (data?.id) {
          // Make sure membership actually exists — this used to only happen
          // when someone explicitly switched campuses via the dropdown, so
          // anyone whose campus was already correct by default (e.g. the
          // 'UCLA' default on signup) never actually got joined, and RLS
          // silently hid campus-wide items from them as a result.
          await supabase
            .from("circle_members")
            .insert({ circle_id: data.id, user_id: session.user.id })
            .select()
            .maybeSingle(); // errors if already a member — harmless, ignored
        }
      });
  }, [campus, session]);

  async function changeCampus(newCampus) {
    if (newCampus === campus) return;
    setCampus(newCampus);
    await supabase.from("profiles").update({ campus: newCampus }).eq("id", session.user.id);
    // Membership in the new campus's circle is granted by the effect above,
    // since it re-runs whenever `campus` changes.
  }

  // Track unread notification count for the nav badge, live.
  useEffect(() => {
    if (!session) return;
    const userId = session.user.id;

    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("read", false)
      .then(({ count }) => setUnreadCount(count || 0));

    const channel = supabase
      .channel(`notif-badge-${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => setUnreadCount((c) => c + 1)
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [session]);

  if (checking) return null;
  if (!session) return <Auth errorMessage={domainError} />;

  const tabs = [
    { id: "browse", label: "Browse", icon: Repeat },
    { id: "matches", label: "Messages", icon: MessageCircle },
    { id: "notifications", label: "Alerts", icon: Bell, badge: unreadCount },
    { id: "wishlist", label: "Wishlist", icon: Bookmark },
    { id: "circles", label: "Circles", icon: Users },
    { id: "closet", label: "Closet", icon: Tag },
  ];

  function openConversation(conversationId) {
    setPendingConversationId(conversationId);
    setTab("matches");
  }

  function goToTab(id) {
    if (id === "notifications") setUnreadCount(0); // optimistic — they're about to read them
    setTab(id);
  }

  return (
    <div className="min-h-screen bg-black">
      <header className="border-b border-stone-800 bg-stone-950 px-4 py-4">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            {myProfile?.avatar_url ? (
              <img src={myProfile.avatar_url} alt="You" className="w-8 h-8 rounded-lg object-cover" />
            ) : (
              <div className="w-8 h-8 rounded-lg bg-emerald-700 flex items-center justify-center">
                <ArrowLeftRight className="text-white" size={16} />
              </div>
            )}
            <div>
              <p className="text-[11px] text-stone-400 leading-none">{session.user.email}</p>
              <div className="flex items-center gap-2 mt-1">
                <button
                  onClick={() => setEditingOwnProfile(true)}
                  className="flex items-center gap-1 text-xs text-stone-500 font-bold hover:text-emerald-400"
                >
                  <Pencil size={11} /> Edit profile
                </button>
                <button onClick={() => supabase.auth.signOut()} className="text-xs text-stone-500 font-bold hover:text-stone-300">
                  Sign out
                </button>
              </div>
            </div>
          </div>
          <div className="text-right">
            <p className="font-black text-white leading-none">ClosetCult</p>
            <select
              value={campus || "UCLA"}
              onChange={(e) => changeCampus(e.target.value)}
              className="text-[11px] text-stone-400 leading-none mt-0.5 bg-transparent border-none p-0 text-right"
            >
              {CAMPUSES.map((c) => (
                <option key={c} value={c} className="bg-stone-900 text-white">
                  {c} edition
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-5 pb-24">
        {viewingProfileId ? (
          <Profile userId={viewingProfileId} session={session} onBack={() => setViewingProfileId(null)} />
        ) : editingOwnProfile ? (
          <EditProfile
            session={session}
            onBack={() => setEditingOwnProfile(false)}
            onSaved={(updated) => setMyProfile(updated)}
          />
        ) : (
          <>
            {tab === "browse" && (
              <Browse
                session={session}
                campus={campus}
                officialCircleId={officialCircleId}
                onGoToMatches={() => setTab("matches")}
                onViewProfile={setViewingProfileId}
              />
            )}
            {tab === "matches" && (
              <Matches
                session={session}
                initialConversationId={pendingConversationId}
                onConsumedInitial={() => setPendingConversationId(null)}
                onViewProfile={setViewingProfileId}
              />
            )}
            {tab === "notifications" && (
              <Notifications session={session} onOpenConversation={openConversation} onViewProfile={setViewingProfileId} />
            )}
            {tab === "wishlist" && <Wishlist session={session} onOpenMatch={openConversation} onViewProfile={setViewingProfileId} />}
            {tab === "circles" && <Circles session={session} campus={campus} onViewProfile={setViewingProfileId} />}
            {tab === "closet" && <Closet session={session} campus={campus} officialCircleId={officialCircleId} />}
          </>
        )}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-stone-950 border-t border-stone-800">
        <div className="max-w-md mx-auto grid grid-cols-6">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => goToTab(t.id)}
              className={`relative flex flex-col items-center gap-1 py-2.5 text-[10px] font-bold ${
                tab === t.id ? "text-emerald-400" : "text-stone-500"
              }`}
            >
              <span className="relative">
                <t.icon size={17} strokeWidth={tab === t.id ? 2.5 : 2} />
                {t.badge > 0 && (
                  <span className="absolute -top-1.5 -right-2 min-w-[15px] h-[15px] px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                    {t.badge > 9 ? "9+" : t.badge}
                  </span>
                )}
              </span>
              {t.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
