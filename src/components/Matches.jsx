import React, { useEffect, useRef, useState } from "react";
import { Send, Shirt, CheckCircle2 } from "lucide-react";
import { supabase } from "../lib/supabaseClient";

const STATUS_STYLE = {
  active: { label: "Active", dot: "bg-emerald-500", badge: "bg-emerald-500/15 text-emerald-400" },
  pending_completion: { label: "Pending confirmation", dot: "bg-amber-400", badge: "bg-amber-400/15 text-amber-400" },
  completed: { label: "Completed", dot: "bg-red-500", badge: "bg-red-500/15 text-red-400" },
  closed: { label: "Unsuccessful", dot: "bg-stone-500", badge: "bg-stone-500/15 text-stone-400" },
};

function ThreadView({ conversation, session, onBack, onViewProfile }) {
  const userId = session.user.id;
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [items, setItems] = useState(conversation.items);
  const [incomingRequest, setIncomingRequest] = useState(null); // item pending MY confirmation
  const [txError, setTxError] = useState("");
  const bottomRef = useRef(null);

  useEffect(() => {
    let ignore = false;

    async function loadMessages() {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversation.id)
        .order("created_at", { ascending: true });
      if (!ignore) {
        if (error) console.error(error);
        setMessages(data || []);
      }
    }
    loadMessages();

    // Clear any unread notifications tied to this conversation now that it's open.
    supabase.from("notifications").update({ read: true }).eq("conversation_id", conversation.id).eq("user_id", userId).then(() => {});

    const msgChannel = supabase
      .channel(`conversation-${conversation.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversation.id}` },
        (payload) => setMessages((prev) => (prev.some((m) => m.id === payload.new.id) ? prev : [...prev, payload.new]))
      )
      .subscribe();

    // Live-watch this conversation's matches so a completion request/response
    // from the other person shows up while the chat is open.
    const matchChannel = supabase
      .channel(`conversation-matches-${conversation.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "matches", filter: `conversation_id=eq.${conversation.id}` },
        (payload) => {
          const row = payload.new;
          setItems((prev) => prev.map((i) => (i.matchId === row.id ? { ...i, status: row.status, requestedBy: row.requested_by } : i)));
          if (row.status === "pending_completion" && row.requested_by !== userId) {
            setIncomingRequest((prev) => prev ?? row);
          }
        }
      )
      .subscribe();

    return () => {
      ignore = true;
      supabase.removeChannel(msgChannel);
      supabase.removeChannel(matchChannel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id]);

  // Also catch anything already pending when the thread first opens.
  useEffect(() => {
    const pending = items.find((i) => i.status === "pending_completion" && i.requestedBy !== userId);
    if (pending) setIncomingRequest({ item_id: pending.id });
  }, [items, userId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const body = text.trim();
    if (!body) return;
    setText("");
    const { data, error } = await supabase
      .from("messages")
      .insert({ conversation_id: conversation.id, sender_id: userId, body })
      .select()
      .single();
    if (error) {
      console.error(error);
      return;
    }
    setMessages((prev) => (prev.some((m) => m.id === data.id) ? prev : [...prev, data]));
  }

  async function requestComplete(itemId) {
    setTxError("");
    const { data, error } = await supabase.rpc("request_transaction_complete", { p_item_id: itemId });
    if (error) {
      console.error(error);
      setTxError(`Couldn't send request: ${error.message}`);
      return;
    }
    if (data?.[0]?.match_id) {
      setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, status: "pending_completion", requestedBy: userId } : i)));
    } else {
      // The call succeeded but matched no row — usually means this item's
      // match isn't actually "active" right now (already pending/closed/completed).
      setTxError("Couldn't mark it complete — this item's status may have just changed. Try refreshing.");
    }
  }

  async function respond(accept) {
    setTxError("");
    const itemId = incomingRequest?.item_id || items.find((i) => i.status === "pending_completion")?.id;
    if (!itemId) {
      setTxError("Couldn't find the pending request — try refreshing.");
      return;
    }
    const { data, error } = await supabase.rpc("respond_transaction_complete", { p_item_id: itemId, p_accept: accept });
    if (error) {
      console.error(error);
      setTxError(`Couldn't respond: ${error.message}`);
      return;
    }
    const newStatus = data?.[0]?.status;
    if (newStatus && data[0].match_id) {
      setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, status: newStatus, requestedBy: null } : i)));
    } else {
      setTxError("Couldn't confirm — the request may have already been resolved.");
    }
    setIncomingRequest(null);
  }

  return (
    <div className="flex flex-col h-[calc(100vh-160px)]">
      <button onClick={onBack} className="text-sm text-emerald-400 font-bold mb-3 shrink-0">
        &larr; All matches
      </button>
      <div className="flex items-center justify-between gap-2 mb-3 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-9 h-9 rounded-full bg-emerald-700 flex items-center justify-center text-white font-bold text-xs shrink-0">
            {conversation.otherName?.[0]?.toUpperCase() || "?"}
          </div>
          <div className="min-w-0">
            {onViewProfile ? (
              <button onClick={() => onViewProfile(conversation.otherId)} className="font-bold text-white text-sm leading-tight truncate hover:underline">
                {conversation.otherName}
              </button>
            ) : (
              <p className="font-bold text-white text-sm leading-tight truncate">{conversation.otherName}</p>
            )}
          </div>
        </div>
      </div>

      <div className="mb-3 shrink-0">
        <div className="h-[72px] overflow-y-auto snap-y snap-mandatory rounded-lg border border-stone-800 divide-y divide-stone-800">
          {items.map((item) => {
            const s = STATUS_STYLE[item.status] || STATUS_STYLE.closed;
            return (
              <div key={item.id} className="h-[72px] snap-start flex items-center gap-2 bg-stone-900 p-2 shrink-0">
                <div className="w-9 h-9 rounded-full overflow-hidden bg-stone-800 flex items-center justify-center shrink-0">
                  {item.photo_url ? (
                    <img src={item.photo_url} alt={item.title} className="w-full h-full object-cover" />
                  ) : (
                    <Shirt size={16} className="text-white/70" />
                  )}
                </div>
                <p className="flex-1 min-w-0 text-sm text-white truncate">{item.title}</p>
                <span className={`flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full shrink-0 ${s.badge}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                  {s.label}
                </span>
                {item.status === "active" && (
                  <button
                    onClick={() => requestComplete(item.id)}
                    className="flex items-center gap-1 text-xs font-bold text-emerald-400 border border-emerald-700 rounded-lg px-2 py-1.5 shrink-0"
                  >
                    <CheckCircle2 size={13} /> Confirm Transaction
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {items.length > 1 && <p className="text-[10px] text-stone-600 text-center mt-1">scroll for more items ▲ ▼</p>}
        {txError && <p className="text-[11px] text-red-400">{txError}</p>}
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {messages.length === 0 && (
          <p className="text-xs text-stone-500 text-center mt-8">Say hi to {conversation.otherName}.</p>
        )}
        {messages.map((m) => {
          const mine = m.sender_id === userId;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[75%] rounded-xl px-3 py-2 text-sm ${
                  mine ? "bg-emerald-700 text-white" : "bg-stone-800 text-white"
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
          className="flex-1 bg-stone-950 border border-stone-700 rounded-lg px-3 py-2 text-sm text-white placeholder-stone-500"
        />
        <button onClick={send} className="bg-emerald-700 text-white rounded-lg px-3 flex items-center justify-center">
          <Send size={16} />
        </button>
      </div>

      {incomingRequest && (
        <div className="fixed inset-0 bg-stone-950/80 flex items-center justify-center z-50 p-6">
          <div className="bg-stone-900 rounded-2xl p-6 max-w-xs w-full text-center border border-stone-800">
            <CheckCircle2 className="mx-auto text-emerald-500 mb-2" size={32} />
            <p className="font-black text-lg text-white">Confirm the trade?</p>
            <p className="text-sm text-stone-400 mt-1">{conversation.otherName} marked this transaction as complete.</p>
            {txError && <p className="text-xs text-red-400 mt-2">{txError}</p>}
            <div className="flex gap-2 mt-4">
              <button onClick={() => respond(false)} className="flex-1 border border-stone-700 text-stone-300 rounded-lg py-2 text-sm font-bold">
                Not yet
              </button>
              <button onClick={() => respond(true)} className="flex-1 bg-emerald-700 text-white rounded-lg py-2 text-sm font-bold">
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// One row per person you've matched with. If you've matched on several of
// their items, their little circular photos overlap like a stack — click
// through them to see which item is "selected"; the selected item's status
// controls the row's tint: active = normal, closed = red "Closed", completed
// = red "Success", pending_completion = amber "Pending confirmation".
function ConversationRow({ conversation, onOpen, onViewProfile }) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const selected = conversation.items[selectedIdx];
  const status = selected?.status;

  function cycle(e) {
    e.stopPropagation();
    setSelectedIdx((i) => (i + 1) % conversation.items.length);
  }

  const styleByStatus = {
    closed: { row: "border-red-900 bg-red-950/30", label: "text-red-400/80", text: "text-red-400/70", tag: "Closed" },
    completed: { row: "border-red-900 bg-red-950/30", label: "text-red-400/80", text: "text-red-400/70", tag: "Success" },
    pending_completion: { row: "border-amber-800 bg-amber-950/20", label: "text-amber-400/90", text: "text-amber-400/80", tag: "Pending" },
  };
  const s = styleByStatus[status];

  return (
    <button
      onClick={() => onOpen(conversation)}
      className={`relative w-full text-left border rounded-xl p-3 flex items-center gap-3 transition-colors ${
        s ? s.row : "border-stone-800 hover:border-emerald-700"
      }`}
    >
      {s && <span className={`absolute top-2 right-3 text-[10px] font-bold uppercase tracking-wide ${s.label}`}>{s.tag}</span>}

      <div className="flex items-center shrink-0" onClick={conversation.items.length > 1 ? cycle : undefined}>
        {conversation.items.map((item, idx) => (
          <div
            key={item.id}
            className={`w-10 h-10 rounded-full border-2 overflow-hidden bg-stone-800 flex items-center justify-center ${
              idx === selectedIdx ? "border-emerald-500 z-10" : "border-stone-950"
            }`}
            style={{ marginLeft: idx === 0 ? 0 : -14 }}
          >
            {item.photo_url ? (
              <img src={item.photo_url} alt={item.title} className="w-full h-full object-cover" />
            ) : (
              <Shirt size={16} className="text-white/70" />
            )}
          </div>
        ))}
      </div>

      <div className="min-w-0">
        {onViewProfile ? (
          <span
            role="button"
            onClick={(e) => {
              e.stopPropagation();
              onViewProfile(conversation.otherId);
            }}
            className="font-bold text-white text-sm truncate hover:underline block"
          >
            {conversation.otherName}
          </span>
        ) : (
          <p className="font-bold text-white text-sm truncate">{conversation.otherName}</p>
        )}
        <p className={`text-xs truncate ${s ? s.text : "text-stone-500"}`}>
          {status === "closed" && `Unliked "${selected.title}"`}
          {status === "completed" && `Completed "${selected.title}"`}
          {status === "pending_completion" && `Pending confirmation for "${selected.title}"`}
          {status === "active" && `Liked "${selected?.title}"`}
          {conversation.items.length > 1 && ` · tap avatars to see all ${conversation.items.length}`}
        </p>
      </div>
    </button>
  );
}

export default function Matches({ session, initialConversationId, onConsumedInitial, onViewProfile }) {
  const userId = session.user.id;
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data, error } = await supabase
        .from("matches")
        .select(
          "*, item:items(id, title, photo_url), a:profiles!matches_user_a_fkey(id, name), b:profiles!matches_user_b_fkey(id, name)"
        )
        .or(`user_a.eq.${userId},user_b.eq.${userId}`)
        .order("created_at", { ascending: false });

      if (error) console.error(error);

      const byConversation = {};
      (data || []).forEach((m) => {
        if (!m.conversation_id) return;
        const other = m.a.id === userId ? m.b : m.a;
        if (!byConversation[m.conversation_id]) {
          byConversation[m.conversation_id] = { id: m.conversation_id, otherName: other?.name, otherId: other?.id, items: [] };
        }
        byConversation[m.conversation_id].items.push({
          id: m.item?.id,
          matchId: m.id,
          title: m.item?.title,
          photo_url: m.item?.photo_url,
          status: m.status,
          requestedBy: m.requested_by,
        });
      });

      const grouped = Object.values(byConversation);
      setConversations(grouped);

      if (initialConversationId) {
        const found = grouped.find((c) => c.id === initialConversationId);
        if (found) setActive(found);
        onConsumedInitial?.();
      }

      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, initialConversationId]);

  if (active) return <ThreadView conversation={active} session={session} onBack={() => setActive(null)} onViewProfile={onViewProfile} />;

  return (
    <div>
      <h2 className="font-black text-xl text-white mb-4">Messages</h2>
      {loading && <p className="text-sm text-stone-500">Loading...</p>}
      {!loading && conversations.length === 0 && (
        <p className="text-sm text-stone-500">No matches yet — go like some items.</p>
      )}
      <div className="space-y-2">
        {conversations.map((c) => (
          <ConversationRow key={c.id} conversation={c} onOpen={setActive} onViewProfile={onViewProfile} />
        ))}
      </div>
    </div>
  );
}
