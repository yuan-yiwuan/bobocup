"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Team } from "@/lib/types";

export default function OnboardingForm({
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

  async function save() {
    const name = nickname.trim();
    if (!name) {
      setError("请填写昵称");
      return;
    }
    setSaving(true);
    setError(null);

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

    if (err) {
      setSaving(false);
      setError(err.message);
      return;
    }
    // 首次注册完成后先看规则页（页面底部有「开始竞猜」按钮进入竞猜页）
    router.push("/rules");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="font-bold text-teal-deep text-sm">昵称</span>
        <input
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          maxLength={20}
          placeholder="给自己起个响亮的名号"
          className="cartoon-btn bg-white px-3 py-2 font-semibold outline-none focus:bg-teal-50"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="font-bold text-teal-deep text-sm">主队（可选）</span>
        <select
          value={homeTeam ?? ""}
          disabled={initialHomeTeam != null}
          onChange={(e) =>
            setHomeTeam(e.target.value ? Number(e.target.value) : null)
          }
          className="cartoon-btn bg-white px-3 py-2 font-semibold outline-none"
        >
          <option value="">暂不选择</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.flag_emoji ?? "⚽"} {t.name_zh}
            </option>
          ))}
        </select>
        <span className="text-xs text-teal-deep/50">
          ⚠️ 小组赛期间，一旦选定不能更换；不选可稍后在设置里选一次
        </span>
      </label>

      {error && <p className="text-red-600 font-semibold text-sm">{error}</p>}

      <button
        onClick={save}
        disabled={saving}
        className="cartoon-btn bg-yellow-300 text-teal-deep px-4 py-3 mt-1"
      >
        {saving ? "保存中…" : "完成，看规则 📖"}
      </button>
    </div>
  );
}
