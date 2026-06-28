"use client";

import { useEffect, useMemo, useState } from "react";

/**
 * 每日大礼特效：满屏掉胡萝卜，5 秒后弹出公告 + dismiss 按钮。
 * 纯展示组件；是否显示 / 持久化「已看过」由外层控制。
 */
export default function CarrotGift({ onDismiss }: { onDismiss: () => void }) {
  const [showMsg, setShowMsg] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setShowMsg(true), 5000);
    return () => clearTimeout(t);
  }, []);

  // 随机生成一批掉落的胡萝卜（挂载时定一次）
  const drops = useMemo(
    () =>
      Array.from({ length: 40 }, () => ({
        left: Math.random() * 100,
        duration: 3 + Math.random() * 4,
        delay: Math.random() * 5,
        size: 18 + Math.random() * 30,
      })),
    [],
  );

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-teal-deep/40 backdrop-blur-[1px]">
      {drops.map((d, i) => (
        <span
          key={i}
          className="carrot-drop"
          style={{
            left: `${d.left}%`,
            fontSize: `${d.size}px`,
            animationDuration: `${d.duration}s`,
            animationDelay: `${d.delay}s`,
          }}
        >
          🥕
        </span>
      ))}

      {showMsg && (
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <div className="cartoon-card gift-pop bg-white p-6 max-w-sm w-full text-center flex flex-col gap-4">
            <div className="text-5xl">🐰🥕</div>
            <p className="text-lg font-black text-teal-deep leading-relaxed">
              小兔子们，好消息，好消息！
              <br />
              波波一大早去农夫市场，为每只家人准备了{" "}
              <span className="text-teal-brand">500 个胡萝卜</span> 🥕
            </p>
            <button
              onClick={onDismiss}
              className="cartoon-btn bg-yellow-300 text-teal-deep px-4 py-3 font-black mt-1"
            >
              收下啦！🥕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
