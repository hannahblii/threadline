import React, { useEffect, useRef, useState } from "react";
import { Users, Plus, Lock, Globe, Copy, LogOut, Trash2, Send, MessageCircle } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import ItemCard from "./ItemCard";

function MembersList({ circleId, onViewProfile }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("circle_members")
      .select("user_id, profiles(id, name)")
      .eq("circle_id", circleId)
      .then(({ data }) => {
        setMembers((data || []).map((m) => m.profiles).filter(Boolean));
        setLoading(false);
      });
  }, [circleId]);

  if (loading) return <p className="text-xs text-stone-500">Loading members...</p>;

  return (
    <div className="space-y-1.5">
      {members.map((m) => (
        <button
          key={m.id}
          onClick={() => onViewProfile?.(m.id)}
          disabled={!onViewProfile}
          className="w-full text-left flex items-center gap-2 py-2.5 px-2 rounded-lg hover:bg-stone-800 disabled:hover:bg-transparent"
        >
          <div className="w-6 h-6 rounded-full bg-emerald-700 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
            {m.name?.[0]?.toUpperCase() || "?"}
          </div>
          <span className="text-sm text-stone-200">{m.name}</span>
        </button>
      ))}
    </div>
  );
}

// The circle's group chat. Every member automatically has it the moment they
// join — access is enforced server-side against live membership, so it just
// disappears (RLS blocks read/write) the moment someone leaves.
function CircleChat({ circleId, userId }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef(null);

  useEffect(() => {
    let ignore = false;
    setLoading(true);

    supabase
      .from("circle_messages")
      .select("*, profiles(name)")
      .eq("circle_id", circleId)
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (ignore) return;
        if (error) console.error(error);
        setMessages(data || []);
        setLoading(false);
      });

    const channel = supabase
      .channel(`circle-chat-${circleId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "circle_messages", filter: `circle_id=eq.${circleId}` },
        async (payload) => {
          const { data: sender } = await supabase.from("profiles").select("name").eq("id", payload.new.sender_id).maybeSingle();
          setMessages((prev) => (prev.some((m) => m.id === payload.new.id) ? prev : [...prev, { ...payload.new, profiles: sender }]));
        }
      )
      .subscribe();

    return () => {
      ignore = true;
      supabase.removeChannel(channel);
    };
  }, [circleId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const body = text.trim();
    if (!body) return;
    setText("");
    const { data, error } = await supabase
      .from("circle_messages")
      .insert({ circle_id: circleId, sender_id: userId, body })
      .select("*, profiles(name)")
      .single();
    if (error) {
      console.error(error);
      return;
    }
    setMessages((prev) => (prev.some((m) => m.id === data.id) ? prev : [...prev, data]));
  }

  return (
    <div className="bg-stone-900 border border-stone-800 rounded-lg p-3 mb-4">
      <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-stone-500 mb-2">
        <MessageCircle size={12} /> Circle chat
      </p>
      <div className="max-h-64 overflow-y-auto space-y-2 mb-2">
        {loading && <p className="text-xs text-stone-500">Loading...</p>}
        {!loading && messages.length === 0 && <p className="text-xs text-stone-500">No messages yet — say hi.</p>}
        {messages.map((m) => {
          const mine = m.sender_id === userId;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[75%] rounded-xl px-3 py-2 text-sm ${mine ? "bg-emerald-700 text-white" : "bg-stone-800 text-white"}`}>
                {!mine && <p className="text-[10px] text-stone-400 font-bold mb-0.5">{m.profiles?.name}</p>}
                {m.body}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Message the circle..."
          className="flex-1 bg-stone-950 border border-stone-700 rounded-lg px-3 py-2 text-sm text-white placeholder-stone-500"
        />
        <button onClick={send} className="bg-emerald-700 text-white rounded-lg px-4 flex items-center justify-center">
          <Send size={18} />
        </button>
      </div>
    </div>
  );
}

