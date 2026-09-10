import React, { useEffect, useRef, useState } from "react";
import { Heart, X, Shirt, MessageCircle, Sparkles } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { CATEGORY_COLORS, TYPE_LABEL } from "./ItemCard";

export default function Swipe({ session, campus, officialCircleId, onGoToMatches, onViewProfile }) {
  const [items, setItems] = useState([]);
  const [idx, setIdx] = useState(0);
  const [dragX, setDragX] = useState(0);
  const [showMatch, setShowMatch] = useState(null);
  const [matchCount, setMatchCount] = useState(0);
  const [swipeError, setSwipeError] = useState("");
  const [circles, setCircles] = useState([]);
  const [scope, setScope] = useState("school"); // "school" | "circle"
  const [selectedCircle, setSelectedCircle] = useState(""); // which circle, only relevant when scope === "circle"
  const dragging = useRef(false);
  const startX = useRef(0);
  const shownMatchIds = useRef(new Set());
  const userId = session.user.id;

  // A match only becomes real once BOTH people have liked. Whoever's like
  // happens second gets told immediately via the RPC response below — but
  // the first person to like never gets that response, since nothing new
  // happened on their end at the time. This listens for matches that just
  // turned active from someone ELSE's action, so both people get notified
  // live, not just whoever happened to swipe second.
  useEffect(() => {
    async function announceMatch(matchRow) {
      if (shownMatchIds.current.has(matchRow.id)) return;
      shownMatchIds.current.add(matchRow.id);

      const { data: item } = await supabase.from("items").select("title, owner_id").eq("id", matchRow.item_id).maybeSingle();
      const otherId = matchRow.user_a === userId ? matchRow.user_b : matchRow.user_a;
      const { data: otherProfile } = await supabase.from("profiles").select("name").eq("id", otherId).maybeSingle();

      setShowMatch({ title: item?.title, owner: otherProfile?.name });
      setMatchCount((c) => c + 1);
    }

    function handlePayload(payload) {
      if (payload.new?.status === "active") announceMatch(payload.new);
    }

    const channelA = supabase
      .channel(`my-matches-a-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "matches", filter: `user_a=eq.${userId}` }, handlePayload)
      .subscribe();
    const channelB = supabase
      .channel(`my-matches-b-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "matches", filter: `user_b=eq.${userId}` }, handlePayload)
      .subscribe();

    return () => {
      supabase.removeChannel(channelA);
      supabase.removeChannel(channelB);
    };
  }, [userId]);

  // Load the circles this user belongs to (scoped to the current campus), for the circle picker.
  useEffect(() => {
    if (!campus) return;
    supabase
      .from("circle_members")
      .select("circles(id, name, campus, campus_tag)")
      .eq("user_id", userId)
      .then(({ data }) => {
        // Exclude the official school circle here — it's redundant with "Your
        // school" and shouldn't show up as a separate circle option.
        const mine = (data || []).map((d) => d.circles).filter((c) => c && c.campus === campus && !c.campus_tag);
        setCircles(mine);
        setSelectedCircle((prev) => (mine.some((c) => c.id === prev) ? prev : mine[0]?.id || ""));
      });
  }, [userId, campus]);

  useEffect(() => {
    async function load() {
      if (!campus) return;
      if (scope === "circle" && !selectedCircle) {
        setItems([]);
        return;
      }
      const { data: alreadySwiped } = await supabase
        .from("swipes")
        .select("item_id")
        .eq("user_id", userId);
      const swipedIds = (alreadySwiped || []).map((s) => s.item_id);

      let query = supabase
        .from("items")
        .select("*, profiles!items_owner_id_fkey!inner(name, dorm, campus)")
        .eq("status", "available")
        .eq("profiles.campus", campus)
        .neq("owner_id", userId);

      // Circle scope can filter directly in the query (exact circle id).
      // School scope filters client-side after fetching, to avoid any
      // query-string edge cases with matching "null or this specific id".
      if (scope === "circle") query = query.eq("circle_id", selectedCircle);
      if (swipedIds.length) query = query.not("id", "in", `(${swipedIds.join(",")})`);

      const { data, error } = await query;
      if (error) console.error(error);
      const filtered = scope === "circle" ? data || [] : (data || []).filter((i) => !i.circle_id || i.circle_id === officialCircleId);
      setItems(filtered.map((i) => ({ ...i, owner: i.profiles?.name, dorm: i.profiles?.dorm })));
      setIdx(0);
    }
    load();
  }, [userId, scope, selectedCircle, campus, officialCircleId]);

  const current = items[idx];

  async function decide(direction) {
    if (!current) return;
    setSwipeError("");

    if (direction === "like") {
      const { data, error } = await supabase.rpc("record_swipe_and_match", {
        p_item_id: current.id,
        p_direction: direction,
      });
      if (error) {
        console.error(error);
        setSwipeError(`Swipe didn't save: ${error.message}`);
        return; // don't advance the card if it failed to record
      } else if (data?.[0]?.matched && data[0].match_id && !shownMatchIds.current.has(data[0].match_id)) {
        shownMatchIds.current.add(data[0].match_id);
        setShowMatch(current);
        setMatchCount((c) => c + 1);
      }
    } else {
      const { error } = await supabase.rpc("record_swipe_and_match", { p_item_id: current.id, p_direction: direction });
      if (error) {
        console.error(error);
        setSwipeError(`Swipe didn't save: ${error.message}`);
        return;
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

  const scopePicker = (
    <div className="w-full max-w-xs mb-4">
      <div className="flex bg-stone-900 border border-stone-800 rounded-lg p-1">
        <button
          onClick={() => setScope("school")}
          className={`flex-1 text-xs font-bold py-1.5 rounded-md transition-colors ${
            scope === "school" ? "bg-emerald-700 text-white" : "text-stone-400"
          }`}
        >
          Your school
        </button>
        <button
          onClick={() => setScope("circle")}
          disabled={circles.length === 0}
          className={`flex-1 text-xs font-bold py-1.5 rounded-md transition-colors disabled:opacity-40 ${
            scope === "circle" ? "bg-emerald-700 text-white" : "text-stone-400"
          }`}
        >
          Circles only
        </button>
      </div>
      {scope === "circle" && circles.length > 0 && (
        <select
          value={selectedCircle}
          onChange={(e) => setSelectedCircle(e.target.value)}
          className="w-full mt-2 bg-stone-900 border border-stone-800 rounded-lg px-3 py-2 text-sm font-bold text-white"
        >
          {circles.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );

  if (!current) {
    return (
      <div className="flex flex-col items-center py-6">
        {scopePicker}
        <p className="text-center text-stone-500 py-12">No more items to swipe on right now — check back later.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center py-6">
      {scopePicker}

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
          className="absolute inset-0 bg-stone-900 border-2 border-stone-800 rounded-2xl shadow-lg cursor-grab active:cursor-grabbing overflow-hidden"
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
            <p className="font-bold text-white">{current.title}</p>
            <p className="text-sm text-stone-500 mt-1">
              {current.category} · Size {current.size} · {current.dorm}
            </p>
            <p className="text-sm font-bold text-emerald-800 mt-2">
              {(current.listing_type || []).map((t) => TYPE_LABEL[t]).join(" · ")}
              {current.price ? ` · $${current.price}` : ""}
            </p>
            <p className="text-xs text-stone-400 mt-1">
              Owned by{" "}
              {onViewProfile ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onViewProfile(current.owner_id);
                  }}
                  className="text-emerald-400 font-bold hover:underline"
                >
                  {current.owner}
                </button>
              ) : (
                current.owner
              )}
            </p>
          </div>
        </div>
      </div>

      <div className="flex gap-8">
        <button
          onClick={() => decide("pass")}
          className="w-16 h-16 rounded-full border-2 border-stone-700 flex items-center justify-center text-stone-500 hover:border-stone-500 active:scale-95 transition-all"
        >
          <X size={28} />
        </button>
        <button
          onClick={() => decide("like")}
          className="w-16 h-16 rounded-full border-2 border-emerald-600 flex items-center justify-center text-emerald-500 hover:bg-emerald-950 active:scale-95 transition-all"
        >
          <Heart size={26} />
        </button>
      </div>
      <p className="text-xs text-stone-500 mt-4">Drag the card, or use the buttons · {matchCount} matches so far</p>
      {swipeError && <p className="text-xs text-red-400 mt-2 max-w-xs text-center">{swipeError}</p>}

      {showMatch && (
        <div className="fixed inset-0 bg-stone-900/60 flex items-center justify-center z-50 p-6" onClick={() => setShowMatch(null)}>
          <div className="bg-stone-900 rounded-2xl p-6 max-w-xs w-full text-center" onClick={(e) => e.stopPropagation()}>
            <Sparkles className="mx-auto text-amber-500 mb-2" size={32} />
            <p className="font-black text-xl text-white">Chat opened!</p>
            <p className="text-sm text-stone-500 mt-1">
              You liked {showMatch.owner}'s item — you can chat with them now.
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
