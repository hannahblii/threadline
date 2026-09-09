import React, { useState } from "react";
import { Repeat, Heart } from "lucide-react";
import Feed from "./Feed";
import Swipe from "./Swipe";

export default function Browse({ session, campus, officialCircleId, onGoToMatches, onViewProfile }) {
  const [mode, setMode] = useState("feed"); // "feed" | "swipe"

  return (
    <div>
      <div className="flex bg-stone-900 border border-stone-800 rounded-lg p-1 mb-4">
        <button
          onClick={() => setMode("feed")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-bold transition-colors ${
            mode === "feed" ? "bg-emerald-700 text-white" : "text-stone-400"
          }`}
        >
          <Repeat size={13} /> Feed
        </button>
        <button
          onClick={() => setMode("swipe")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-bold transition-colors ${
            mode === "swipe" ? "bg-emerald-700 text-white" : "text-stone-400"
          }`}
        >
          <Heart size={13} /> Swipe
        </button>
      </div>

      {mode === "feed" ? (
        <Feed session={session} campus={campus} officialCircleId={officialCircleId} onGoToMatches={onGoToMatches} onViewProfile={onViewProfile} />
      ) : (
        <Swipe session={session} campus={campus} officialCircleId={officialCircleId} onGoToMatches={onGoToMatches} onViewProfile={onViewProfile} />
      )}
    </div>
  );
}