export default function Circles({ session, campus, onViewProfile }) {
  const userId = session.user.id;
  const [circles, setCircles] = useState([]);
  const [myCircleIds, setMyCircleIds] = useState(new Set());
  const [active, setActive] = useState(null);
  const [activeItems, setActiveItems] = useState([]);
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState("");
  const [circleCode, setCircleCode] = useState(""); // the actual code, shown to members of a private circle
  const [showMembers, setShowMembers] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState("");

  async function loadCircles() {
    if (!campus) return; // wait until we know which campus to scope to
    setLoading(true);
    // Macro-level separation: only circles that belong to your current
    // campus show up here at all — UCLA students never see UCSD's circles.
    const { data: allCircles } = await supabase
      .from("circles")
      .select("*")
      .eq("campus", campus)
      .order("campus_tag", { ascending: true, nullsFirst: false })
      .order("created_at");
    const { data: memberships } = await supabase.from("circle_members").select("circle_id").eq("user_id", userId);
    const { data: counts } = await supabase.from("circle_members").select("circle_id");
    const countMap = {};
    (counts || []).forEach((c) => (countMap[c.circle_id] = (countMap[c.circle_id] || 0) + 1));

    setCircles((allCircles || []).map((c) => ({ ...c, memberCount: countMap[c.id] || 0 })));
    setMyCircleIds(new Set((memberships || []).map((m) => m.circle_id)));
    setLoading(false);
  }

  useEffect(() => {
    loadCircles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, campus]);

  async function joinPublicCircle(circleId) {
    await supabase.from("circle_members").insert({ circle_id: circleId, user_id: userId });
    loadCircles();
  }

  async function joinPrivateCircle(circle) {
    setJoinError("");
    if (!joinCode.trim()) return;
    const { data, error } = await supabase.rpc("join_private_circle", { p_circle_id: circle.id, p_code: joinCode.trim() });
    if (error) {
      console.error(error);
      setJoinError("Something went wrong — try again.");
      return;
    }
    if (data === true) {
      setJoinCode("");
      loadCircles();
    } else {
      setJoinError("Wrong code — check with a member of the circle.");
    }
  }

  async function leaveCircle(circle) {
    if (!confirm(`Leave "${circle.name}"?`)) return;
    setActionError("");
    const { error } = await supabase.from("circle_members").delete().eq("circle_id", circle.id).eq("user_id", userId);
    if (error) {
      console.error(error);
      setActionError("Couldn't leave the circle — try again.");
      return;
    }
    setActive(null);
    loadCircles();
  }

  async function deleteCircle(circle) {
    if (!confirm(`Delete "${circle.name}"? This removes it for everyone and can't be undone.`)) return;
    setActionError("");
    const { error } = await supabase.from("circles").delete().eq("id", circle.id);
    if (error) {
      console.error(error);
      setActionError("Couldn't delete the circle — try again.");
      return;
    }
    setActive(null);
    loadCircles();
  }

  function randomCode() {
    return Math.random().toString(36).slice(2, 8).toUpperCase();
  }

  async function createCircle() {
    if (!name.trim() || !campus) return;
    const { data: circle, error } = await supabase
      .from("circles")
      .insert({ name: name.trim(), owner_id: userId, is_private: isPrivate, campus })
      .select()
      .single();
    if (error || !circle) {
      console.error(error);
      return;
    }
    await supabase.from("circle_members").insert({ circle_id: circle.id, user_id: userId });
    if (isPrivate) {
      await supabase.from("circle_codes").insert({ circle_id: circle.id, code: randomCode() });
    }
    setName("");
    setIsPrivate(false);
    setCreating(false);
    loadCircles();
  }

  async function openCircle(circle) {
    setActive(circle);
    setShowMembers(false);
    setJoinError("");
    setJoinCode("");
    setCircleCode("");
    setActionError("");

    let itemsQuery = supabase
      .from("items")
      .select("*, profiles!items_owner_id_fkey(name, dorm)")
      .eq("status", "available");

    // The official campus circle should also catch items that ended up
    // untagged (circle_id null) rather than tagged to it — same fallback
    // used for the main feed, so nothing posted as "Campus Wide" gets lost.
    itemsQuery = circle.campus_tag
      ? itemsQuery.or(`circle_id.eq.${circle.id},circle_id.is.null`)
      : itemsQuery.eq("circle_id", circle.id);

    const { data } = await itemsQuery;
    setActiveItems((data || []).map((i) => ({ ...i, owner: i.profiles?.name, dorm: i.profiles?.dorm })));

    if (circle.is_private && myCircleIds.has(circle.id)) {
      const { data: codeRow } = await supabase.from("circle_codes").select("code").eq("circle_id", circle.id).maybeSingle();
      setCircleCode(codeRow?.code || "");
    }
  }

  if (active) {
    const isMember = myCircleIds.has(active.id);
    const isOwner = active.owner_id === userId;
    return (
      <div>
        <button onClick={() => setActive(null)} className="text-sm text-emerald-400 font-bold mb-4">
          &larr; All circles
        </button>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="font-black text-xl text-white">{active.name}</h2>
            {active.is_private ? <Lock size={14} className="text-stone-500" /> : <Globe size={14} className="text-stone-500" />}
          </div>
          <div className="flex items-center gap-1 -mr-2">
            {isMember && (
              <button onClick={() => leaveCircle(active)} className="flex items-center gap-1.5 text-sm font-bold text-stone-400 hover:text-red-400 py-2 px-2.5">
                <LogOut size={14} /> Leave
              </button>
            )}
            {isOwner && (
              <button onClick={() => deleteCircle(active)} className="flex items-center gap-1.5 text-sm font-bold text-stone-400 hover:text-red-400 py-2 px-2.5">
                <Trash2 size={14} /> Delete
              </button>
            )}
          </div>
        </div>
        {actionError && <p className="text-xs text-red-400 mt-1">{actionError}</p>}
        <button onClick={() => setShowMembers((v) => !v)} className="text-sm text-stone-400 flex items-center gap-1 mt-1 mb-3 hover:text-stone-200">
          <Users size={12} /> {active.memberCount} members {showMembers ? "▲" : "▼"}
        </button>

        {showMembers && (
          <div className="bg-stone-900 border border-stone-800 rounded-lg p-2 mb-4">
            <MembersList circleId={active.id} onViewProfile={onViewProfile} />
          </div>
        )}

        {isMember && <CircleChat circleId={active.id} userId={userId} />}

        {isMember && active.is_private && circleCode && (
          <div className="flex items-center justify-between bg-stone-900 border border-stone-800 rounded-lg p-3 mb-4">
            <div>
              <p className="text-[11px] text-stone-500 uppercase tracking-wide font-bold">Invite code</p>
              <p className="text-white font-black text-lg tracking-widest">{circleCode}</p>
            </div>
            <button
              onClick={() => navigator.clipboard?.writeText(circleCode)}
              className="flex items-center gap-1.5 text-sm font-bold text-emerald-400 border border-emerald-700 rounded-lg px-3.5 py-2.5"
            >
              <Copy size={14} /> Copy
            </button>
          </div>
        )}

        {!isMember && active.is_private && (
          <div className="bg-stone-900 border border-stone-800 rounded-lg p-3 mb-4">
            <p className="text-xs text-stone-400 mb-2">This circle is private — enter the invite code to join.</p>
            <div className="flex gap-2">
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder="Invite code"
                className="flex-1 bg-stone-950 border border-stone-700 rounded-lg px-3 py-2 text-sm text-white placeholder-stone-500"
              />
              <button onClick={() => joinPrivateCircle(active)} className="bg-emerald-700 text-white rounded-lg px-5 py-2.5 text-sm font-bold">Join</button>
            </div>
            {joinError && <p className="text-xs text-red-400 mt-2">{joinError}</p>}
          </div>
        )}

        {!isMember && !active.is_private && (
          <button
            onClick={() => joinPublicCircle(active.id)}
            className="w-full bg-emerald-700 text-white rounded-lg py-3 text-sm font-bold mb-4"
          >
            Join circle
          </button>
        )}

        <p className="text-sm text-stone-500 mb-2">items here are only visible to this circle</p>
        <div className="grid grid-cols-2 gap-3">
          {activeItems.length ? (
            activeItems.map((i) => <ItemCard key={i.id} item={i} compact onViewOwner={onViewProfile} />)
          ) : (
            <p className="text-sm text-stone-500 col-span-2">No items listed in this circle yet.</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-black text-xl text-white">Circles</h2>
        <button
          onClick={() => setCreating((v) => !v)}
          className="flex items-center gap-1.5 text-sm font-bold text-emerald-400 border border-emerald-700 rounded-lg px-4 py-2.5"
        >
          <Plus size={14} /> New circle
        </button>
      </div>
      <p className="text-xs text-stone-500 mb-4">Showing circles at {campus}</p>
      {creating && (
        <div className="border border-stone-800 bg-stone-900 rounded-xl p-3 mb-4 space-y-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Circle name"
            className="w-full bg-stone-950 border border-stone-700 rounded-lg px-3 py-2 text-sm text-white placeholder-stone-500"
          />
          <div className="flex gap-2">
            <button
              onClick={() => setIsPrivate(false)}
              className={`flex-1 flex items-center justify-center gap-1.5 text-sm font-bold py-2.5 rounded-lg border ${
                !isPrivate ? "bg-emerald-700 text-white border-emerald-700" : "border-stone-700 text-stone-400"
              }`}
            >
              <Globe size={12} /> Public
            </button>
            <button
              onClick={() => setIsPrivate(true)}
              className={`flex-1 flex items-center justify-center gap-1.5 text-sm font-bold py-2.5 rounded-lg border ${
                isPrivate ? "bg-emerald-700 text-white border-emerald-700" : "border-stone-700 text-stone-400"
              }`}
            >
              <Lock size={12} /> Private
            </button>
          </div>
          {isPrivate && <p className="text-[11px] text-stone-500">A random invite code will be generated — share it to let people in.</p>}
          <button onClick={createCircle} className="w-full bg-emerald-700 text-white rounded-lg py-3 text-sm font-bold">
            Create
          </button>
        </div>
      )}
      {loading && <p className="text-sm text-stone-500">Loading...</p>}
      <div className="space-y-3">
        {circles.map((c) => (
          <button
            key={c.id}
            onClick={() => openCircle(c)}
            className="w-full text-left border border-stone-800 rounded-xl p-4 flex items-center justify-between hover:border-emerald-700 transition-colors"
          >
            <div>
              <p className="font-bold text-white flex items-center gap-1.5">
                {c.name}
                {c.is_private ? <Lock size={11} className="text-stone-500" /> : <Globe size={11} className="text-stone-600" />}
                {c.campus_tag && <span className="text-[10px] bg-emerald-900 text-emerald-300 px-1.5 py-0.5 rounded font-bold">Official</span>}
              </p>
              <p className="text-xs text-stone-500">{c.description || (c.is_private ? "Invite-only" : "Open to anyone")}</p>
            </div>
            <span className="flex items-center gap-1 text-xs text-stone-500">
              <Users size={13} /> {c.memberCount}
              {myCircleIds.has(c.id) && <span className="text-emerald-400 font-bold ml-1">· Member</span>}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
