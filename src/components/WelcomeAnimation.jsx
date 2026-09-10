import React, { useEffect, useRef } from "react";

export default function WelcomeAnimation({ onDone }) {
  const doneRef = useRef(false);

  function finish() {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone?.();
  }

  useEffect(() => {
    const t = setTimeout(finish, 4400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      onClick={finish}
      className="fixed inset-0 z-[60] bg-black overflow-hidden flex items-center justify-center cursor-pointer"
      style={{ animation: "wa-fadeout 0.6s ease 3.8s forwards" }}
    >
      <style>{`
        @keyframes wa-aura {
          0% { transform: scale(0.6); opacity: 0; }
          40% { opacity: 0.9; }
          100% { transform: scale(1.4); opacity: 0.55; }
        }
        @keyframes wa-door-left {
          0%, 30% { transform: translateX(0); }
          100% { transform: translateX(-105%); }
        }
        @keyframes wa-door-right {
          0%, 30% { transform: translateX(0); }
          100% { transform: translateX(105%); }
        }
        @keyframes wa-text-in {
          0% { opacity: 0; transform: translateY(14px) scale(0.96); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes wa-sparkle {
          0%, 100% { opacity: 0; transform: translateY(0) scale(0.6); }
          50% { opacity: 1; transform: translateY(-10px) scale(1); }
        }
        @keyframes wa-fadeout {
          to { opacity: 0; }
        }
      `}</style>

      {/* Magical aura glow behind everything */}
      <div
        className="absolute w-[420px] h-[420px] rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(16,185,129,0.55) 0%, rgba(217,119,6,0.25) 45%, transparent 70%)",
          filter: "blur(30px)",
          animation: "wa-aura 2.2s ease-out forwards",
        }}
      />

      {/* Sparkles */}
      {[...Array(8)].map((_, i) => (
        <div
          key={i}
          className="absolute w-1.5 h-1.5 rounded-full bg-amber-300"
          style={{
            top: `${20 + ((i * 37) % 60)}%`,
            left: `${15 + ((i * 53) % 70)}%`,
            animation: `wa-sparkle 1.8s ease-in-out ${0.3 + i * 0.18}s infinite`,
          }}
        />
      ))}

      {/* Doors */}
      <div
        className="absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-stone-900 to-stone-800 border-r border-emerald-900"
        style={{ animation: "wa-door-left 1.3s cubic-bezier(.6,.05,.3,1) 0.5s forwards" }}
      />
      <div
        className="absolute inset-y-0 right-0 w-1/2 bg-gradient-to-l from-stone-900 to-stone-800 border-l border-emerald-900"
        style={{ animation: "wa-door-right 1.3s cubic-bezier(.6,.05,.3,1) 0.5s forwards" }}
      />

      {/* Greeting text */}
      <div
        className="relative z-10 text-center px-8"
        style={{ opacity: 0, animation: "wa-text-in 1s ease 1.9s forwards" }}
      >
        <p className="text-white font-black text-2xl tracking-tight">Welcome to the ClosetCult</p>
        <p className="text-emerald-300 text-sm italic mt-2">your new wardrobe awaits...</p>
      </div>
    </div>
  );
}
