"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ApiKeyModal from "@/app/components/ApiKeyModal";
import BackupModal from "@/app/components/BackupModal";
import HelpModal from "@/app/components/HelpModal";
import TaskCard, { DEFAULT_COUNT, type TaskCardActions, type UndoState } from "@/app/components/TaskCard";
import { BackupIcon } from "@/app/components/icons";
import { isSubmitEnter } from "@/app/hooks/useInlineEdit";
import { useStoredTasks } from "@/app/hooks/useStoredTasks";
import { clearApiKey, loadApiKey, type StoredApiKey } from "@/app/lib/apiKeyStorage";
import { API_KEY_HEADER, ERROR_CODES } from "@/app/lib/gemini";
import { readStorage, writeStorage } from "@/app/lib/safeStorage";
import {
  getAiPlan,
  replaceAiSubtasks,
  replaceSubtaskWith,
  restoreReplacedSubtasks,
} from "@/app/lib/subtaskLogic";
import { mergeImportedTasks } from "@/app/lib/taskBackup";
import {
  addSubtask,
  addTask,
  moveSubtask,
  normalizeTitle,
  removeSubtask,
  removeTask,
  renameSubtask,
  renameTask,
  setDecomposing,
  toggleSubtaskCompleted,
  toggleSubtaskKept,
  updateSubtasks,
} from "@/app/lib/taskUpdates";
import { isReplaceableByAi, MAX_TITLE_LENGTH, type Subtask, type Task } from "@/app/types/task";

// AI呼び出しの失敗（code で APIキー起因かどうかを判別する）
class AiRequestError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

// 「採用」のヒントを閉じたかどうか（一度閉じたら二度と出さない）
const ADOPT_TIP_KEY = "task_decomposer_adopt_tip_dismissed";

// エラーコードごとの、カード内に表示するメッセージ
const AI_ERROR_MESSAGES: Record<string, string> = {
  [ERROR_CODES.RATE_LIMITED]:
    "Gemini の無料枠の利用上限に達しました。しばらく待ってから再試行してください。",
  [ERROR_CODES.TOO_MANY_REQUESTS]: "短時間に何度も呼び出されています。1分ほど待ってから再試行してください。",
  [ERROR_CODES.TASK_REFUSED]: "このタスクは、他者や社会に害を与えるおそれがあるため分解できません。",
  [ERROR_CODES.TASK_REFUSED_SELF_HARM]:
    "このタスクは分解できません。つらい気持ちを抱えているなら、ひとりで抱え込まずに相談してください。よりそいホットライン 0120-279-338（24時間・無料）",
};

// 状態のうち、タスクごとに持つもの（タスクを消したら一緒に消す）
const withoutKey = <T,>(record: Record<string, T>, key: string): Record<string, T> => {
  if (!(key in record)) return record;
  const next = { ...record };
  delete next[key];
  return next;
};

