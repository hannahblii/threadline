import React, { useEffect, useState } from "react";
import { User } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import ItemCard from "./ItemCard";

export default function Profile({ userId, session, onBack }) {
  const myId = session?.user?.id;
  const isOwnProfile = myId === userId;

  const [profile, setProfile] = useState(null);
  const [items, setItems] = useState([]);
  const [likedIds, setLikedIds] = useState(new Set());
  const [savedIds, setSavedIds] = useState(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;
    async function load() {
      setLoading(true);
      const [{ data: p }, { data: itemsData }, swipesRes, savesRes] = await Promise.all([
        supabase.from("profiles").select("name, dorm").eq("id", userId).maybeSingle(),
        // RLS already restricts this to items you're actually allowed to see
        // (campus-wide, or a circle you share with them).
        supabase.from("items").select("*").eq("owner_id", userId).eq("status", "available").order("created_at", { ascending: false }),
        myId ? supabase.from("swipes").select("item_id").eq("user_id", myId).eq("direction", "like") : Promise.resolve({ data: [] }),
        myId ? supabase.from("saves").select("item_id").eq("user_id", myId) : Promise.resolve({ data: [] }),
      ]);
      if (!ignore) {
        setProfile(p);
        setItems(itemsData || []);
        setLikedIds(new Set((swipesRes.data || []).map((s) => s.item_id)));
        setSavedIds(new Set((savesRes.data || []).map((s) => s.item_id)));
        setLoading(false);
      }
    }
    load();
    return () => {
      ignore = true;
    };
  }, [userId, myId]);

  async function handleLike(item) {
    const alreadyLiked = likedIds.has(item.id);
    const direction = alreadyLiked ? "pass" : "like";
    const { error } = await supabase.rpc("record_swipe_and_match", { p_item_id: item.id, p_direction: direction });
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
  }

  async function handleSave(item) {
    const alreadySaved = savedIds.has(item.id);
    if (alreadySaved) {
      await supabase.from("saves").delete().eq("user_id", myId).eq("item_id", item.id);
    } else {
      await supabase.from("saves").insert({ user_id: myId, item_id: item.id });
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
      <button onClick={onBack} className="text-sm text-emerald-400 font-bold mb-4">
        &larr; Back
      </button>

      {loading && <p className="text-sm text-stone-500">Loading...</p>}

      {!loading && profile && (
        <>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-14 h-14 rounded-full bg-emerald-700 flex items-center justify-center text-white font-bold text-xl shrink-0">
              {profile.name?.[0]?.toUpperCase() || <User size={22} />}
            </div>
            <div>
              <p className="font-black text-white text-lg leading-tight">{profile.name}</p>
              {profile.dorm && <p className="text-xs text-stone-500">{profile.dorm}</p>}
            </div>
          </div>

          <p className="text-xs font-bold uppercase tracking-wide text-stone-500 mb-2">
            {profile.name}'s closet
          </p>
          {items.length === 0 ? (
            <p className="text-sm text-stone-500">Nothing listed yet.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {items.map((i) => (
                <ItemCard
                  key={i.id}
                  item={i}
                  compact
                  onLike={isOwnProfile ? undefined : handleLike}
                  onSave={isOwnProfile ? undefined : handleSave}
                  liked={likedIds.has(i.id)}
                  saved={savedIds.has(i.id)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {!loading && !profile && <p className="text-sm text-stone-500">Couldn't find that profile.</p>}
    </div>
  );
}
