import React from "react";
import { Shirt, MapPin } from "lucide-react";

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
  if (type === "rent" && item.price) return `$${item.price}/wk`;
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
            <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-stone-50 rounded-full border border-amber-500" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ItemCard({ item, compact }) {
  const types = item.listing_type || [];
  return (
    <div className="relative bg-white border border-stone-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      <div className={`h-40 ${CATEGORY_COLORS[item.category] || "bg-stone-500"} flex items-center justify-center overflow-hidden`}>
        {item.photo_url ? (
          <img src={item.photo_url} alt={item.title} className="w-full h-full object-cover" />
        ) : (
          <Shirt className="text-white/70" size={40} strokeWidth={1.5} />
        )}
      </div>
      <TagStack item={item} />
      <div className="p-3">
        <p className="font-bold text-stone-900 text-sm leading-tight">{item.title}</p>
        <p className="text-xs text-stone-500 mt-1">{item.category} · Size {item.size}</p>
        <div className="flex items-center justify-between mt-2">
          <span className="text-[11px] uppercase tracking-wide font-bold text-emerald-800">
            {types.map((t) => TYPE_LABEL[t]).join(" · ")}
          </span>
          {!compact && item.dorm && (
            <span className="flex items-center gap-1 text-[11px] text-stone-400">
              <MapPin size={11} /> {item.dorm}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
