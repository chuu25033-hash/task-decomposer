"use client";

import { useState } from "react";
import SubtaskRow from "@/app/components/SubtaskRow";
import { TrashIcon } from "@/app/components/icons";
import { isSubmitEnter, useInlineEdit } from "@/app/hooks/useInlineEdit";
import { getAiPlan, type AiMode } from "@/app/lib/subtaskLogic";
import { MAX_TITLE_LENGTH, type Subtask, type Task } from "@/app/types/task";

// AIボタンの動作の切り替え（getAiPlan）は lib/subtaskLogic.ts を参照
const AI_MODE_LABELS: Record<AiMode, string> = {
  decompose: "AI分解",
  regenerate: "AI再提案",
  append: "AI追加",
};

const AI_MODE_DESCRIPTIONS: Record<AiMode, string> = {
  decompose: "タスクをAIが10分でできるアクションに分解します",
  regenerate:
    "完了済みと自分で追加した手順は残し、未完了のAI提案を同じ個数のまま今の進み具合に合わせて作り直します",
  append: "完了済みの続きから、次に取り組むアクションをAIが追加します",
};

export const COUNT_OPTIONS = [1, 3, 5, 10];
export const DEFAULT_COUNT = 5;

export interface UndoState {
  removed: Subtask[];
  addedIds: string[];
}

// カードの操作（taskId を受け取る形にして、page 側で1つのオブジェクトにまとめて渡す）
export interface TaskCardActions {
  decompose: (task: Task) => void;
  breakDown: (task: Task, subtask: Subtask) => void;
  selectCount: (taskId: string, count: number) => void;
  deleteTask: (task: Task) => void;
  renameTask: (taskId: string, title: string) => void;
  addSubtask: (taskId: string, title: string) => void;
  toggleSubtask: (taskId: string, subtaskId: string) => void;
  toggleKeep: (taskId: string, subtaskId: string) => void;
  moveSubtask: (taskId: string, subtaskId: string, direction: -1 | 1) => void;
  renameSubtask: (taskId: string, subtaskId: string, title: string) => void;
  deleteSubtask: (taskId: string, subtaskId: string) => void;
  undoRegenerate: (taskId: string) => void;
  dismissUndo: (taskId: string) => void;
  dismissError: (taskId: string) => void;
  toggleExpanded: (taskId: string) => void;
  dismissAdoptTip: () => void;
  openHelp: () => void;
}

interface Props {
  task: Task;
  selectedCount: number;
  // ⚡ で細分化中のサブタスク ID（このタスク以外のものが含まれていてもよい）
  breakingDownIds: string[];
  error: string | null;
  undo: UndoState | null;
  showAdoptTip: boolean;
  isRecentlyAdded: boolean;
  isExpanded: boolean;
  actions: TaskCardActions;
}

