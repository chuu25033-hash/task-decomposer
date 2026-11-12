"use client";

import { useEffect, useState } from "react";
import { CheckIcon, EditIcon, TrashIcon } from "@/app/components/icons";
import { useInlineEdit } from "@/app/hooks/useInlineEdit";
import { MAX_TITLE_LENGTH, type Subtask } from "@/app/types/task";

interface Props {
  subtask: Subtask;
  isFirst: boolean;
  isLast: boolean;
  // 次に取り組むべきサブタスク（最初の未完了）
  isNext: boolean;
  // ⚡ で細分化中
  isBreakingDown: boolean;
  // AI再提案で置き換わる予定（薄く表示する）
  willBeReplaced: boolean;
  // タスク全体が AI 処理中（⚡・採用の切り替えを止める）
  isTaskBusy: boolean;
  onToggle: () => void;
  onToggleKeep: () => void;
  onBreakDown: () => void;
  onMove: (direction: -1 | 1) => void;
  onRename: (title: string) => void;
  onDelete: () => void;
}

// サブタスク1行（チェック・AIバッジ/採用・⚡細分化・並べ替え・編集・削除）
export default function SubtaskRow({
  subtask,
  isFirst,
  isLast,
  isNext,
  isBreakingDown,
  willBeReplaced,
  isTaskBusy,
  onToggle,
  onToggleKeep,
  onBreakDown,
  onMove,
  onRename,
  onDelete,
}: Props) {
  const edit = useInlineEdit(onRename);
  // チェック時のアニメーション
  const [isPopping, setIsPopping] = useState(false);
  useEffect(() => {
    if (!isPopping) return;
    const id = setTimeout(() => setIsPopping(false), 300);
    return () => clearTimeout(id);
  }, [isPopping]);

  const isAi = subtask.source === "ai";
  const title = subtask.title;

  return (
    <div
      /* スマホでは本文を横幅いっぱいに使い、操作ボタンは下の段に回す */
      className={`flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 rounded-xl transition-all duration-200 group border ${
        willBeReplaced ? "opacity-40 " : ""
      }${
        isBreakingDown
          ? "bg-[#0d0e14]/80 border-cyan-500/40 animate-cyber-pulse"
          : subtask.completed
          ? "bg-[#0d0e14]/50 border-transparent"
          : isNext
          ? "bg-cyan-950/30 hover:bg-cyan-950/50 border-cyan-400/60 shadow-[0_0_12px_rgba(6,182,212,0.25)]"
          : "bg-[#181b26] hover:bg-[#1e2230] border-slate-800 hover:border-cyan-500/40"
      }`}
    >
      <div className="flex items-start sm:items-center gap-2.5 sm:gap-3 flex-1 min-w-0">
        <input
          type="checkbox"
          checked={subtask.completed}
          onChange={() => {
            setIsPopping(true);
            onToggle();
          }}
          aria-label={`「${title}」を${subtask.completed ? "未完了に戻す" : "完了にする"}`}
          className={`w-4 h-4 mt-0.5 sm:mt-0 rounded border-slate-700 bg-[#0d0e14] text-cyan-400 focus:ring-cyan-400 cursor-pointer shrink-0 transition-all accent-cyan-400 ${
            isPopping ? "animate-pop" : ""
          }`}
        />
        {edit.isEditing ? (
          <input
            type="text"
            {...edit.inputProps}
            maxLength={MAX_TITLE_LENGTH}
            aria-label="手順の名前"
            className="bg-[#0d0e14] border border-cyan-400/80 rounded-lg px-2.5 py-1 text-sm flex-1 min-w-0 text-white focus:outline-none"
            autoFocus
          />
        ) : (
          <span
            className={`flex-1 min-w-0 text-sm whitespace-normal break-words transition-all duration-300 ${
              subtask.completed ? "line-through text-slate-500 font-normal" : "text-slate-200 font-medium"
            }`}
          >
            {isNext && !isBreakingDown && (
              <span className="inline-block mr-2 px-1.5 py-0.5 rounded-md bg-cyan-400 text-black text-[10px] font-black tracking-wider align-middle">
                次
              </span>
            )}
            {isAi &&
              (subtask.completed ? (
                <span className="inline-block mr-2 px-1 rounded border border-cyan-500/30 text-cyan-500/70 text-[10px] font-mono align-middle">
                  AI
                </span>
              ) : (
                /* タップで「採用」を切り替え（採用した提案は AI再提案 で作り直さない） */
                <button
                  onClick={onToggleKeep}
                  disabled={isTaskBusy}
                  aria-pressed={!!subtask.kept}
                  className={`inline-block mr-2 px-1 rounded border text-[10px] font-mono align-middle transition-all active:scale-95 disabled:cursor-not-allowed ${
                    subtask.kept
                      ? "border-amber-400/70 bg-amber-400/15 text-amber-300 font-bold"
                      : "border-cyan-500/30 text-cyan-500/70 hover:border-cyan-400 hover:text-cyan-300"
                  }`}
                  title={
                    subtask.kept
                      ? "採用中：AI再提案でも作り直しません（タップで解除）"
                      : "AIの提案：タップで採用すると、AI再提案で作り直されなくなります"
                  }
                >
                  {subtask.kept ? "📌採用" : "AI"}
                </button>
              ))}
            {title}
          </span>
        )}
      </div>

      {isBreakingDown ? (
        <span
          role="status"
          className="text-[10px] text-cyan-400/70 shrink-0 self-end sm:self-auto mt-1 sm:mt-0 sm:ml-2 animate-pulse"
        >
          分解中...
        </span>
      ) : (
        /* スマホではホバーできないため常時表示、PCではホバー・フォーカス時に表示 */
        <div className="flex items-center justify-end gap-1 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity mt-1 -mb-1 sm:my-0 sm:ml-2 shrink-0">
          {!subtask.completed && !edit.isEditing && (
            <button
              onClick={onBreakDown}
              disabled={isTaskBusy}
              className="text-xs text-cyan-500 hover:text-cyan-300 px-2 py-1 disabled:opacity-30 disabled:cursor-not-allowed"
              title="手が止まったら：この手順をAIが10分でできるアクションに細分化します"
              aria-label={`「${title}」をAIで細分化`}
            >
              ⚡
            </button>
          )}
          {!edit.isEditing && (
            <>
              <button
                onClick={() => onMove(-1)}
                disabled={isFirst}
                className="text-xs font-mono text-slate-500 hover:text-slate-200 px-1.5 py-1 disabled:opacity-20 disabled:cursor-not-allowed"
                title="上へ移動"
                aria-label={`「${title}」を上へ移動`}
              >
                ↑
              </button>
              <button
                onClick={() => onMove(1)}
                disabled={isLast}
                className="text-xs font-mono text-slate-500 hover:text-slate-200 px-1.5 py-1 disabled:opacity-20 disabled:cursor-not-allowed"
                title="下へ移動"
                aria-label={`「${title}」を下へ移動`}
              >
                ↓
              </button>
            </>
          )}
          {edit.isEditing ? (
            <button
              // 押した瞬間に入力欄のフォーカスが外れて先に保存され、ボタンが入れ替わるのを防ぐ
              onMouseDown={(e) => e.preventDefault()}
              onClick={edit.commit}
              className="text-cyan-400 hover:text-cyan-300 px-2 py-1"
              title="保存"
              aria-label="保存"
            >
              <CheckIcon />
            </button>
          ) : (
            <button
              onClick={() => edit.start(title)}
              className="text-slate-500 hover:text-slate-300 px-2 py-1"
              title="手順を編集"
              aria-label={`「${title}」を編集`}
            >
              <EditIcon />
            </button>
          )}
          <button
            onClick={onDelete}
            className="text-slate-600 hover:text-rose-400 px-2 py-1"
            title="手順を削除"
            aria-label={`「${title}」を削除`}
          >
            <TrashIcon />
          </button>
        </div>
      )}
    </div>
  );
}
