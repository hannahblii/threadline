import React, { useEffect, useRef, useState } from "react";
import { MessageCircle, Send, Shirt } from "lucide-react";
import { supabase } from "../lib/supabaseClient";

function ThreadView({ match, session, onBack }) {
  const userId = session.user.id;
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const bottomRef = useRef(null);

  useEffect(() => {
    let ignore = false;

    async function loadMessages() {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("match_id", match.id)
        .order("created_at", { ascending: true });
      if (!ignore) {
        if (error) console.error(error);
        setMessages(data || []);
      }
    }
    loadMessages();

    // Live updates: anyone sending a message to this match shows up instantly.
    const channel = supabase
      .channel(`match-${match.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `match_id=eq.${match.id}` },
        (payload) => setMessages((prev) => [...prev, payload.new])
      )
      .subscribe();

    return () => {
      ignore = true;
      supabase.removeChannel(channel);
    };
  }, [match.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const body = text.trim();
    if (!body) return;
    setText("");
    const { error } = await supabase.from("messages").insert({ match_id: match.id, sender_id: userId, body });
    if (error) console.error(error);
  }

  return (
    <div className="flex flex-col h-[calc(100vh-160px)]">
      <button onClick={onBack} className="text-sm text-emerald-800 font-bold mb-3 shrink-0">
        &larr; All matches
      </button>
      <div className="flex items-center gap-2 mb-3 shrink-0">
        <div className="w-9 h-9 rounded-full bg-emerald-800 flex items-center justify-center text-white font-bold text-xs">
          {match.otherName?.[0]?.toUpperCase() || "?"}
        </div>
        <div>
          <p className="font-bold text-stone-900 text-sm leading-tight">{match.otherName}</p>
          <p className="text-xs text-stone-500 flex items-center gap-1">
            <Shirt size={11} /> matched on {match.itemTitle}
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {messages.length === 0 && (
          <p className="text-xs text-stone-400 text-center mt-8">Say hi — you matched on {match.itemTitle}.</p>
        )}
        {messages.map((m) => {
          const mine = m.sender_id === userId;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[75%] rounded-xl px-3 py-2 text-sm ${
                  mine ? "bg-emerald-800 text-white" : "bg-stone-100 text-stone-900"
                }`}
              >
                {m.body}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="flex gap-2 pt-3 shrink-0">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Message..."
          className="flex-1 border border-stone-300 rounded-lg px-3 py-2 text-sm"
        />
        <button onClick={send} className="bg-emerald-800 text-white rounded-lg px-3 flex items-center justify-center">
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}

export default function Matches({ session }) {
  const userId = session.user.id;
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data, error } = await supabase
        .from("matches")
        .select("*, item:items(title), a:profiles!matches_user_a_fkey(id, name), b:profiles!matches_user_b_fkey(id, name)")
        .or(`user_a.eq.${userId},user_b.eq.${userId}`)
        .order("created_at", { ascending: false });

      if (error) console.error(error);

      setMatches(
        (data || []).map((m) => {
          const other = m.a.id === userId ? m.b : m.a;
          return { ...m, otherName: other?.name, itemTitle: m.item?.title };
        })
      );
      setLoading(false);
    }
    load();
  }, [userId]);

  if (active) return <ThreadView match={active} session={session} onBack={() => setActive(null)} />;

  return (
    <div>
      <h2 className="font-black text-xl text-stone-900 mb-4">Matches</h2>
      {loading && <p className="text-sm text-stone-400">Loading...</p>}
      {!loading && matches.length === 0 && (
        <p className="text-sm text-stone-400">No matches yet — go swipe on some items.</p>
      )}
      <div className="space-y-2">
        {matches.map((m) => (
          <button
            key={m.id}
            onClick={() => setActive(m)}
            className="w-full text-left border border-stone-200 rounded-xl p-3 flex items-center gap-3 hover:border-emerald-700 transition-colors"
          >
            <div className="w-10 h-10 rounded-full bg-emerald-800 flex items-center justify-center text-white font-bold text-sm shrink-0">
              {m.otherName?.[0]?.toUpperCase() || "?"}
            </div>
            <div className="min-w-0">
              <p className="font-bold text-stone-900 text-sm truncate">{m.otherName}</p>
              <p className="text-xs text-stone-500 flex items-center gap-1 truncate">
                <MessageCircle size={11} /> matched on {m.itemTitle}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
