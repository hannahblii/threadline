import React, { useEffect, useState } from "react";
import { Plus, Pencil, User } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import ItemCard, { CATEGORY_COLORS, TYPE_LABEL } from "./ItemCard";

const BLANK_FORM = {
  title: "",
  category: "Tops",
  listingTypes: ["trade"],
  salePrice: "",
  rentPrice: "",
  size: "M",
  circle_id: "",
};

export default function Closet({ session, campus, officialCircleId, myProfile, onEditProfile }) {
  const userId = session.user.id;
  const [items, setItems] = useState([]);
  const [circles, setCircles] = useState([]);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null); // null = adding new, otherwise editing this item's id
  const [photoFile, setPhotoFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [form, setForm] = useState(BLANK_FORM);

  async function loadItems() {
    const { data } = await supabase.from("items").select("*").eq("owner_id", userId).order("created_at", { ascending: false });
    setItems(data || []);
  }

  useEffect(() => {
    loadItems();
    if (!campus) return;
    supabase
      .from("circle_members")
      .select("circles(id, name, campus, campus_tag)")
      .eq("user_id", userId)
      .then(({ data }) =>
        // Exclude the official school circle — it's redundant with "Visible Campus Wide".
        setCircles((data || []).map((d) => d.circles).filter((c) => c && c.campus === campus && !c.campus_tag))
      );
  }, [userId, campus]);

  function toggleType(t) {
    setForm((f) => {
      const has = f.listingTypes.includes(t);
      const listingTypes = has ? f.listingTypes.filter((x) => x !== t) : [...f.listingTypes, t];
      return { ...f, listingTypes };
    });
  }

  function startAdd() {
    setEditingId(null);
    setForm(BLANK_FORM);
    setPhotoFile(null);
    setUploadError("");
    setAdding(true);
  }

  function startEdit(item) {
    setEditingId(item.id);
    setForm({
      title: item.title,
      category: item.category,
      listingTypes: item.listing_type || [],
      salePrice: item.price != null ? String(item.price) : "",
      rentPrice: item.rent_price != null ? String(item.rent_price) : "",
      size: item.size || "",
      circle_id: item.circle_id && item.circle_id !== officialCircleId ? item.circle_id : "",
    });
    setPhotoFile(null);
    setUploadError("");
    setAdding(true);
  }

  function cancelForm() {
    setAdding(false);
    setEditingId(null);
    setForm(BLANK_FORM);
    setPhotoFile(null);
    setUploadError("");
  }

  async function submit() {
    if (!form.title.trim() || form.listingTypes.length === 0) return;
    setSaving(true);
    setUploadError("");

    let photo_url; // undefined = don't touch existing photo when editing without a new file
    if (photoFile) {
      const path = `${userId}/${Date.now()}-${photoFile.name}`;
      const { error: uploadErr } = await supabase.storage.from("item-photos").upload(path, photoFile);
      if (uploadErr) {
        console.error(uploadErr);
        setUploadError(`Photo upload failed: ${uploadErr.message}. Saving without changing the photo.`);
      } else {
        photo_url = supabase.storage.from("item-photos").getPublicUrl(path).data.publicUrl;
      }
    }

    // "Visible Campus Wide" means the official campus circle. If the prop
    // from the parent hasn't loaded yet for any reason, look it up directly
    // here rather than silently falling back to an untagged item.
    let resolvedCircleId = form.circle_id;
    if (!resolvedCircleId) {
      resolvedCircleId = officialCircleId;
      if (!resolvedCircleId && campus) {
        const { data: official } = await supabase.from("circles").select("id").eq("campus_tag", campus).maybeSingle();
        resolvedCircleId = official?.id || null;
      }
    }

    const payload = {
      title: form.title,
      category: form.category,
      listing_type: form.listingTypes,
      price: form.listingTypes.includes("sell") && form.salePrice ? Number(form.salePrice) : null,
      rent_price: form.listingTypes.includes("rent") && form.rentPrice ? Number(form.rentPrice) : null,
      size: form.size,
      circle_id: resolvedCircleId || null,
    };
    if (photo_url) payload.photo_url = photo_url;

    if (editingId) {
      await supabase.from("items").update(payload).eq("id", editingId);
    } else {
      await supabase.from("items").insert({ owner_id: userId, photo_url: photo_url || null, ...payload });
    }

    cancelForm();
    setSaving(false);
    loadItems();
  }

  async function deleteItem(item) {
    if (!confirm(`Delete "${item.title}"? This can't be undone.`)) return;
    await supabase.from("items").delete().eq("id", item.id);
    loadItems();
  }

  const showSalePrice = form.listingTypes.includes("sell");
  const showRentPrice = form.listingTypes.includes("rent");

  return (
    <div>
      <div className="flex items-center gap-3 pb-4 mb-4 border-b border-stone-800">
        <div className="w-11 h-11 rounded-full bg-emerald-700 flex items-center justify-center text-white font-bold overflow-hidden shrink-0">
          {myProfile?.avatar_url ? (
            <img src={myProfile.avatar_url} alt="You" className="w-full h-full object-cover" />
          ) : (
            myProfile?.name?.[0]?.toUpperCase() || <User size={18} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white font-bold truncate">{myProfile?.name || session.user.email}</p>
          <p className="text-[11px] text-stone-500 truncate">{session.user.email}</p>
        </div>
        <button
          onClick={onEditProfile}
          className="flex items-center gap-1 text-xs text-stone-400 font-bold hover:text-emerald-400 py-2 px-2"
        >
          <Pencil size={12} /> Edit
        </button>
        <button onClick={() => supabase.auth.signOut()} className="text-xs text-stone-400 font-bold hover:text-stone-200 py-2 px-2">
          Sign out
        </button>
      </div>

      <div className="flex items-center justify-between mb-4">
        <h2 className="font-black text-xl text-white">My closet</h2>
        <button
          onClick={() => (adding ? cancelForm() : startAdd())}
          className="flex items-center gap-1.5 text-sm font-bold text-emerald-400 border border-emerald-700 rounded-lg px-4 py-2.5"
        >
          <Plus size={14} /> {adding ? "Cancel" : "Add item"}
        </button>
      </div>

      {adding && (
        <div className="border border-stone-800 bg-stone-900 rounded-xl p-4 mb-4 space-y-2">
          <p className="text-xs font-bold text-stone-500 uppercase tracking-wide">
            {editingId ? "Editing listing" : "New listing"}
          </p>
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Item title"
            className="w-full bg-stone-950 border border-stone-700 rounded-lg px-3 py-2 text-sm text-white placeholder-stone-500"
          />
          <select
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            className="w-full bg-stone-950 border border-stone-700 rounded-lg px-2 py-2 text-sm text-white"
          >
            {Object.keys(CATEGORY_COLORS).map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>

          <div>
            <p className="text-xs font-bold text-stone-400 mb-1">Available as (pick any that apply)</p>
            <div className="flex flex-wrap gap-2">
              {Object.keys(TYPE_LABEL).map((t) => {
                const checked = form.listingTypes.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleType(t)}
                    className={`text-sm font-bold px-4 py-2.5 rounded-lg border ${
                      checked ? "bg-emerald-700 text-white border-emerald-700" : "border-stone-700 text-stone-400"
                    }`}
                  >
                    {TYPE_LABEL[t]}
                  </button>
                );
              })}
            </div>
          </div>

          <input
            value={form.size}
            onChange={(e) => setForm({ ...form, size: e.target.value })}
            placeholder="Size"
            className="w-full bg-stone-950 border border-stone-700 rounded-lg px-3 py-2 text-sm text-white placeholder-stone-500"
          />

          {showSalePrice && (
            <input
              value={form.salePrice}
              onChange={(e) => setForm({ ...form, salePrice: e.target.value })}
              placeholder="Sale price ($)"
              type="number"
              className="w-full bg-stone-950 border border-stone-700 rounded-lg px-3 py-2 text-sm text-white placeholder-stone-500"
            />
          )}
          {showRentPrice && (
            <input
              value={form.rentPrice}
              onChange={(e) => setForm({ ...form, rentPrice: e.target.value })}
              placeholder="Rent price ($/week)"
              type="number"
              className="w-full bg-stone-950 border border-stone-700 rounded-lg px-3 py-2 text-sm text-white placeholder-stone-500"
            />
          )}

          <select
            value={form.circle_id}
            onChange={(e) => setForm({ ...form, circle_id: e.target.value })}
            className="w-full bg-stone-950 border border-stone-700 rounded-lg px-2 py-2 text-sm text-white"
          >
            <option value="">Visible Campus Wide</option>
            {circles.map((c) => (
              <option key={c.id} value={c.id}>
                Only Visible to {c.name}
              </option>
            ))}
          </select>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
            className="w-full text-xs text-stone-400"
          />
          {editingId && <p className="text-[11px] text-stone-500">Leave the photo blank to keep the current one.</p>}
          {uploadError && <p className="text-xs text-red-400">{uploadError}</p>}
          <button
            onClick={submit}
            disabled={saving || form.listingTypes.length === 0}
            className="w-full bg-emerald-700 text-white rounded-lg py-3 text-sm font-bold disabled:opacity-60"
          >
            {saving ? "Saving..." : editingId ? "Save changes" : "List item"}
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {items.map((i) => (
          <ItemCard key={i.id} item={i} compact onDelete={deleteItem} onEdit={startEdit} />
        ))}
        {items.length === 0 && <p className="text-sm text-stone-500 col-span-2">Nothing listed yet — add your first item.</p>}
      </div>
    </div>
  );
}
