import React, { useEffect, useState } from "react";
import { Users, Plus } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import ItemCard from "./ItemCard";

export default function Circles({ session }) {
  const userId = session.user.id;
  const [circles, setCircles] = useState([]);
  const [myCircleIds, setMyCircleIds] = useState(new Set());
  const [active, setActive] = useState(null);
  const [activeItems, setActiveItems] = useState([]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadCircles() {
    setLoading(true);
    const { data: allCircles } = await supabase.from("circles").select("*").order("created_at");
    const { data: memberships } = await supabase.from("circle_members").select("circle_id").eq("user_id", userId);
    // member counts
    const { data: counts } = await supabase.from("circle_members").select("circle_id");
    const countMap = {};
    (counts || []).forEach((c) => (countMap[c.circle_id] = (countMap[c.circle_id] || 0) + 1));

    setCircles((allCircles || []).map((c) => ({ ...c, memberCount: countMap[c.id] || 0 })));
    setMyCircleIds(new Set((memberships || []).map((m) => m.circle_id)));
    setLoading(false);
  }

  useEffect(() => {
    loadCircles();
  }, [userId]);

  async function joinCircle(circleId) {
    await supabase.from("circle_members").insert({ circle_id: circleId, user_id: userId });
    loadCircles();
  }

  async function createCircle() {
    if (!name.trim()) return;
    const { data: circle } = await supabase
      .from("circles")
      .insert({ name: name.trim(), owner_id: userId })
      .select()
      .single();
    if (circle) {
      await supabase.from("circle_members").insert({ circle_id: circle.id, user_id: userId });
    }
    setName("");
    setCreating(false);
    loadCircles();
  }

  async function openCircle(circle) {
    setActive(circle);
    const { data } = await supabase
      .from("items")
      .select("*, profiles!items_owner_id_fkey(name, dorm)")
      .eq("circle_id", circle.id)
      .eq("status", "available");
    setActiveItems((data || []).map((i) => ({ ...i, owner: i.profiles?.name, dorm: i.profiles?.dorm })));
  }

  if (active) {
    return (
      <div>
        <button onClick={() => setActive(null)} className="text-sm text-emerald-800 font-bold mb-4">
          &larr; All circles
        </button>
        <h2 className="font-black text-xl text-stone-900">{active.name}</h2>
        <p className="text-sm text-stone-500 mb-4">
          {active.memberCount} members · items here are only visible to this circle
        </p>
        <div className="grid grid-cols-2 gap-3">
          {activeItems.length ? (
            activeItems.map((i) => <ItemCard key={i.id} item={i} compact />)
          ) : (
            <p className="text-sm text-stone-400 col-span-2">No items listed in this circle yet.</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-black text-xl text-stone-900">Circles</h2>
        <button
          onClick={() => setCreating((v) => !v)}
          className="flex items-center gap-1 text-sm font-bold text-emerald-800 border border-emerald-800 rounded-lg px-3 py-1.5"
        >
          <Plus size={14} /> New circle
        </button>
      </div>
      {creating && (
        <div className="flex gap-2 mb-4">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Circle name"
            className="flex-1 border border-stone-300 rounded-lg px-3 py-2 text-sm"
          />
          <button onClick={createCircle} className="bg-emerald-800 text-white rounded-lg px-4 text-sm font-bold">
            Create
          </button>
        </div>
      )}
      {loading && <p className="text-sm text-stone-400">Loading...</p>}
      <div className="space-y-3">
        {circles.map((c) => {
          const isMember = myCircleIds.has(c.id);
          return (
            <div key={c.id} className="border border-stone-200 rounded-xl p-4 flex items-center justify-between">
              <button
                onClick={() => isMember && openCircle(c)}
                disabled={!isMember}
                className="text-left flex-1 disabled:cursor-default"
              >
                <p className="font-bold text-stone-900">{c.name}</p>
                <p className="text-xs text-stone-500 flex items-center gap-1 mt-0.5">
                  <Users size={12} /> {c.memberCount} members
                </p>
              </button>
              {isMember ? (
                <span className="text-xs font-bold text-emerald-800">Member</span>
              ) : (
                <button
                  onClick={() => joinCircle(c.id)}
                  className="text-xs font-bold text-emerald-800 border border-emerald-800 rounded-lg px-3 py-1"
                >
                  Join
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
