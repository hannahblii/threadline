import React, { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import ItemCard, { CATEGORY_COLORS, TYPE_LABEL } from "./ItemCard";

export default function Closet({ session }) {
  const userId = session.user.id;
  const [items, setItems] = useState([]);
  const [circles, setCircles] = useState([]);
  const [adding, setAdding] = useState(false);
  const [photoFile, setPhotoFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [form, setForm] = useState({ title: "", category: "Tops", listingTypes: ["trade"], price: "", size: "M", circle_id: "" });

  async function loadItems() {
    const { data } = await supabase.from("items").select("*").eq("owner_id", userId).order("created_at", { ascending: false });
    setItems(data || []);
  }

  useEffect(() => {
    loadItems();
    supabase
      .from("circle_members")
      .select("circles(id, name)")
      .eq("user_id", userId)
      .then(({ data }) => setCircles((data || []).map((d) => d.circles)));
  }, [userId]);

  function toggleType(t) {
    setForm((f) => {
      const has = f.listingTypes.includes(t);
      const listingTypes = has ? f.listingTypes.filter((x) => x !== t) : [...f.listingTypes, t];
      return { ...f, listingTypes };
    });
  }

  async function submit() {
    if (!form.title.trim() || form.listingTypes.length === 0) return;
    setSaving(true);
    setUploadError("");

    let photo_url = null;
    if (photoFile) {
      const path = `${userId}/${Date.now()}-${photoFile.name}`;
      const { error: uploadError } = await supabase.storage.from("item-photos").upload(path, photoFile);
      if (uploadError) {
        console.error(uploadError);
        setUploadError(`Photo upload failed: ${uploadError.message}. Listing it without a photo.`);
      } else {
        photo_url = supabase.storage.from("item-photos").getPublicUrl(path).data.publicUrl;
      }
    }

    await supabase.from("items").insert({
      owner_id: userId,
      title: form.title,
      category: form.category,
      listing_type: form.listingTypes,
      price: form.price ? Number(form.price) : null,
      size: form.size,
      circle_id: form.circle_id || null,
      photo_url,
    });

    setForm({ title: "", category: "Tops", listingTypes: ["trade"], price: "", size: "M", circle_id: "" });
    setPhotoFile(null);
    setAdding(false);
    setSaving(false);
    loadItems();
  }

  const showPrice = form.listingTypes.includes("sell") || form.listingTypes.includes("rent");

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-black text-xl text-stone-900">My closet</h2>
        <button
          onClick={() => setAdding((v) => !v)}
          className="flex items-center gap-1 text-sm font-bold text-emerald-800 border border-emerald-800 rounded-lg px-3 py-1.5"
        >
          <Plus size={14} /> Add item
        </button>
      </div>

      {adding && (
        <div className="border border-stone-200 rounded-xl p-4 mb-4 space-y-2">
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Item title"
            className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm"
          />
          <select
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            className="w-full border border-stone-300 rounded-lg px-2 py-2 text-sm"
          >
            {Object.keys(CATEGORY_COLORS).map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>

          <div>
            <p className="text-xs font-bold text-stone-600 mb-1">Available as (pick any that apply)</p>
            <div className="flex flex-wrap gap-2">
              {Object.keys(TYPE_LABEL).map((t) => {
                const checked = form.listingTypes.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleType(t)}
                    className={`text-xs font-bold px-3 py-1.5 rounded-lg border ${
                      checked ? "bg-emerald-800 text-white border-emerald-800" : "border-stone-300 text-stone-600"
                    }`}
                  >
                    {TYPE_LABEL[t]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex gap-2">
            <input
              value={form.size}
              onChange={(e) => setForm({ ...form, size: e.target.value })}
              placeholder="Size"
              className="flex-1 border border-stone-300 rounded-lg px-3 py-2 text-sm"
            />
            {showPrice && (
              <input
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                placeholder="Price ($)"
                type="number"
                className="flex-1 border border-stone-300 rounded-lg px-3 py-2 text-sm"
              />
            )}
          </div>
          <select
            value={form.circle_id}
            onChange={(e) => setForm({ ...form, circle_id: e.target.value })}
            className="w-full border border-stone-300 rounded-lg px-2 py-2 text-sm"
          >
            <option value="">Visible campus-wide</option>
            {circles.map((c) => (
              <option key={c.id} value={c.id}>
                Only visible to: {c.name}
              </option>
            ))}
          </select>
          <input type="file" accept="image/*" onChange={(e) => setPhotoFile(e.target.files?.[0] || null)} className="w-full text-xs" />
          {uploadError && <p className="text-xs text-red-600">{uploadError}</p>}
          <button
            onClick={submit}
            disabled={saving || form.listingTypes.length === 0}
            className="w-full bg-emerald-800 text-white rounded-lg py-2 text-sm font-bold disabled:opacity-60"
          >
            {saving ? "Listing..." : "List item"}
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {items.map((i) => (
          <ItemCard key={i.id} item={i} compact />
        ))}
        {items.length === 0 && <p className="text-sm text-stone-400 col-span-2">Nothing listed yet — add your first item.</p>}
      </div>
    </div>
  );
}
