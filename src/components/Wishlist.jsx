import React, { useEffect, useState } from "react";
import { Heart, Bookmark, MessageCircle } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import ItemCard from "./ItemCard";

export default function Wishlist({ session, onOpenMatch, onViewProfile }) {
  const userId = session.user.id;
  const [hearted, setHearted] = useState([]);
  const [saved, setSaved] = useState([]);
  const [matchByItem, setMatchByItem] = useState({}); // item_id -> match row
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);

    const [{ data: likedItems }, { data: savedItems }, { data: myMatches }] = await Promise.all([
      supabase
        .from("swipes")
        .select("item_id, items(*, profiles!items_owner_id_fkey(name, dorm))")
        .eq("user_id", userId)
        .eq("direction", "like"),
      supabase
        .from("saves")
        .select("item_id, items(*, profiles!items_owner_id_fkey(name, dorm))")
        .eq("user_id", userId),
      supabase.from("matches").select("*").or(`user_a.eq.${userId},user_b.eq.${userId}`),
    ]);

    const heartedIds = new Set((likedItems || []).filter((r) => r.items).map((r) => r.item_id));

    setHearted(
      (likedItems || [])
        .filter((r) => r.items)
        .map((r) => ({ ...r.items, owner: r.items.profiles?.name, dorm: r.items.profiles?.dorm }))
    );
    setSaved(
      (savedItems || [])
        .filter((r) => r.items && !heartedIds.has(r.item_id)) // an item that's both liked and saved only shows under Hearted
        .map((r) => ({ ...r.items, owner: r.items.profiles?.name, dorm: r.items.profiles?.dorm }))
    );

    const map = {};
    (myMatches || []).forEach((m) => {
      map[m.item_id] = m;
    });
    setMatchByItem(map);

    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  return (
    <div>
      <h2 className="font-black text-xl text-white mb-4">Wishlist</h2>
      {loading && <p className="text-sm text-stone-500">Loading...</p>}

      <div className="mb-6">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-red-400 mb-2">
          <Heart size={13} fill="currentColor" /> Hearted
        </p>
        {!loading && hearted.length === 0 && (
          <p className="text-sm text-stone-500">Nothing hearted yet — like items in the feed or swipe screen.</p>
        )}
        <div className="grid grid-cols-2 gap-3">
          {hearted.map((item) => {
            const match = matchByItem[item.id];
            return (
              <div key={item.id}>
                <ItemCard item={item} compact onViewOwner={onViewProfile} />
                {match ? (
                  <button
                    onClick={() => onOpenMatch?.(match.conversation_id)}
                    disabled={!match.conversation_id}
                    className="w-full mt-1.5 flex items-center justify-center gap-1 text-xs font-bold text-emerald-400 border border-emerald-700 rounded-lg py-1.5 disabled:opacity-50"
                  >
                    <MessageCircle size={12} />{" "}
                    {match.status === "closed" && "Open chat (closed)"}
                    {match.status === "completed" && "Open chat (completed)"}
                    {match.status === "pending_completion" && "Open chat (pending)"}
                    {match.status === "active" && "Open chat"}
                  </button>
                ) : (
                  <p className="text-[11px] text-stone-500 text-center mt-1.5">No match yet</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-amber-400 mb-2">
          <Bookmark size={13} fill="currentColor" /> Saved
        </p>
        {!loading && saved.length === 0 && (
          <p className="text-sm text-stone-500">Nothing saved yet — tap Save on an item in the feed.</p>
        )}
        <div className="grid grid-cols-2 gap-3">
          {saved.map((item) => (
            <ItemCard key={item.id} item={item} compact onViewOwner={onViewProfile} />
          ))}
        </div>
      </div>
    </div>
  );
}
