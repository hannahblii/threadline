import React, { useEffect, useState } from "react";
import { Sparkles, MessageCircle } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import ItemCard from "./ItemCard";

export default function Feed({ session, campus, officialCircleId, onGoToMatches, onViewProfile }) {
  const userId = session.user.id;
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [likedIds, setLikedIds] = useState(new Set());
  const [savedIds, setSavedIds] = useState(new Set());
  const [showMatch, setShowMatch] = useState(null);

  async function loadAll() {
    if (!campus) return; // wait until we know which campus to filter by
    setLoading(true);
    // Fetch broadly (status + campus + not-mine), then filter to campus-wide
    // items client-side — avoids any query-string edge cases with circle_id.
    const [{ data: itemsData, error }, { data: swipes }, { data: saves }] = await Promise.all([
      supabase
        .from("items")
        .select("*, profiles!items_owner_id_fkey!inner(name, dorm, campus)")
        .eq("status", "available")
        .eq("profiles.campus", campus)
        .neq("owner_id", userId)
        .order("created_at", { ascending: false }),
      supabase.from("swipes").select("item_id").eq("user_id", userId).eq("direction", "like"),
      supabase.from("saves").select("item_id").eq("user_id", userId),
    ]);

    if (error) console.error(error);
    // Campus-wide = untagged (legacy) items, or items tagged to the official campus circle.
    const campusWide = (itemsData || []).filter((i) => !i.circle_id || i.circle_id === officialCircleId);
    setItems(campusWide.map((i) => ({ ...i, owner: i.profiles?.name, dorm: i.profiles?.dorm })));
    setLikedIds(new Set((swipes || []).map((s) => s.item_id)));
    setSavedIds(new Set((saves || []).map((s) => s.item_id)));
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, campus, officialCircleId]);

  async function handleLike(item) {
    const alreadyLiked = likedIds.has(item.id);
    const direction = alreadyLiked ? "pass" : "like"; // tapping again un-likes (records a pass instead)

    const { data, error } = await supabase.rpc("record_swipe_and_match", {
      p_item_id: item.id,
      p_direction: direction,
    });
    if (error) {
      console.error(error);
      return;
    }

    setLikedIds((prev) => {
      const next = new Set(prev);
      if (alreadyLiked) next.delete(item.id);
      else next.add(item.id);
      return next;
    });

    if (!alreadyLiked && data?.[0]?.matched) {
      setShowMatch(item);
    }
  }

  async function handleSave(item) {
    const alreadySaved = savedIds.has(item.id);
    if (alreadySaved) {
      await supabase.from("saves").delete().eq("user_id", userId).eq("item_id", item.id);
    } else {
      await supabase.from("saves").insert({ user_id: userId, item_id: item.id });
    }
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (alreadySaved) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
  }

  return (
    <div>
      <h2 className="font-black text-xl text-white mb-4">Campus feed</h2>
      {loading && <p className="text-sm text-stone-500">Loading...</p>}
      {!loading && items.length === 0 && (
        <p className="text-sm text-stone-500">No items listed yet. Be the first to add something in My closet.</p>
      )}
      <div className="grid grid-cols-2 gap-3">
        {items.map((i) => (
          <ItemCard
            key={i.id}
            item={i}
            onLike={handleLike}
            onSave={handleSave}
            liked={likedIds.has(i.id)}
            saved={savedIds.has(i.id)}
            onViewOwner={onViewProfile}
          />
        ))}
      </div>

      {showMatch && (
        <div className="fixed inset-0 bg-stone-950/80 flex items-center justify-center z-50 p-6" onClick={() => setShowMatch(null)}>
          <div className="bg-stone-900 rounded-2xl p-6 max-w-xs w-full text-center border border-stone-800" onClick={(e) => e.stopPropagation()}>
            <Sparkles className="mx-auto text-amber-500 mb-2" size={32} />
            <p className="font-black text-xl text-white">Chat opened!</p>
            <p className="text-sm text-stone-400 mt-1">You liked {showMatch.owner}'s item — you can chat with them now.</p>
            <button
              onClick={() => {
                setShowMatch(null);
                onGoToMatches?.();
              }}
              className="mt-4 w-full bg-emerald-700 text-white rounded-lg py-2 text-sm font-bold flex items-center justify-center gap-2"
            >
              <MessageCircle size={16} /> Start chatting
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
