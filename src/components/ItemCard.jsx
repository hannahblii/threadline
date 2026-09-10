import React from "react";
import { Shirt, MapPin, Trash2, Pencil, Heart, Bookmark } from "lucide-react";

export const CATEGORY_COLORS = {
  Outerwear: "bg-emerald-800",
  Dresses: "bg-amber-700",
  Denim: "bg-stone-700",
  Tops: "bg-emerald-600",
  Formal: "bg-amber-800",
  Accessories: "bg-stone-600",
  Shoes: "bg-emerald-900",
  Athletic: "bg-amber-600",
};

export const TYPE_LABEL = { sell: "Sell", trade: "Trade", rent: "Rent", borrow: "Borrow" };

function tagText(type, item) {
  if (type === "sell" && item.price) return `$${item.price}`;
  if (type === "rent" && item.rent_price) return `$${item.rent_price}/wk`;
  return TYPE_LABEL[type];
}

// Multiple listing types stack as separate tags down the top-right corner,
// each looking like its own hand-stamped price tag.
function TagStack({ item }) {
  const types = item.listing_type || [];
  return (
    <div className="absolute top-2 right-2 flex flex-col items-end gap-1">
      {types.map((t, i) => (
        <div key={t} className={`relative ${i % 2 === 0 ? "rotate-3" : "-rotate-2"}`}>
          <div className="bg-amber-400 text-amber-900 text-[10px] font-bold px-2 py-0.5 rounded shadow-sm border border-amber-500 relative">
            {tagText(t, item)}
            <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-stone-950 rounded-full border border-amber-500" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ItemCard({ item, compact, onDelete, onEdit, onLike, onSave, liked, saved, onViewOwner }) {
  const types = item.listing_type || [];
  const isCompleted = item.status === "completed";
  return (
    <div className={`relative bg-stone-900 border rounded-xl overflow-hidden shadow-sm transition-colors ${isCompleted ? "border-stone-800 opacity-60" : "border-stone-800 hover:border-stone-700"}`}>
      <div className={`h-40 ${CATEGORY_COLORS[item.category] || "bg-stone-500"} flex items-center justify-center overflow-hidden relative`}>
        {item.photo_url ? (
          <img src={item.photo_url} alt={item.title} className="w-full h-full object-cover" />
        ) : (
          <Shirt className="text-white/70" size={40} strokeWidth={1.5} />
        )}
        {isCompleted && (
          <div className="absolute inset-0 bg-stone-950/60 flex items-center justify-center">
            <span className="text-white text-xs font-black uppercase tracking-wide border-2 border-white/80 rounded px-3 py-1 -rotate-12">
              Completed
            </span>
          </div>
        )}
      </div>
      {!isCompleted && <TagStack item={item} />}
      <div className="absolute top-2 left-2 flex gap-1.5">
        {onEdit && (
          <button
            onClick={() => onEdit(item)}
            className="w-10 h-10 rounded-full bg-stone-950/80 border border-stone-700 flex items-center justify-center text-stone-300 hover:text-emerald-400 hover:border-emerald-400 transition-colors"
            title="Edit listing"
          >
            <Pencil size={16} />
          </button>
        )}
        {onDelete && (
          <button
            onClick={() => onDelete(item)}
            className="w-10 h-10 rounded-full bg-stone-950/80 border border-stone-700 flex items-center justify-center text-stone-300 hover:text-red-400 hover:border-red-400 transition-colors"
            title="Delete listing"
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>
      <div className="p-3">
        <p className="font-bold text-white text-sm leading-tight">{item.title}</p>
        {onViewOwner && item.owner && item.owner_id && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onViewOwner(item.owner_id);
            }}
            className="text-xs text-emerald-400 font-bold hover:underline mt-0.5 py-1 -my-1"
          >
            {item.owner}
          </button>
        )}
        <p className="text-xs text-stone-400 mt-1">{item.category} · Size {item.size}</p>
        <div className="flex items-center justify-between mt-2">
          <span className="text-[11px] uppercase tracking-wide font-bold text-emerald-400">
            {types.map((t) => TYPE_LABEL[t]).join(" · ")}
          </span>
          {!compact && item.dorm && (
            <span className="flex items-center gap-1 text-[11px] text-stone-500">
              <MapPin size={11} /> {item.dorm}
            </span>
          )}
        </div>
        {(onLike || onSave) && (
          <div className="flex items-center gap-3 mt-2 pt-2 border-t border-stone-800">
            {onLike && (
              <button
                onClick={() => onLike(item)}
                className={`flex items-center gap-1.5 text-sm font-bold py-2 pr-2 -my-2 ${liked ? "text-red-400" : "text-stone-500"}`}
              >
                <Heart size={19} fill={liked ? "currentColor" : "none"} /> {liked ? "Liked" : "Like"}
              </button>
            )}
            {onSave && (
              <button
                onClick={() => onSave(item)}
                className={`flex items-center gap-1.5 text-sm font-bold py-2 pr-2 -my-2 ${saved ? "text-amber-400" : "text-stone-500"}`}
              >
                <Bookmark size={18} fill={saved ? "currentColor" : "none"} /> {saved ? "Saved" : "Save"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
