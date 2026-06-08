"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Team } from "@/lib/types";

export default function SettingsForm({
  teams,
  initialNickname,
  initialHomeTeam,
}: {
  teams: Team[];
  initialNickname: string;
  initialHomeTeam: number | null;
}) {
  const router = useRouter();
  const [nickname, setNickname] = useState(initialNickname);
  const [homeTeam, setHomeTeam] = useState<number | null>(initialHomeTeam);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty =
    nickname.trim() !== initialNickname || homeTeam !== initialHomeTeam;

  async function save() {
    const name = nickname.trim();
    if (!name) {
      setError("昵称不能为空");
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(false);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push("/login");
      return;
    }

    const { error: err } = await supabase
      .from("profiles")
      .update({ nickname: name, home_team_id: homeTeam })
      .eq("id", user.id);

    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    setSaved(true);
    router.refresh(); // 让导航栏等处的昵称同步更新
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="font-bold text-teal-deep text-sm">昵称</span>
        <input
          value={nickname}
          onChange={(e) => {
            setNickname(e.target.value);
            setSaved(false);
          }}
          maxLength={20}
          placeholder="给自己起个响亮的名号"
          className="cartoon-btn bg-white px-3 py-2 font-semibold outline-none focus:bg-teal-50"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="font-bold text-teal-deep text-sm">主队</span>
        <select
          value={homeTeam ?? ""}
          onChange={(e) => {
            setHomeTeam(e.target.value ? Number(e.target.value) : null);
            setSaved(false);
          }}
          className="cartoon-btn bg-white px-3 py-2 font-semibold outline-none"
        >
          <option value="">暂不选择</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.flag_emoji ?? "⚽"} {t.name_zh}
            </option>
          ))}
        </select>
      </label>

      {error && <p className="text-red-600 font-semibold text-sm">{error}</p>}
      {saved && !dirty && (
        <p className="text-emerald-600 font-semibold text-sm">✅ 已保存</p>
      )}

      <button
        onClick={save}
        disabled={saving || !dirty}
        className="cartoon-btn bg-yellow-300 text-teal-deep px-4 py-3 mt-1"
      >
        {saving ? "保存中…" : "保存修改"}
      </button>
    </div>
  );
}
