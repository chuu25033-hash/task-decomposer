"use client";

import { useRef, useState } from "react";
import { useModalFocus } from "@/app/hooks/useModalFocus";
import {
  backupFileName,
  BackupError,
  createBackup,
  MAX_IMPORT_FILE_BYTES,
  mergeImportedTasks,
  parseBackup,
} from "@/app/lib/taskBackup";
import type { Task } from "@/app/types/task";

interface Props {
  tasks: Task[];
  // 読み込んだタスク（今のタスクとのマージは呼び出し側で行う）
  onImport: (imported: Task[], options: { replaceExisting: boolean }) => void;
  onClose: () => void;
}

// 読み込み結果のメッセージ
const importSummary = (
  result: { addedCount: number; updatedCount: number; changedCount: number; unchangedCount: number }
) => {
  const parts: string[] = [];
  if (result.addedCount > 0) parts.push(`${result.addedCount}件を追加`);
  if (result.updatedCount > 0) parts.push(`${result.updatedCount}件を更新`);
  if (result.unchangedCount > 0) parts.push(`変更のない${result.unchangedCount}件はそのまま`);
  if (result.changedCount > 0) {
    parts.push(
      `内容が違う${result.changedCount}件は追加しませんでした（「同じタスクを更新する」にチェックすると反映できます）`
    );
  }
  return parts.length > 0 ? `${parts.join("、")}。` : "読み込むタスクがありませんでした。";
};

type Message = { kind: "success" | "error"; text: string } | null;

// タスクのバックアップ（JSON ファイルへの書き出し・読み込み）
// LocalStorage はブラウザのデータ削除・端末の変更で消えるため、ファイルで引き継げるようにする
// APIキーは秘密情報のため書き出さない
export default function BackupModal({ tasks, onImport, onClose }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<Message>(null);
  // 同じタスク（同じ ID）を、読み込んだ内容で置き換えるか（既定は追加のみ）
  const [replaceExisting, setReplaceExisting] = useState(false);

  // フォーカスの移動・閉じ込めと Esc で閉じる
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalFocus(dialogRef, onClose);

  const exportTasks = () => {
    const blob = new Blob([JSON.stringify(createBackup(tasks), null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = backupFileName();
    a.click();
    // すぐに解放するとダウンロードが始まらないブラウザがあるため、少し待ってから解放する
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage({ kind: "success", text: `${tasks.length}件のタスクを書き出しました。` });
  };

  const importFile = async (file: File) => {
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      setMessage({ kind: "error", text: "ファイルが大きすぎます（2MBまで）。" });
      return;
    }
    try {
      const imported = parseBackup(await file.text());
      // 件数の表示用。実際の反映は、AI処理の結果などを上書きしないよう page 側で最新の状態に対して行う
      const result = mergeImportedTasks(tasks, imported, { replaceExisting });
      if (
        result.updatedCount > 0 &&
        !window.confirm(
          `${result.updatedCount}件のタスクを、読み込んだファイルの内容で置き換えます。よろしいですか？`
        )
      ) {
        return;
      }
      onImport(imported, { replaceExisting });
      setMessage({ kind: "success", text: importSummary(result) });
    } catch (e) {
      setMessage({
        kind: "error",
        text: e instanceof BackupError ? e.message : "ファイルの読み込みに失敗しました。",
      });
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="backup-modal-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-[#141721] border border-cyan-500/40 rounded-2xl p-6 shadow-[0_0_30px_rgba(6,182,212,0.25)] max-h-[90vh] overflow-y-auto outline-none"
      >
        <div className="flex items-start justify-between gap-4 mb-3">
          <h2 id="backup-modal-title" className="text-lg font-black text-slate-100 tracking-wide">
            バックアップ
          </h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-200 text-sm" title="閉じる" aria-label="閉じる">
            ✕
          </button>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed mb-5">
          タスクはこの端末のブラウザにだけ保存されています。ファイルに書き出しておけば、ブラウザのデータを消したときや別の端末でも引き継げます。
        </p>

        <div className="space-y-3">
          <button
            onClick={exportTasks}
            disabled={tasks.length === 0}
            className="w-full text-sm font-black px-4 py-3 rounded-xl bg-cyan-400 text-black hover:bg-cyan-300 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ファイルに書き出す（{tasks.length}件）
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full text-sm font-bold px-4 py-3 rounded-xl border border-cyan-500/50 text-cyan-300 hover:bg-cyan-950/50 transition-all active:scale-95"
          >
            ファイルから読み込む
          </button>
          <label className="flex items-start gap-2 text-xs text-slate-300 leading-relaxed cursor-pointer">
            <input
              type="checkbox"
              checked={replaceExisting}
              onChange={(e) => setReplaceExisting(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-cyan-400 shrink-0"
            />
            <span>
              同じタスクを更新する（別の端末で進めた内容を反映するとき。今の内容は読み込んだ内容で置き換わります）
            </span>
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              // 同じファイルを続けて選んでも onChange が呼ばれるようにリセットする
              e.target.value = "";
              if (file) void importFile(file);
            }}
          />
        </div>

        {message && (
          <p
            role="status"
            className={`mt-4 text-xs rounded-xl px-3 py-2 border ${
              message.kind === "success"
                ? "text-cyan-200 bg-cyan-950/30 border-cyan-500/30"
                : "text-rose-300 bg-rose-950/30 border-rose-500/30"
            }`}
          >
            {message.text}
          </p>
        )}

        <p className="mt-5 text-[11px] text-slate-500 leading-relaxed">
          ・読み込んだタスクは今のタスクに追加されます。既にあるタスクは「同じタスクを更新する」を選んだときだけ置き換えます。
          <br />
          ・APIキーはファイルに含まれません。
        </p>
      </div>
    </div>
  );
}
