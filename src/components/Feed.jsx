import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import ItemCard from "./ItemCard";

export default function Feed() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;
    async function load() {
      setLoading(true);
      // RLS already restricts rows to: circle_id is null (campus-wide)
      // OR the current user is a member of that circle. No extra filtering needed here.
      const { data, error } = await supabase
        .from("items")
        .select("*, profiles!items_owner_id_fkey(name, dorm)")
        .eq("status", "available")
        .order("created_at", { ascending: false });

      if (!ignore) {
        if (error) console.error(error);
        setItems(
          (data || []).map((i) => ({
            ...i,
            owner: i.profiles?.name,
            dorm: i.profiles?.dorm,
          }))
        );
        setLoading(false);
      }
    }
    load();
    return () => {
      ignore = true;
    };
  }, []);

  return (
    <div>
      <h2 className="font-black text-xl text-stone-900 mb-4">Campus feed</h2>
      {loading && <p className="text-sm text-stone-400">Loading...</p>}
      {!loading && items.length === 0 && (
        <p className="text-sm text-stone-400">No items listed yet. Be the first to add something in My closet.</p>
      )}
      <div className="grid grid-cols-2 gap-3">
        {items.map((i) => (
          <ItemCard key={i.id} item={i} />
        ))}
      </div>
    </div>
  );
}
