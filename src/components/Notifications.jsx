import React, { useEffect, useState } from "react";
import { Heart, MessageCircle, CheckCircle2, Bell } from "lucide-react";
import { supabase } from "../lib/supabaseClient";

const ICONS = { like: Heart, match: Heart, message: MessageCircle, transaction: CheckCircle2 };

function timeAgo(dateStr) {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function Notifications({ session, onOpenConversation, onViewProfile }) {
  const userId = session.user.id;
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("notifications")
      .select("*, actor:profiles!notifications_actor_id_fkey(id, name)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) console.error(error);
    setItems(data || []);
    setLoading(false);
  }

  useEffect(() => {
    load();

    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        async (payload) => {
          // realtime payload doesn't include the joined actor profile, so fetch it
          const { data: actor } = await supabase.from("profiles").select("id, name").eq("id", payload.new.actor_id).maybeSingle();
          setItems((prev) => [{ ...payload.new, actor }, ...prev]);
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function markRead(n) {
    if (n.read) return;
    await supabase.from("notifications").update({ read: true }).eq("id", n.id);
    setItems((prev) => prev.map((i) => (i.id === n.id ? { ...i, read: true } : i)));
  }

  async function openNotification(n) {
    await markRead(n);
    if (n.conversation_id) onOpenConversation?.(n.conversation_id);
  }

  async function markAllRead() {
    const unreadIds = items.filter((i) => !i.read).map((i) => i.id);
    if (!unreadIds.length) return;
    await supabase.from("notifications").update({ read: true }).in("id", unreadIds);
    setItems((prev) => prev.map((i) => ({ ...i, read: true })));
  }

  const unreadCount = items.filter((i) => !i.read).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-black text-xl text-white">Notifications</h2>
        {unreadCount > 0 && (
          <button onClick={markAllRead} className="text-xs font-bold text-emerald-400">
            Mark all read
          </button>
        )}
      </div>

      {loading && <p className="text-sm text-stone-500">Loading...</p>}
      {!loading && items.length === 0 && (
        <div className="text-center py-12">
          <Bell className="mx-auto text-stone-700 mb-2" size={28} />
          <p className="text-sm text-stone-500">Nothing yet — likes, matches, messages, and trade updates will show up here.</p>
        </div>
      )}

      <div className="space-y-2">
        {items.map((n) => {
          const Icon = ICONS[n.type] || Bell;
          return (
            <div
              key={n.id}
              onClick={() => openNotification(n)}
              className={`w-full text-left border rounded-xl p-3 flex items-start gap-3 transition-colors cursor-pointer ${
                n.read ? "border-stone-800 bg-stone-900" : "border-emerald-800 bg-emerald-950/20"
              }`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${n.read ? "bg-stone-800 text-stone-400" : "bg-emerald-700 text-white"}`}>
                <Icon size={14} />
              </div>
              <div className="min-w-0 flex-1">
                <p className={`text-sm ${n.read ? "text-stone-300" : "text-white"}`}>
                  {n.actor?.id && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        markRead(n);
                        onViewProfile?.(n.actor.id);
                      }}
                      className="font-bold text-emerald-400 hover:underline"
                    >
                      {n.actor.name}
                    </button>
                  )}{" "}
                  {n.body}
                </p>
                <p className="text-[11px] text-stone-500 mt-0.5">{timeAgo(n.created_at)}</p>
              </div>
              {!n.read && <div className="w-2 h-2 rounded-full bg-emerald-500 mt-1.5 shrink-0" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