export default function Home() {
  const { tasks, setTasks, isLoaded, saveFailed } = useStoredTasks();
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [decomposeCounts, setDecomposeCounts] = useState<Record<string, number>>({});
  // AIで細分化中のサブタスクID（保存不要なのでタスクとは別に管理）
  const [breakingDownIds, setBreakingDownIds] = useState<string[]>([]);
  const [taskErrors, setTaskErrors] = useState<Record<string, string>>({});
  // AI再提案の「元に戻す」用（置き換えたAI提案と、新たに追加したサブタスクID。保存不要）
  const [undoStates, setUndoStates] = useState<Record<string, UndoState>>({});
  const [apiKey, setApiKey] = useState<StoredApiKey | null>(null);
  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);
  const [keyModalReason, setKeyModalReason] = useState<string | null>(null);
  const [recentlyAddedId, setRecentlyAddedId] = useState<string | null>(null);
  // すべて完了して折りたたまれたタスクのうち、開いているもの
  const [expandedTaskIds, setExpandedTaskIds] = useState<string[]>([]);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isBackupOpen, setIsBackupOpen] = useState(false);
  // 復元前にヒントが一瞬出ないよう、初期値は「閉じた」扱いにする
  const [isAdoptTipDismissed, setIsAdoptTipDismissed] = useState(true);
  const recentlyAddedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // APIキーとヒントの表示状態をマウント後に読み込む（ハイドレーション不一致を避ける）
  useEffect(() => {
    // 期限切れのキーは loadApiKey が null を返す
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setApiKey(loadApiKey());
    setIsAdoptTipDismissed(readStorage(ADOPT_TIP_KEY) === "1");
  }, []);

  useEffect(
    () => () => {
      if (recentlyAddedTimer.current) clearTimeout(recentlyAddedTimer.current);
    },
    []
  );

  const setTaskError = (taskId: string, message: string | null) => {
    setTaskErrors((prev) => (message ? { ...prev, [taskId]: message } : withoutKey(prev, taskId)));
  };

  const setUndoState = (taskId: string, state: UndoState | null) => {
    setUndoStates((prev) => (state ? { ...prev, [taskId]: state } : withoutKey(prev, taskId)));
  };

  const openKeyModal = (reason: string | null = null) => {
    setKeyModalReason(reason);
    setIsKeyModalOpen(true);
  };

  const closeKeyModal = useCallback(() => {
    setIsKeyModalOpen(false);
    setKeyModalReason(null);
  }, []);

  const closeHelp = useCallback(() => setIsHelpOpen(false), []);
  const closeBackup = useCallback(() => setIsBackupOpen(false), []);

  const dismissAdoptTip = () => {
    setIsAdoptTipDismissed(true);
    writeStorage(ADOPT_TIP_KEY, "1");
  };

  const removeApiKey = () => {
    clearApiKey();
    setApiKey(null);
  };

  // メインタスク追加（入力欄のすぐ下に出るよう先頭に追加する）
  const submitTask = () => {
    const title = normalizeTitle(newTaskTitle);
    if (!title) return;
    const newTask: Task = { id: crypto.randomUUID(), title, subtasks: [] };
    setTasks((prev) => addTask(prev, newTask));
    setNewTaskTitle("");
    // どこに追加されたか分かるよう、少しの間カードを光らせる
    setRecentlyAddedId(newTask.id);
    if (recentlyAddedTimer.current) clearTimeout(recentlyAddedTimer.current);
    recentlyAddedTimer.current = setTimeout(() => setRecentlyAddedId(null), 1800);
  };

  // AI呼び出し失敗時の共通処理
  const handleAiError = (taskId: string, e: unknown, fallbackMessage: string) => {
    console.error("AI呼び出しに失敗しました:", e);
    const code = e instanceof AiRequestError ? e.code : undefined;

    if (code === ERROR_CODES.INVALID_API_KEY || code === ERROR_CODES.API_KEY_REQUIRED) {
      // 使えなくなったキーは破棄して再登録を促す
      removeApiKey();
      setTaskError(taskId, "APIキーが無効になっています。再登録してから、もう一度お試しください。");
      openKeyModal("登録されていたAPIキーが使えなくなりました。お手数ですが、もう一度登録してください。");
      return;
    }
    setTaskError(taskId, (code && AI_ERROR_MESSAGES[code]) || fallbackMessage);
  };

  // /api/decompose を呼び出し、生成されたサブタスクを返す（失敗時は例外）
  const requestSubtasks = async (
    payload: {
      taskTitle: string;
      count: number;
      existingSubtasks?: { title: string; completed: boolean }[];
      rejectedSubtasks?: string[];
      focusSubtask?: string;
    },
    key: string
  ): Promise<Subtask[]> => {
    const res = await fetch("/api/decompose", {
      method: "POST",
      headers: { "Content-Type": "application/json", [API_KEY_HEADER]: key },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok || !Array.isArray(data.subtasks) || data.subtasks.length === 0) {
      throw new AiRequestError(data.error ?? `HTTP ${res.status}`, data.code);
    }

    return data.subtasks.map((subTitle: string) => ({
      id: crypto.randomUUID(),
      title: subTitle,
      completed: false,
      source: "ai",
    }));
  };

  // AI分解 / AI再提案 / AI追加（動作の切り替えは getAiPlan を参照）
  // 完了済み・ユーザーの手順は残し、未完了のAI提案だけを同じ個数の新しい提案に作り直す
  const decomposeTask = async (task: Task) => {
    // APIキー未登録なら先に登録してもらう
    if (!apiKey) {
      openKeyModal();
      return;
    }
    const { count, targetIds } = getAiPlan(task, decomposeCounts[task.id] ?? DEFAULT_COUNT);
    const targets = new Set(targetIds);
    // 作り直し対象（元に戻す用に控えておく）
    const removed = task.subtasks.filter((s) => targets.has(s.id));
    setTaskError(task.id, null);
    setUndoState(task.id, null);
    // 分解開始状態にする（スケルトン表示用）。並行する他の処理を上書きしないよう、常に最新の状態から更新する
    setTasks((prev) => setDecomposing(prev, task.id, true));

    try {
      const generatedSubtasks = await requestSubtasks(
        {
          taskTitle: task.title,
          count,
          // 完了済み・ユーザーの手順・採用したAI提案（＝作り直さないもの）は「今の計画」として渡す
          existingSubtasks: task.subtasks
            .filter((s) => !targets.has(s.id))
            .map((s) => ({ title: s.title, completed: s.completed })),
          // 作り直す（採用されなかった）案は、同じ案が返らないよう「避けるべき案」として渡す
          rejectedSubtasks: removed.map((s) => s.title),
        },
        apiKey.key
      );

      // 処理中にチェック・追加された内容も反映するため、最新の状態から差し替える
      // （置き換えるのは、依頼時に対象にしたAI提案のうち、まだ手を付けていないものだけ）
      setTasks((prev) =>
        setDecomposing(
          updateSubtasks(prev, task.id, (subtasks) =>
            replaceAiSubtasks(subtasks, generatedSubtasks, targetIds)
          ),
          task.id,
          false
        )
      );
      if (removed.length > 0) {
        setUndoState(task.id, { removed, addedIds: generatedSubtasks.map((s) => s.id) });
      }
    } catch (e) {
      handleAiError(task.id, e, "AIの提案に失敗しました。少し時間をおいて再試行してください。");
      setTasks((prev) => setDecomposing(prev, task.id, false));
    }
  };

  // 行き詰まったサブタスクを、10分でできるアクションに細分化して差し替える
  const breakDownSubtask = async (task: Task, subtask: Subtask) => {
    if (!apiKey) {
      openKeyModal();
      return;
    }
    setTaskError(task.id, null);
    setBreakingDownIds((prev) => [...prev, subtask.id]);

    try {
      const generatedSubtasks = await requestSubtasks(
        { taskTitle: task.title, count: 3, focusSubtask: subtask.title },
        apiKey.key
      );
      // 処理中に削除された場合は何もしない（replaceSubtaskWith がそのまま返す）
      setTasks((prev) =>
        updateSubtasks(prev, task.id, (subtasks) =>
          replaceSubtaskWith(subtasks, subtask.id, generatedSubtasks)
        )
      );
    } catch (e) {
      handleAiError(task.id, e, "AIの細分化に失敗しました。少し時間をおいて再試行してください。");
    } finally {
      setBreakingDownIds((prev) => prev.filter((id) => id !== subtask.id));
    }
  };

  // タスク削除（サブタスクがある場合は誤操作防止のため確認する）
  const deleteTask = (task: Task) => {
    if (task.subtasks.length > 0 && !window.confirm(`「${task.title}」を削除しますか？`)) {
      return;
    }
    setTasks((prev) => removeTask(prev, task.id));
    setTaskError(task.id, null);
    setUndoState(task.id, null);
    setDecomposeCounts((prev) => withoutKey(prev, task.id));
    setExpandedTaskIds((prev) => prev.filter((id) => id !== task.id));
  };

  // AI再提案を取り消し、置き換える前のAI提案に戻す（置き換え・復元の処理は lib/subtaskLogic.ts）
  const undoRegenerate = (taskId: string) => {
    const undo = undoStates[taskId];
    if (!undo) return;
    setTasks((prev) =>
      updateSubtasks(prev, taskId, (subtasks) => restoreReplacedSubtasks(subtasks, undo))
    );
    setUndoState(taskId, null);
  };

  // バックアップから読み込んだタスクを反映する（既定は追加のみ）
  const importTasks = (imported: Task[], options: { replaceExisting: boolean }) => {
    setTasks((prev) => mergeImportedTasks(prev, imported, options).tasks);
  };

  // カードに渡す操作（状態の更新はすべて最新の状態 prev に対して行う）
  const actions: TaskCardActions = {
    decompose: decomposeTask,
    breakDown: breakDownSubtask,
    selectCount: (taskId, count) => setDecomposeCounts((prev) => ({ ...prev, [taskId]: count })),
    deleteTask,
    renameTask: (taskId, title) => setTasks((prev) => renameTask(prev, taskId, title)),
    addSubtask: (taskId, rawTitle) => {
      const title = normalizeTitle(rawTitle);
      if (!title) return;
      const subtask: Subtask = { id: crypto.randomUUID(), title, completed: false, source: "user" };
      setTasks((prev) => addSubtask(prev, taskId, subtask));
    },
    toggleSubtask: (taskId, subtaskId) =>
      setTasks((prev) => toggleSubtaskCompleted(prev, taskId, subtaskId)),
    toggleKeep: (taskId, subtaskId) => {
      // 一度でも採用を使えば操作は分かっているので、ヒントは出さない
      dismissAdoptTip();
      setTasks((prev) => toggleSubtaskKept(prev, taskId, subtaskId));
    },
    moveSubtask: (taskId, subtaskId, direction) =>
      setTasks((prev) => moveSubtask(prev, taskId, subtaskId, direction)),
    renameSubtask: (taskId, subtaskId, title) =>
      setTasks((prev) => renameSubtask(prev, taskId, subtaskId, title)),
    deleteSubtask: (taskId, subtaskId) => setTasks((prev) => removeSubtask(prev, taskId, subtaskId)),
    undoRegenerate,
    dismissUndo: (taskId) => setUndoState(taskId, null),
    dismissError: (taskId) => setTaskError(taskId, null),
    toggleExpanded: (taskId) =>
      setExpandedTaskIds((prev) =>
        prev.includes(taskId) ? prev.filter((id) => id !== taskId) : [...prev, taskId]
      ),
    dismissAdoptTip,
    openHelp: () => setIsHelpOpen(true),
  };

  // 「採用」のヒントは、未採用のAI提案がある最初のカードにだけ出す
  // （そのカードが AI 処理中のあいだは出さない）
  const adoptTipTaskId = useMemo(() => {
    if (isAdoptTipDismissed) return undefined;
    const target = tasks.find((t) => t.subtasks.some(isReplaceableByAi));
    return target && !target.isDecomposing ? target.id : undefined;
  }, [tasks, isAdoptTipDismissed]);

  return (
    <div className="min-h-screen bg-[#0f1117] text-slate-100 antialiased selection:bg-cyan-500 selection:text-black font-sans relative overflow-x-hidden">
      {/* 水色単色 ネオンオーロラ */}
      <div className="fixed top-[-80px] left-1/2 -translate-x-1/2 w-[850px] h-[350px] bg-gradient-to-tr from-cyan-500/18 via-sky-500/12 to-cyan-400/10 blur-[120px] pointer-events-none -z-10" />
      <div className="fixed bottom-0 right-0 w-[400px] h-[400px] bg-cyan-500/10 blur-[140px] pointer-events-none -z-10" />

      <header className="bg-[#141721]/80 backdrop-blur-2xl border-b border-cyan-500/20 sticky top-0 z-20 shadow-xl shadow-black/50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div
              aria-hidden="true"
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-cyan-950 border border-cyan-400/60 flex items-center justify-center text-cyan-300 font-black text-base sm:text-lg shadow-[0_0_15px_rgba(6,182,212,0.4)] shrink-0"
            >
              T
            </div>
            <h1 className="min-w-0 text-lg sm:text-xl font-black tracking-wide sm:tracking-wider truncate bg-gradient-to-r from-cyan-300 via-sky-200 to-cyan-400 bg-clip-text text-transparent drop-shadow-[0_0_8px_rgba(6,182,212,0.3)]">
              TaskDecomposer
            </h1>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              onClick={() => setIsHelpOpen(true)}
              className="w-8 h-8 rounded-xl border border-slate-700 text-slate-300 hover:border-cyan-500/60 hover:text-cyan-200 text-sm font-black transition-all active:scale-95"
              title="使い方"
              aria-label="使い方"
            >
              ?
            </button>

            {isLoaded && (
              <button
                onClick={() => setIsBackupOpen(true)}
                className="w-8 h-8 flex items-center justify-center rounded-xl border border-slate-700 text-slate-300 hover:border-cyan-500/60 hover:text-cyan-200 transition-all active:scale-95"
                title="バックアップ（書き出し・読み込み）"
                aria-label="バックアップ"
              >
                <BackupIcon />
              </button>
            )}

            {isLoaded && (
              <button
                onClick={() => openKeyModal()}
                className={`h-8 flex items-center gap-1.5 sm:gap-2 text-xs font-bold px-2.5 sm:px-3 rounded-xl border whitespace-nowrap transition-all active:scale-95 ${
                  apiKey
                    ? "border-slate-700 text-slate-300 hover:border-cyan-500/60 hover:text-cyan-200"
                    : "border-rose-500/50 text-rose-300 hover:bg-rose-950/40"
                }`}
                title="Gemini APIキーの設定"
              >
                <span
                  aria-hidden="true"
                  className={`w-2 h-2 rounded-full ${
                    apiKey ? "bg-cyan-400 shadow-[0_0_6px_rgba(6,182,212,0.9)]" : "bg-rose-400 animate-pulse"
                  }`}
                />
                {/* スマホでは登録済みのとき短く表示（状態は点の色でも分かる）。未登録は気づけるよう省略しない */}
                {apiKey ? (
                  <>
                    APIキー<span className="hidden sm:inline">登録済み</span>
                  </>
                ) : (
                  "APIキー未登録"
                )}
              </button>
            )}
          </div>
        </div>
      </header>

      {isHelpOpen && <HelpModal onClose={closeHelp} />}

      {isBackupOpen && <BackupModal tasks={tasks} onImport={importTasks} onClose={closeBackup} />}

      {isKeyModalOpen && (
        <ApiKeyModal
          current={apiKey}
          reason={keyModalReason}
          onSaved={(stored) => {
            setApiKey(stored);
            closeKeyModal();
          }}
          onClear={removeApiKey}
          onClose={closeKeyModal}
        />
      )}

      <main className="max-w-2xl mx-auto px-3 sm:px-6 py-8 sm:py-12">
        {/* キャッチコピー */}
        <div className="text-center mb-6 sm:mb-10">
          <h2 className="text-2xl sm:text-4xl font-black text-slate-100 tracking-tight mb-3">
            思考の摩擦を、
            <span className="bg-gradient-to-r from-cyan-400 via-sky-300 to-cyan-200 bg-clip-text text-transparent drop-shadow-[0_0_12px_rgba(6,182,212,0.4)]">
              ゼロ
            </span>
            にする。
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 tracking-wide font-medium">
            大きなタスクを、AIが「10分でできる行動」に分けます
          </p>
        </div>

        {/* 保存に失敗したときの案内（容量オーバー・プライベートモードなど） */}
        {saveFailed && (
          <div
            role="alert"
            className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-rose-200 bg-rose-950/30 border border-rose-500/40 rounded-2xl px-4 py-3"
          >
            <p className="leading-relaxed">
              ブラウザにタスクを保存できませんでした（容量不足・プライベートモードなど）。このまま閉じると変更が失われるため、バックアップで書き出してください。
            </p>
            <button
              onClick={() => setIsBackupOpen(true)}
              className="text-xs font-black px-4 py-2 rounded-xl bg-rose-400 text-black hover:bg-rose-300 transition-all shrink-0 active:scale-95"
            >
              書き出す
            </button>
          </div>
        )}

        {/* タスク入力エリア */}
        <section className="bg-[#181b26] rounded-2xl p-2 shadow-2xl border border-cyan-500/30 mb-10 flex gap-2 items-center focus-within:border-cyan-400 focus-within:ring-2 focus-within:ring-cyan-500/20 transition-all cyber-glow">
          <input
            type="text"
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            onKeyDown={(e) => isSubmitEnter(e) && submitTask()}
            placeholder="大きなタスクを入力... (例: レポートを提出する)"
            aria-label="新しいタスク"
            maxLength={MAX_TITLE_LENGTH}
            className="flex-1 min-w-0 px-4 py-3 text-slate-100 placeholder-slate-500 bg-transparent focus:outline-none text-sm font-medium tracking-wide"
          />
          <button
            onClick={submitTask}
            className="bg-cyan-950 hover:bg-cyan-900 border border-cyan-400/80 text-cyan-300 font-black px-6 py-3 rounded-xl transition-all text-xs tracking-wider shrink-0 active:scale-95 shadow-[0_0_15px_rgba(6,182,212,0.3)]"
          >
            追加
          </button>
        </section>

        {/* APIキー未登録の案内 */}
        {isLoaded && !apiKey && (
          <div className="-mt-6 mb-10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-cyan-950/20 border border-cyan-500/30 rounded-2xl px-4 py-3">
            <p className="text-xs text-slate-300 leading-relaxed">
              AI分解を使うには、無料の <span className="font-bold text-cyan-300">Gemini APIキー</span>{" "}
              の登録が必要です（1分ほど・初回のみ）。
            </p>
            <button
              onClick={() => openKeyModal()}
              className="text-xs font-black px-4 py-2 rounded-xl bg-cyan-400 text-black hover:bg-cyan-300 transition-all shrink-0 active:scale-95"
            >
              登録する
            </button>
          </div>
        )}

        {/* タスクカード一覧 */}
        <div className="space-y-6">
          {!isLoaded ? (
            <div role="status" className="text-center py-16 bg-[#141721] rounded-2xl border border-slate-800">
              <div className="w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-slate-500 text-xs">読み込み中...</p>
            </div>
          ) : tasks.length === 0 ? (
            <div className="text-center py-16 bg-[#141721] rounded-2xl border border-dashed border-slate-800">
              <div
                aria-hidden="true"
                className="w-12 h-12 rounded-2xl bg-cyan-950/50 text-cyan-400 border border-cyan-500/30 flex items-center justify-center mx-auto mb-3 text-xl shadow-[0_0_15px_rgba(6,182,212,0.2)]"
              >
                ⚡
              </div>
              <p className="text-slate-200 font-bold text-sm mb-1">タスクはまだありません</p>
              <p className="text-slate-500 text-xs">大きなタスクを入力して、AIで分解してみましょう</p>
            </div>
          ) : (
            tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                selectedCount={decomposeCounts[task.id] ?? DEFAULT_COUNT}
                breakingDownIds={breakingDownIds}
                error={taskErrors[task.id] ?? null}
                undo={undoStates[task.id] ?? null}
                showAdoptTip={task.id === adoptTipTaskId}
                isRecentlyAdded={task.id === recentlyAddedId}
                isExpanded={expandedTaskIds.includes(task.id)}
                actions={actions}
              />
            ))
          )}
        </div>
      </main>
    </div>
  );
}