export default function TaskCard({
  task,
  selectedCount,
  breakingDownIds,
  error,
  undo,
  showAdoptTip,
  isRecentlyAdded,
  isExpanded,
  actions,
}: Props) {
  const titleEdit = useInlineEdit((title) => actions.renameTask(task.id, title));
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");

  const completedCount = task.subtasks.filter((s) => s.completed).length;
  const totalCount = task.subtasks.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const isAllCompleted = totalCount > 0 && completedCount === totalCount;
  const aiPlan = getAiPlan(task, selectedCount);
  const isDecomposing = !!task.isDecomposing;
  // ⚡ の細分化とAI再提案が同時に走ると結果が食い違うため、どちらかの処理中はもう一方を止める
  const isBreakingDownAny = task.subtasks.some((s) => breakingDownIds.includes(s.id));
  const isAiBusy = isDecomposing || isBreakingDownAny;
  const targetIds = new Set(aiPlan.targetIds);
  const nextSubtaskId = task.subtasks.find((s) => !s.completed)?.id;
  // すべて完了したタスクは折りたたんで一覧をすっきりさせる（AI処理中は除く）
  const isCollapsed = isAllCompleted && !isDecomposing && !isExpanded;

  const submitSubtask = () => {
    if (!newSubtaskTitle.trim()) return;
    actions.addSubtask(task.id, newSubtaskTitle);
    setNewSubtaskTitle("");
  };

  return (
    <article
      aria-label={task.title}
      aria-busy={isAiBusy}
      className={`bg-[#141721] rounded-2xl p-4 sm:p-6 shadow-xl border border-slate-800/80 transition-all ${
        isDecomposing
          ? "animate-cyber-scan animate-cyber-pulse border-cyan-500/60 shadow-[0_0_20px_rgba(6,182,212,0.4)]"
          : isRecentlyAdded
          ? "animate-slide-in animate-cyber-pulse"
          : "hover:border-cyan-500/40 cyber-glow"
      }`}
    >
      {/* カードヘッダー */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        {titleEdit.isEditing ? (
          <input
            type="text"
            {...titleEdit.inputProps}
            maxLength={MAX_TITLE_LENGTH}
            aria-label="タスク名"
            className="flex-1 min-w-0 bg-[#0d0e14] border border-cyan-400/80 rounded-lg px-2.5 py-1 text-base font-bold text-white focus:outline-none"
            autoFocus
          />
        ) : (
          <h3 className="min-w-0 text-base font-bold text-slate-100 tracking-wide leading-snug break-words">
            <button
              onClick={() => titleEdit.start(task.title)}
              className="text-left cursor-text hover:text-cyan-200 transition-colors"
              title="クリックしてタスク名を編集"
            >
              {task.title}
            </button>
          </h3>
        )}

        {/* 分解操作エリア */}
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {aiPlan.mode === "regenerate" ? (
            /* 再提案時は個数が自動で決まる（未完了のAI提案と同数） */
            <div
              className="bg-[#0d0e14] px-3 py-1.5 rounded-xl text-xs text-slate-400 border border-slate-800"
              title="未完了のAI提案と同じ個数で作り直すため、タスクの総数は増えません"
            >
              残り<span className="text-cyan-300 font-black font-mono mx-0.5">{aiPlan.count}</span>個
            </div>
          ) : (
            /* 分解粒度チップ */
            <div
              role="group"
              aria-label="AIが作る手順の個数"
              className="flex items-center bg-[#0d0e14] p-1 rounded-xl text-xs font-medium border border-slate-800"
            >
              {COUNT_OPTIONS.map((num) => (
                <button
                  key={num}
                  onClick={() => actions.selectCount(task.id, num)}
                  aria-pressed={selectedCount === num}
                  aria-label={`${num}個`}
                  className={`px-2.5 py-1 rounded-lg transition-all text-xs font-mono ${
                    selectedCount === num
                      ? "bg-cyan-950 text-cyan-300 font-black border border-cyan-400/60 shadow-[0_0_10px_rgba(6,182,212,0.4)] scale-105"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {num}
                </button>
              ))}
            </div>
          )}

          <button
            onClick={() => actions.decompose(task)}
            disabled={isAiBusy}
            title={isBreakingDownAny ? "⚡ の細分化が終わるまでお待ちください" : AI_MODE_DESCRIPTIONS[aiPlan.mode]}
            className={`text-xs font-black px-4 py-2 rounded-xl transition-all shadow-md flex items-center gap-1.5 shrink-0 active:scale-95 border disabled:cursor-not-allowed ${
              isDecomposing
                ? "animate-cyber-shimmer border-cyan-400/50 text-cyan-200"
                : "bg-cyan-950 hover:bg-cyan-900/90 border-cyan-400/80 text-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.3)] hover:shadow-[0_0_20px_rgba(6,182,212,0.5)] disabled:opacity-50"
            }`}
          >
            <span
              aria-hidden="true"
              className={`text-cyan-400 text-sm drop-shadow-[0_0_5px_rgba(6,182,212,0.8)] ${
                isDecomposing ? "animate-spin inline-block" : ""
              }`}
            >
              ⚡
            </span>
            <span className="tracking-wider">{isDecomposing ? "生成中..." : AI_MODE_LABELS[aiPlan.mode]}</span>
          </button>

          <button
            onClick={() => actions.deleteTask(task)}
            className="text-slate-400 hover:text-rose-400 p-1.5 rounded-lg transition-colors"
            title="タスクを削除"
            aria-label={`タスク「${task.title}」を削除`}
          >
            <TrashIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* エラー表示 */}
      {error && (
        <div
          role="alert"
          className="mb-4 flex items-start justify-between gap-2 text-xs text-rose-300 bg-rose-950/30 border border-rose-500/30 rounded-xl px-3 py-2"
        >
          <span>{error}</span>
          <button
            onClick={() => actions.dismissError(task.id)}
            className="text-rose-400 hover:text-rose-200 shrink-0"
            title="閉じる"
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>
      )}

      {/* AI再提案の取り消し */}
      {undo && !isDecomposing && (
        <div
          role="status"
          className="mb-4 flex items-center justify-between gap-2 text-xs text-cyan-200 bg-cyan-950/30 border border-cyan-500/30 rounded-xl px-3 py-2"
        >
          <span>未完了のAI提案 {undo.removed.length}件 を作り直しました</span>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => actions.undoRegenerate(task.id)}
              className="font-bold text-cyan-300 hover:text-cyan-100 underline underline-offset-2"
              title="新しい提案のうち、手を付けていないものを元の提案に戻します（完了・採用・編集したものは残ります）"
            >
              元に戻す
            </button>
            <button
              onClick={() => actions.dismissUndo(task.id)}
              className="text-slate-400 hover:text-slate-300"
              title="閉じる"
              aria-label="閉じる"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* 進捗バー */}
      {totalCount > 0 && (
        <div className="mb-5 bg-[#0d0e14] p-3 rounded-xl border border-slate-800/80">
          <div className="flex justify-between items-center text-xs mb-2">
            <span className={isAllCompleted ? "text-cyan-300 font-bold" : "text-slate-400"}>
              {isAllCompleted ? "すべて完了" : "進捗"}
            </span>
            <span className="text-cyan-400 font-bold font-mono">
              {completedCount} / {totalCount} ({progressPercent}%)
            </span>
          </div>
          <div
            role="progressbar"
            aria-label="進捗"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progressPercent}
            className="w-full bg-[#181b26] h-2 rounded-full overflow-hidden border border-slate-800"
          >
            <div
              className={`h-full rounded-full transition-all duration-500 ease-out ${
                isAllCompleted
                  ? "bg-gradient-to-r from-cyan-400 via-sky-300 to-teal-300 shadow-[0_0_12px_rgba(6,182,212,0.8)]"
                  : "bg-gradient-to-r from-cyan-500 via-sky-400 to-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.7)]"
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* 完了タスクの折りたたみ切り替え */}
      {isAllCompleted && !isDecomposing && (
        <button
          onClick={() => actions.toggleExpanded(task.id)}
          aria-expanded={!isCollapsed}
          className={`w-full text-xs text-slate-400 hover:text-cyan-300 transition-colors py-1 ${
            isCollapsed ? "" : "mb-4"
          }`}
        >
          {isCollapsed ? `▼ 手順を表示（${totalCount}件）` : "▲ 折りたたむ"}
        </button>
      )}

      {!isCollapsed && (
        <>
          {/* 初回だけの操作ヒント（AIバッジがボタンだと気づきにくいため） */}
          {showAdoptTip && (
            <div className="mb-3 flex items-start justify-between gap-2 text-xs text-amber-100 bg-amber-400/10 border border-amber-400/30 rounded-xl px-3 py-2">
              <span className="leading-relaxed">
                💡 気に入った提案は <b className="text-amber-300">AI</b> をタップして{" "}
                <b className="text-amber-300">📌採用</b>。AI再提案で作り直しても残ります。
                <button
                  onClick={actions.openHelp}
                  className="ml-1 font-bold text-cyan-300 hover:text-cyan-100 underline underline-offset-2"
                >
                  使い方
                </button>
              </span>
              <button
                onClick={actions.dismissAdoptTip}
                className="text-amber-300 hover:text-amber-100 shrink-0"
                title="閉じる"
                aria-label="ヒントを閉じる"
              >
                ✕
              </button>
            </div>
          )}

          {/* サブタスク一覧（手動整理した内容は分解中も表示し続ける） */}
          <div className="space-y-2 mb-4">
            {task.subtasks.map((subtask, index) => (
              <SubtaskRow
                key={subtask.id}
                subtask={subtask}
                isFirst={index === 0}
                isLast={index === task.subtasks.length - 1}
                isNext={subtask.id === nextSubtaskId}
                isBreakingDown={breakingDownIds.includes(subtask.id)}
                willBeReplaced={isDecomposing && targetIds.has(subtask.id)}
                isTaskBusy={isDecomposing}
                onToggle={() => actions.toggleSubtask(task.id, subtask.id)}
                onToggleKeep={() => actions.toggleKeep(task.id, subtask.id)}
                onBreakDown={() => actions.breakDown(task, subtask)}
                onMove={(direction) => actions.moveSubtask(task.id, subtask.id, direction)}
                onRename={(title) => actions.renameSubtask(task.id, subtask.id, title)}
                onDelete={() => actions.deleteSubtask(task.id, subtask.id)}
              />
            ))}

            {/* スケルトン（AI生成中は既存サブタスクの下に骨組みを表示） */}
            {isDecomposing &&
              Array.from({ length: aiPlan.count }).map((_, idx) => (
                <div
                  key={`skeleton-${idx}`}
                  aria-hidden="true"
                  className="flex items-center gap-3 p-3 rounded-xl bg-[#0d0e14]/80 border border-cyan-500/20 overflow-hidden relative"
                >
                  <div className="w-4 h-4 rounded border border-slate-800 bg-[#141721] shrink-0" />
                  <div className="h-4 bg-[#181b26] rounded-md flex-1 overflow-hidden relative">
                    <div className="absolute inset-0 animate-cyber-shimmer bg-gradient-to-r from-transparent via-cyan-500/20 to-transparent" />
                  </div>
                </div>
              ))}
          </div>

          {/* 手動サブタスク追加フォーム */}
          <div className="flex gap-2 pt-3 border-t border-slate-800">
            <input
              type="text"
              placeholder="手順を自分で追加...（詰まったら AI再提案 / ⚡）"
              aria-label={`「${task.title}」に手順を追加`}
              maxLength={MAX_TITLE_LENGTH}
              value={newSubtaskTitle}
              onChange={(e) => setNewSubtaskTitle(e.target.value)}
              onKeyDown={(e) => isSubmitEnter(e) && submitSubtask()}
              className="flex-1 min-w-0 text-base sm:text-sm bg-[#0d0e14] border border-slate-800 rounded-xl px-3.5 py-2 text-slate-200 placeholder-slate-400 focus:outline-none focus:border-cyan-500/50 transition-all"
            />
            <button
              onClick={submitSubtask}
              className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold px-4 py-2 rounded-xl transition-all shrink-0 active:scale-95"
            >
              追加
            </button>
          </div>
        </>
      )}
    </article>
  );
}
