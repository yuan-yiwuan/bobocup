"use client";

import { useState } from "react";
import CarrotGift from "@/components/CarrotGift";

/** 仅用于预览每日大礼特效（dev）。/gift-preview */
export default function GiftPreviewPage() {
  const [show, setShow] = useState(true);
  const [key, setKey] = useState(0);
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-teal-50 p-6">
      <p className="text-teal-deep font-bold text-center">
        每日大礼特效预览
        <br />
        <span className="text-sm font-normal text-teal-deep/60">
          满屏掉胡萝卜，5 秒后弹公告
        </span>
      </p>
      <button
        onClick={() => {
          setKey((k) => k + 1);
          setShow(true);
        }}
        className="cartoon-btn bg-yellow-300 text-teal-deep px-4 py-3 font-black"
      >
        ▶︎ 重放特效
      </button>
      {show && <CarrotGift key={key} onDismiss={() => setShow(false)} />}
    </div>
  );
}
