import React, { useEffect, useState } from "react";
import { ArrowLeftRight, Repeat, Users, Tag, MessageCircle, Bookmark, Bell, HelpCircle } from "lucide-react";
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
import InfoModal from "./components/InfoModal";

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
  const [campusList, setCampusList] = useState([]);
  const [addingCampus, setAddingCampus] = useState(false);
  const [newCampusName, setNewCampusName] = useState("");
  const [campusError, setCampusError] = useState("");
  const [showInfo, setShowInfo] = useState(false);

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

  // Show the "how it works" intro automatically the first time this account
  // logs in. Tracked in localStorage so it never nags again after that —
  // the header "?" button is there whenever someone wants it back.
  useEffect(() => {
    if (!session) return;
    const key = `closetcult_seen_intro_${session.user.id}`;
    if (!localStorage.getItem(key)) {
      setShowInfo(true);
      localStorage.setItem(key, "1");
    }
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

  useEffect(() => {
    if (!session) return;
    loadCampusList();
  }, [session]);

  async function loadCampusList() {
    const { data } = await supabase.from("campuses").select("name").order("name");
    setCampusList((data || []).map((c) => c.name));
  }

  async function createCampusEdition() {
    const name = newCampusName.trim();
    if (!name) return;
    setCampusError("");
    const { data, error } = await supabase.rpc("create_campus_edition", { p_name: name });
    if (error) {
      console.error(error);
      setCampusError(error.message.includes("empty") ? "Enter a school name." : "Couldn't add that school — try again.");
      return;
    }
    if (data) {
      await loadCampusList();
      setCampus(name);
      setOfficialCircleId(data);
      setNewCampusName("");
      setAddingCampus(false);
    }
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
    setViewingProfileId(null);
    setEditingOwnProfile(false);
    setTab(id);
  }

  return (
    <div className="min-h-screen bg-black">
      <header className="border-b border-stone-800 bg-stone-950 px-4 py-2.5">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-emerald-700 flex items-center justify-center shrink-0">
              <ArrowLeftRight className="text-white" size={13} />
            </div>
            <p className="font-black text-white text-sm leading-none">ClosetCult</p>
            <button
              onClick={() => setShowInfo(true)}
              className="text-stone-500 hover:text-emerald-400 p-1.5 -ml-1"
              title="How ClosetCult works"
            >
              <HelpCircle size={15} />
            </button>
          </div>
          <select
            value={campus || "UCLA"}
            onChange={(e) => {
              if (e.target.value === "__add_new__") setAddingCampus(true);
              else changeCampus(e.target.value);
            }}
            className="text-[11px] text-emerald-400 font-bold leading-none bg-stone-900 border border-stone-700 rounded-full px-2.5 py-1"
          >
            {campusList.map((c) => (
              <option key={c} value={c} className="bg-stone-900 text-white">
                {c}
              </option>
            ))}
            <option value="__add_new__" className="bg-stone-900 text-emerald-400">
              + Add your school
            </option>
          </select>
        </div>
        {addingCampus && (
          <div className="max-w-md mx-auto mt-2 flex items-center gap-2">
            <input
              autoFocus
              value={newCampusName}
              onChange={(e) => setNewCampusName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createCampusEdition()}
              placeholder="Your school's name"
              className="flex-1 bg-stone-900 border border-stone-700 rounded-lg px-3 py-2 text-sm text-white placeholder-stone-500"
            />
            <button onClick={createCampusEdition} className="bg-emerald-700 text-white rounded-lg px-3 py-2 text-sm font-bold">
              Create
            </button>
            <button
              onClick={() => {
                setAddingCampus(false);
                setNewCampusName("");
                setCampusError("");
              }}
              className="text-stone-500 text-sm font-bold px-2 py-2"
            >
              Cancel
            </button>
          </div>
        )}
        {campusError && <p className="max-w-md mx-auto text-xs text-red-400 mt-1">{campusError}</p>}
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
            {tab === "closet" && (
              <Closet
                session={session}
                campus={campus}
                officialCircleId={officialCircleId}
                myProfile={myProfile}
                onEditProfile={() => setEditingOwnProfile(true)}
              />
            )}
          </>
        )}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-stone-950 border-t border-stone-800">
        <div className="max-w-md mx-auto grid grid-cols-6">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => goToTab(t.id)}
              className={`relative flex flex-col items-center gap-1 py-3.5 min-h-[56px] text-[10px] font-bold ${
                tab === t.id ? "text-emerald-400" : "text-stone-500"
              }`}
            >
              <span className="relative">
                <t.icon size={20} strokeWidth={tab === t.id ? 2.5 : 2} />
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

      {showInfo && <InfoModal onClose={() => setShowInfo(false)} />}
    </div>
  );
}
