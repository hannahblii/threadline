import React, { useEffect, useState } from "react";
import { User, Camera } from "lucide-react";
import { supabase } from "../lib/supabaseClient";

export default function EditProfile({ session, onBack, onSaved }) {
  const userId = session.user.id;
  const [name, setName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    supabase
      .from("profiles")
      .select("name, avatar_url")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => {
        setName(data?.name || "");
        setAvatarUrl(data?.avatar_url || null);
        setLoading(false);
      });
  }, [userId]);

  function pickAvatar(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  }

  async function save() {
    if (!name.trim()) {
      setError("Name can't be empty.");
      return;
    }
    setSaving(true);
    setError("");
    setSaved(false);

    let newAvatarUrl = avatarUrl;
    if (avatarFile) {
      const path = `${userId}/${Date.now()}-${avatarFile.name}`;
      const { error: uploadError } = await supabase.storage.from("avatars").upload(path, avatarFile);
      if (uploadError) {
        console.error(uploadError);
        setError(`Photo upload failed: ${uploadError.message}`);
        setSaving(false);
        return;
      }
      newAvatarUrl = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ name: name.trim(), avatar_url: newAvatarUrl })
      .eq("id", userId);

    setSaving(false);
    if (updateError) {
      console.error(updateError);
      setError(`Couldn't save: ${updateError.message}`);
      return;
    }

    setAvatarUrl(newAvatarUrl);
    setAvatarFile(null);
    setSaved(true);
    onSaved?.({ name: name.trim(), avatar_url: newAvatarUrl });
  }

  const displayAvatar = avatarPreview || avatarUrl;

  return (
    <div>
      <button onClick={onBack} className="text-sm text-emerald-400 font-bold mb-4">
        &larr; Back
      </button>
      <h2 className="font-black text-xl text-white mb-4">Edit profile</h2>

      {loading ? (
        <p className="text-sm text-stone-500">Loading...</p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col items-center gap-2">
            <div className="relative w-24 h-24">
              <div className="w-24 h-24 rounded-full bg-emerald-700 flex items-center justify-center text-white text-3xl font-bold overflow-hidden">
                {displayAvatar ? (
                  <img src={displayAvatar} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  name?.[0]?.toUpperCase() || <User size={32} />
                )}
              </div>
              <label className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-stone-900 border border-stone-700 flex items-center justify-center cursor-pointer hover:border-emerald-500">
                <Camera size={14} className="text-white" />
                <input type="file" accept="image/*" onChange={pickAvatar} className="hidden" />
              </label>
            </div>
            <p className="text-xs text-stone-500">Tap the camera to change your photo</p>
          </div>

          <div>
            <label className="text-xs font-bold text-stone-400 mb-1 block">Name / username</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="w-full bg-stone-900 border border-stone-700 rounded-lg px-3 py-2 text-sm text-white placeholder-stone-500"
            />
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}
          {saved && !error && <p className="text-xs text-emerald-400">Saved.</p>}

          <button
            onClick={save}
            disabled={saving}
            className="w-full bg-emerald-700 text-white rounded-lg py-3 text-sm font-bold disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save changes"}
          </button>
        </div>
      )}
    </div>
  );
}
