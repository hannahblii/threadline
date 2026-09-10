import React from "react";
import { X, Repeat, Heart, Users, CheckCircle2, MessageCircle } from "lucide-react";

const SECTIONS = [
  {
    icon: Repeat,
    title: "Browse vs. Swipe",
    body: "Two ways to see the same items — scroll a grid in Browse, or flip through one at a time in Swipe. Same items either way, just pick whichever feels better.",
  },
  {
    icon: Heart,
    title: "Liking opens a chat",
    body: "You don't need the other person to like your stuff back first — liking any item opens a chat with its owner right away.",
  },
  {
    icon: Users,
    title: "Circles",
    body: "Public circles anyone can join. Private circles need an invite code from someone already in it. Your own campus has one big circle everyone's automatically part of — that's what \"Visible Campus Wide\" posts to.",
  },
  {
    icon: CheckCircle2,
    title: "Confirm Transaction",
    body: "Once a swap actually happens, either person can mark it complete — the other person has to confirm before it counts. That's what finalizes a trade and takes the item off the market.",
  },
];

export default function InfoModal({ onClose }) {
  return (
    <div className="fixed inset-0 bg-stone-950/85 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div className="bg-stone-900 border border-stone-800 rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
          <h2 className="font-black text-lg text-white">How ClosetCult works</h2>
          <button onClick={onClose} className="text-stone-500 hover:text-white p-2 -mr-2">
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto px-5 pb-5 space-y-5">
          <p className="text-sm text-stone-300 leading-relaxed">
            Swap, borrow, sell, or rent clothes with real students on your campus — no shipping, no strangers, just
            people down the hall.
          </p>

          {SECTIONS.map((s) => (
            <div key={s.title} className="flex gap-3">
              <div className="w-9 h-9 rounded-full bg-emerald-700/20 text-emerald-400 flex items-center justify-center shrink-0">
                <s.icon size={16} />
              </div>
              <div>
                <p className="font-bold text-white text-sm">{s.title}</p>
                <p className="text-sm text-stone-400 leading-relaxed mt-0.5">{s.body}</p>
              </div>
            </div>
          ))}

          <div className="border-t border-stone-800 pt-4 flex gap-3">
            <div className="w-9 h-9 rounded-full bg-stone-800 text-stone-400 flex items-center justify-center shrink-0">
              <MessageCircle size={16} />
            </div>
            <div>
              <p className="font-bold text-white text-sm">Questions or found a bug?</p>
              <p className="text-sm text-stone-400 leading-relaxed mt-0.5">
                {/* TODO: replace with your real contact — email or Instagram handle */}
                Reach out at hannahbli53@gmail.com — this is still in beta, so tell us what's broken.
              </p>
            </div>
          </div>
        </div>

        <div className="p-5 pt-3 shrink-0">
          <button onClick={onClose} className="w-full bg-emerald-700 text-white rounded-lg py-3 text-sm font-bold">
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
