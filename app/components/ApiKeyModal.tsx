"use client";

import { useEffect, useState } from "react";
import { API_KEY_HEADER, API_KEY_CREATE_URL } from "@/app/lib/gemini";
import { API_KEY_TTL_DAYS, saveApiKey, type StoredApiKey } from "@/app/lib/apiKeyStorage";

interface Props {
  current: StoredApiKey | null;
  // 再登録を促す理由（キーが無効になった場合など）
  reason?: string | null;
  onSaved: (stored: StoredApiKey) => void;
  onClear: () => void;
  onClose: () => void;
}

// Gemini APIキーの登録モーダル（親側で表示・非表示を切り替える）
export default function ApiKeyModal({ current, reason, onSaved, onClear, onClose }: Props) {
  const [input, setInput] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Esc キーで閉じる
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const register = async () => {
    const key = input.trim();
    if (!key || isVerifying) return;

    setIsVerifying(true);
    setError(null);
    try {
      // 実際に Gemini に問い合わせて、使えるキーか確認してから保存する
      const res = await fetch("/api/verify-key", {
        method: "POST",
        headers: { [API_KEY_HEADER]: key },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "確認に失敗しました。もう一度お試しください。");
        return;
      }
      setInput("");
      onSaved(saveApiKey(key));
    } catch {
      setError("確認に失敗しました。通信環境を確認して再試行してください。");
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="api-key-modal-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-[#141721] border border-cyan-500/40 rounded-2xl p-6 shadow-[0_0_30px_rgba(6,182,212,0.25)] max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-start justify-between gap-4 mb-1">
          <h2 id="api-key-modal-title" className="text-lg font-black text-slate-100 tracking-wide">
            🔑 Gemini APIキーの登録
          </h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-200 text-sm" title="閉じる">
            ✕
          </button>
        </div>
        <p className="text-xs text-slate-400 mb-5">
          AI機能は、あなた専用の無料APIキーで動きます。登録は1分ほどで終わります。
        </p>

        {reason && (
          <p className="mb-4 text-xs text-rose-300 bg-rose-950/30 border border-rose-500/30 rounded-xl px-3 py-2">
            {reason}
          </p>
        )}

        {current && (
          <div className="mb-5 flex items-center justify-between gap-2 text-xs bg-cyan-950/30 border border-cyan-500/30 rounded-xl px-3 py-2">
            <span className="text-cyan-200">
              登録済み（…{current.key.slice(-4)}）
              <br />
              <span className="text-slate-400">
                有効期限: {new Date(current.expiresAt).toLocaleDateString("ja-JP")}
              </span>
            </span>
            <button onClick={onClear} className="text-slate-400 hover:text-rose-400 shrink-0">
              登録を解除
            </button>
          </div>
        )}

        {/* 登録手順 */}
        <ol className="space-y-4 mb-5">
          <li className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-cyan-950 border border-cyan-400/60 text-cyan-300 text-xs font-black flex items-center justify-center shrink-0">
              1
            </span>
            <div className="flex-1">
              <p className="text-sm text-slate-200 mb-2">下のボタンから Google AI Studio を開き、Googleアカウントでログイン</p>
              <a
                href={API_KEY_CREATE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block text-xs font-black px-4 py-2 rounded-xl bg-cyan-950 hover:bg-cyan-900 border border-cyan-400/80 text-cyan-300 transition-all"
              >
                Google AI Studio を開く ↗
              </a>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-cyan-950 border border-cyan-400/60 text-cyan-300 text-xs font-black flex items-center justify-center shrink-0">
              2
            </span>
            <p className="text-sm text-slate-200">
              「<span className="font-bold text-cyan-300">APIキーを作成</span>」（Create API key）を押し、表示されたキーをコピー
            </p>
          </li>
          <li className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-cyan-950 border border-cyan-400/60 text-cyan-300 text-xs font-black flex items-center justify-center shrink-0">
              3
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-slate-200 mb-2">ここに貼り付けて「登録」</p>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && register()}
                  placeholder="AIza..."
                  autoComplete="off"
                  spellCheck={false}
                  autoFocus
                  className="flex-1 min-w-0 bg-[#0d0e14] border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-100 placeholder-slate-600 font-mono focus:outline-none focus:border-cyan-400/80"
                />
                <button
                  onClick={register}
                  disabled={!input.trim() || isVerifying}
                  className="text-xs font-black px-4 py-2 rounded-xl bg-cyan-400 text-black hover:bg-cyan-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all shrink-0"
                >
                  {isVerifying ? "確認中..." : "登録"}
                </button>
              </div>
              {error && <p className="mt-2 text-xs text-rose-400">{error}</p>}
            </div>
          </li>
        </ol>

        <p className="text-[11px] text-slate-500 leading-relaxed">
          ・キーはこの端末のブラウザにだけ保存され、{API_KEY_TTL_DAYS}日間は再登録不要です。
          <br />
          ・AIを使うときだけサーバー経由で Gemini に送られ、サーバーには保存されません。
          <br />
          ・キーは他人に教えないでください。
        </p>
      </div>
    </div>
  );
}
