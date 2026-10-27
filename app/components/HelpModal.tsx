"use client";

import { useEffect, type ReactNode } from "react";
import { EditIcon, TrashIcon } from "@/app/components/icons";

interface Props {
  onClose: () => void;
}

// 画面上の見た目をそのまま縮小して見せる（どのボタンの説明か一目で分かるように）
const Chip = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <span
    className={`inline-flex items-center justify-center min-w-[2.75rem] px-1.5 py-0.5 rounded border text-[10px] font-mono shrink-0 ${className}`}
  >
    {children}
  </span>
);

const BUTTONS: { chip: ReactNode; text: ReactNode }[] = [
  {
    chip: <Chip className="border-cyan-400/80 bg-cyan-950 text-cyan-300 font-black">⚡AI</Chip>,
    text: (
      <>
        タスクをAIが分解。2回目以降は<b className="text-cyan-300">未完了のAI提案だけ</b>作り直します（自分の手順・完了済みは残る）
      </>
    ),
  },
  {
    chip: (
      <span className="flex gap-1 shrink-0">
        <Chip className="min-w-0 border-cyan-500/30 text-cyan-500/70">AI</Chip>
        <Chip className="min-w-0 border-amber-400/70 bg-amber-400/15 text-amber-300 font-bold">📌採用</Chip>
      </span>
    ),
    text: (
      <>
        AIバッジを<b className="text-cyan-300">タップで採用</b>。採用した提案は作り直しても残ります
      </>
    ),
  },
  {
    chip: <Chip className="border-transparent text-cyan-500 text-xs">⚡</Chip>,
    text: "手が止まった手順を、さらに小さな3つに分けます",
  },
  {
    chip: <Chip className="border-transparent text-slate-400 text-xs">↑ ↓</Chip>,
    text: "手順の並べ替え",
  },
  {
    chip: (
      <Chip className="border-transparent text-slate-400">
        <EditIcon />
      </Chip>
    ),
    text: "手順の名前を編集（タスク名はタップで編集）",
  },
  {
    chip: (
      <Chip className="border-transparent text-slate-400">
        <TrashIcon />
      </Chip>
    ),
    text: "削除（手順の横は手順だけ、タスク名の横はタスクごと）",
  },
];

// 使い方モーダル（基本の流れとボタンの意味だけをコンパクトにまとめる）
export default function HelpModal({ onClose }: Props) {
  // Esc キーで閉じる
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-modal-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-[#141721] border border-cyan-500/40 rounded-2xl p-6 shadow-[0_0_30px_rgba(6,182,212,0.25)] max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-start justify-between gap-4 mb-5">
          <h2 id="help-modal-title" className="text-lg font-black text-slate-100 tracking-wide">
            使い方
          </h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-200 text-sm" title="閉じる">
            ✕
          </button>
        </div>

        {/* 基本の流れ */}
        <ol className="space-y-3 mb-6">
          {[
            "大きなタスクを入力して「追加」",
            "個数（1/3/5/10）を選んで「⚡AI分解」",
            "NEXT の手順を「▶ 10分だけやる」。終わったらチェック",
          ].map((step, i) => (
            <li key={step} className="flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-cyan-950 border border-cyan-400/60 text-cyan-300 text-xs font-black flex items-center justify-center shrink-0">
                {i + 1}
              </span>
              <p className="text-sm text-slate-200">{step}</p>
            </li>
          ))}
        </ol>

        {/* ボタンの意味 */}
        <h3 className="text-xs font-mono font-bold text-slate-400 tracking-wider mb-3">BUTTONS</h3>
        <ul className="space-y-2.5 mb-5">
          {BUTTONS.map((b, i) => (
            <li key={i} className="flex items-center gap-3 text-xs text-slate-300 leading-relaxed">
              <span className="w-24 flex justify-center shrink-0">{b.chip}</span>
              <span>{b.text}</span>
            </li>
          ))}
        </ul>

        <p className="text-[11px] text-slate-500 leading-relaxed">
          ・PCでは手順にマウスを乗せると ⚡ ↑↓ 編集・削除ボタンが表示されます。
          <br />
          ・タスクはこの端末のブラウザに保存されます。
        </p>
      </div>
    </div>
  );
}
