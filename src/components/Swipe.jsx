import React, { useEffect, useRef, useState } from "react";
import { Heart, X, Shirt, MessageCircle, Sparkles } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { CATEGORY_COLORS, TYPE_LABEL } from "./ItemCard";

export default function Swipe({ session, onGoToMatches }) {
  const [items, setItems] = useState([]);
  const [idx, setIdx] = useState(0);
  const [dragX, setDragX] = useState(0);
  const [showMatch, setShowMatch] = useState(null);
  const [matchCount, setMatchCount] = useState(0);
  const [circles, setCircles] = useState([]);
  const [selectedCircle, setSelectedCircle] = useState(""); // "" = everything I can see
  const dragging = useRef(false);
  const startX = useRef(0);
  const userId = session.user.id;

  // Load the circles this user belongs to, for the filter dropdown.
  useEffect(() => {
    supabase
      .from("circle_members")
      .select("circles(id, name)")
      .eq("user_id", userId)
      .then(({ data }) => setCircles((data || []).map((d) => d.circles).filter(Boolean)));
  }, [userId]);

  useEffect(() => {
    async function load() {
      const { data: alreadySwiped } = await supabase
        .from("swipes")
        .select("item_id")
        .eq("user_id", userId);
      const swipedIds = (alreadySwiped || []).map((s) => s.item_id);

      let query = supabase
        .from("items")
        .select("*, profiles!items_owner_id_fkey(name, dorm)")
        .eq("status", "available")
        .neq("owner_id", userId);

      if (selectedCircle) query = query.eq("circle_id", selectedCircle);
      if (swipedIds.length) query = query.not("id", "in", `(${swipedIds.join(",")})`);

      const { data, error } = await query;
      if (error) console.error(error);
      setItems((data || []).map((i) => ({ ...i, owner: i.profiles?.name, dorm: i.profiles?.dorm })));
      setIdx(0);
    }
    load();
  }, [userId, selectedCircle]);

  const current = items[idx];

  async function decide(direction) {
    if (!current) return;

    await supabase.from("swipes").insert({ user_id: userId, item_id: current.id, direction });

    if (direction === "like") {
      const { data: myItems } = await supabase.from("items").select("id").eq("owner_id", userId);
      const myItemIds = (myItems || []).map((i) => i.id);

      if (myItemIds.length) {
        const { data: ownerLikedMine } = await supabase
          .from("swipes")
          .select("id")
          .eq("user_id", current.owner_id)
          .eq("direction", "like")
          .in("item_id", myItemIds)
          .limit(1);

        if (ownerLikedMine && ownerLikedMine.length) {
          const { data: match } = await supabase
            .from("matches")
            .insert({ user_a: userId, user_b: current.owner_id, item_id: current.id })
            .select()
            .single();
          if (match) {
            setShowMatch(current);
            setMatchCount((c) => c + 1);
          }
        }
      }
    }

    setDragX(0);
    setIdx((i) => i + 1);
  }

  function onPointerDown(e) {
    dragging.current = true;
    startX.current = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
  }
  function onPointerMove(e) {
    if (!dragging.current) return;
    const x = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
    setDragX(x - startX.current);
  }
  function onPointerUp() {
    dragging.current = false;
    if (dragX > 90) decide("like");
    else if (dragX < -90) decide("pass");
    else setDragX(0);
  }

  const circlePicker = (
    <select
      value={selectedCircle}
      onChange={(e) => setSelectedCircle(e.target.value)}
      className="w-full max-w-xs mb-4 border border-stone-300 rounded-lg px-3 py-2 text-sm font-bold text-stone-700"
    >
      <option value="">Swiping: everything</option>
      {circles.map((c) => (
        <option key={c.id} value={c.id}>
          Swiping: {c.name} only
        </option>
      ))}
    </select>
  );

  if (!current) {
    return (
      <div className="flex flex-col items-center py-6">
        {circles.length > 0 && circlePicker}
        <p className="text-center text-stone-500 py-12">No more items to swipe on right now — check back later.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center py-6">
      {circles.length > 0 && circlePicker}

      <div
        className="relative w-full max-w-xs h-96 mb-6 select-none touch-none"
        onMouseDown={onPointerDown}
        onMouseMove={onPointerMove}
        onMouseUp={onPointerUp}
        onMouseLeave={() => dragging.current && onPointerUp()}
        onTouchStart={onPointerDown}
        onTouchMove={onPointerMove}
        onTouchEnd={onPointerUp}
      >
        <div
          className="absolute inset-0 bg-white border-2 border-stone-200 rounded-2xl shadow-lg cursor-grab active:cursor-grabbing overflow-hidden"
          style={{
            transform: `translateX(${dragX}px) rotate(${dragX / 20}deg)`,
            transition: dragging.current ? "none" : "transform 0.25s ease",
          }}
        >
          <div className={`h-56 ${CATEGORY_COLORS[current.category] || "bg-stone-500"} flex items-center justify-center relative overflow-hidden`}>
            {current.photo_url ? (
              <img src={current.photo_url} alt={current.title} className="w-full h-full object-cover" />
            ) : (
              <Shirt className="text-white/70" size={64} strokeWidth={1.5} />
            )}
            {dragX > 40 && (
              <div className="absolute top-6 left-6 border-4 border-emerald-500 text-emerald-500 font-black text-xl px-3 py-1 rotate-[-12deg] rounded">
                LIKE
              </div>
            )}
            {dragX < -40 && (
              <div className="absolute top-6 right-6 border-4 border-stone-500 text-stone-500 font-black text-xl px-3 py-1 rotate-[12deg] rounded">
                PASS
              </div>
            )}
          </div>
          <div className="p-4">
            <p className="font-bold text-stone-900">{current.title}</p>
            <p className="text-sm text-stone-500 mt-1">
              {current.category} · Size {current.size} · {current.dorm}
            </p>
            <p className="text-sm font-bold text-emerald-800 mt-2">
              {(current.listing_type || []).map((t) => TYPE_LABEL[t]).join(" · ")}
              {current.price ? ` · $${current.price}` : ""}
            </p>
            <p className="text-xs text-stone-400 mt-1">Owned by {current.owner}</p>
          </div>
        </div>
      </div>

      <div className="flex gap-6">
        <button
          onClick={() => decide("pass")}
          className="w-14 h-14 rounded-full border-2 border-stone-300 flex items-center justify-center text-stone-500 hover:border-stone-500 transition-colors"
        >
          <X size={26} />
        </button>
        <button
          onClick={() => decide("like")}
          className="w-14 h-14 rounded-full border-2 border-emerald-600 flex items-center justify-center text-emerald-700 hover:bg-emerald-50 transition-colors"
        >
          <Heart size={24} />
        </button>
      </div>
      <p className="text-xs text-stone-400 mt-4">Drag the card, or use the buttons · {matchCount} matches so far</p>

      {showMatch && (
        <div className="fixed inset-0 bg-stone-900/60 flex items-center justify-center z-50 p-6" onClick={() => setShowMatch(null)}>
          <div className="bg-white rounded-2xl p-6 max-w-xs w-full text-center" onClick={(e) => e.stopPropagation()}>
            <Sparkles className="mx-auto text-amber-500 mb-2" size={32} />
            <p className="font-black text-xl text-stone-900">It's a match!</p>
            <p className="text-sm text-stone-500 mt-1">
              You and {showMatch.owner} both liked each other's items.
            </p>
            <button
              onClick={() => {
                setShowMatch(null);
                onGoToMatches?.();
              }}
              className="mt-4 w-full bg-emerald-800 text-white rounded-lg py-2 text-sm font-bold flex items-center justify-center gap-2"
            >
              <MessageCircle size={16} /> Start chatting
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
