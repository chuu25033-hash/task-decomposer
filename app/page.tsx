"use client";

import { useState, useEffect, useCallback } from "react";
import ApiKeyModal from "@/app/components/ApiKeyModal";
import { clearApiKey, loadApiKey, type StoredApiKey } from "@/app/lib/apiKeyStorage";
import { API_KEY_HEADER, ERROR_CODES } from "@/app/lib/gemini";
import { isReplaceableByAi, MAX_TITLE_LENGTH, type Subtask, type Task } from "@/app/types/task";

// AI呼び出しの失敗（code で APIキー起因かどうかを判別する）
class AiRequestError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

// AIボタンの動作
// - decompose:  サブタスクが無い → 選択した個数で一から分解
// - regenerate: 未完了のAI提案がある → その個数のまま作り直す（総数を増やさない）
// - append:     AI提案をすべて完了済み → 選択した個数だけ次の手順を追加
type AiMode = "decompose" | "regenerate" | "append";

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

// LocalStorage のキー
const TASKS_KEY = "task_decomposer_tasks";
// タスクの並び順の形式（旧バージョンの古い順データを一度だけ新しい順に揃えるための目印）
const TASK_ORDER_KEY = "task_decomposer_task_order";

// 「とりあえずこれだけやる」集中タイマーの長さ（AIが提案する1アクションの目安と合わせる）
const FOCUS_MINUTES = 10;
const EXTEND_MINUTES = 5;
const APP_TITLE = "TaskDecomposer";

// ミリ秒を MM:SS 表記にする
const formatRemaining = (ms: number) => {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

// 1回で生成できる最大個数（API 側の上限と合わせる）
const MAX_AI_COUNT = 10;

const getAiPlan = (task: Task, selectedCount: number): { mode: AiMode; count: number } => {
  if (task.subtasks.length === 0) return { mode: "decompose", count: selectedCount };
  const replaceableCount = task.subtasks.filter(isReplaceableByAi).length;
  if (replaceableCount > 0) {
    return { mode: "regenerate", count: Math.min(replaceableCount, MAX_AI_COUNT) };
  }
  return { mode: "append", count: selectedCount };
};

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newSubtaskInputs, setNewSubtaskInputs] = useState<{ [key: string]: string }>({});
  const [editingSubtask, setEditingSubtask] = useState<{ taskId: string; subtaskId: string; title: string } | null>(null);
  const [lastCheckedId, setLastCheckedId] = useState<string | null>(null);
  const [decomposeCounts, setDecomposeCounts] = useState<{ [key: string]: number }>({});
  const [editingTask, setEditingTask] = useState<{ id: string; title: string } | null>(null);
  // AIで細分化中のサブタスクID（保存不要なのでタスクとは別に管理）
  const [breakingDownIds, setBreakingDownIds] = useState<string[]>([]);
  const [taskErrors, setTaskErrors] = useState<{ [key: string]: string | null }>({});
  // AI再提案の「元に戻す」用（置き換えたAI提案と、新たに追加したサブタスクID。保存不要）
  const [undoStates, setUndoStates] = useState<{
    [key: string]: { removed: Subtask[]; addedIds: string[] } | null;
  }>({});
  const [apiKey, setApiKey] = useState<StoredApiKey | null>(null);
  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);
  const [keyModalReason, setKeyModalReason] = useState<string | null>(null);
  const [recentlyAddedId, setRecentlyAddedId] = useState<string | null>(null);
  // 集中タイマー（同時に1つだけ。保存不要）
  const [focusTimer, setFocusTimer] = useState<{ subtaskId: string; endsAt: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // すべて完了して折りたたまれたタスクのうち、開いているもの
  const [expandedTaskIds, setExpandedTaskIds] = useState<string[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // 初回レンダリング時に LocalStorage から復元
  useEffect(() => {
    const savedTasks = localStorage.getItem(TASKS_KEY);
    if (savedTasks) {
      try {
        // 分解中にリロードされた場合に備え、isDecomposing は復元しない
        let restored: Task[] = JSON.parse(savedTasks).map((t: Task) => ({
          ...t,
          isDecomposing: false,
        }));
        // 旧バージョンは古い順（末尾に追加）で保存していたため、一度だけ新しい順に並べ替える
        // （Strict Mode で effect が2回走っても二重に反転しないよう、並べ替えた結果をすぐ保存する）
        if (localStorage.getItem(TASK_ORDER_KEY) !== "newest-first") {
          restored = [...restored].reverse();
          localStorage.setItem(TASKS_KEY, JSON.stringify(restored));
        }
        // 静的生成された HTML とのハイドレーション不一致を避けるため、マウント後に復元する
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setTasks(restored);
      } catch (e) {
        console.error("Failed to load tasks from LocalStorage", e);
      }
    }
    localStorage.setItem(TASK_ORDER_KEY, "newest-first");
    // 期限切れのキーは loadApiKey が null を返す
    setApiKey(loadApiKey());
    setIsLoaded(true);
  }, []);

  // tasks 変更時に LocalStorage に自動保存
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
    }
  }, [tasks, isLoaded]);

  // メインタスク追加
  const addTask = () => {
    if (!newTaskTitle.trim()) return;
    const newTask: Task = {
      id: crypto.randomUUID(),
      title: newTaskTitle,
      subtasks: [],
    };
    // 入力欄のすぐ下に出るよう先頭に追加する（新しい順）
    setTasks([newTask, ...tasks]);
    setNewTaskTitle("");
    // どこに追加されたか分かるよう、少しの間カードを光らせる
    setRecentlyAddedId(newTask.id);
    setTimeout(
      () => setRecentlyAddedId((id) => (id === newTask.id ? null : id)),
      1800
    );
  };

  // タスク削除（サブタスクがある場合は誤操作防止のため確認する）
  const deleteTask = (task: Task) => {
    if (task.subtasks.length > 0 && !window.confirm(`「${task.title}」を削除しますか？`)) {
      return;
    }
    setTasks(tasks.filter((t) => t.id !== task.id));
  };

  // タスク名編集保存
  const saveTaskEdit = () => {
    if (!editingTask) return;
    if (editingTask.title.trim()) {
      setTasks(
        tasks.map((task) =>
          task.id === editingTask.id ? { ...task, title: editingTask.title } : task
        )
      );
    }
    setEditingTask(null);
  };

  // 手動サブタスク追加
  const addSubtask = (taskId: string) => {
    const inputTitle = newSubtaskInputs[taskId] || "";
    if (!inputTitle.trim()) return;

    setTasks(
      tasks.map((task) => {
        if (task.id === taskId) {
          const newSubtask: Subtask = {
            id: crypto.randomUUID(),
            title: inputTitle,
            completed: false,
            source: "user",
          };
          return { ...task, subtasks: [...task.subtasks, newSubtask] };
        }
        return task;
      })
    );

    setNewSubtaskInputs({ ...newSubtaskInputs, [taskId]: "" });
  };

  // 集中タイマーのカウントダウン
  useEffect(() => {
    if (!focusTimer) return;
    const intervalId = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(intervalId);
  }, [focusTimer]);

  // 別タブを見ていても残り時間が分かるよう、タブのタイトルに表示する
  useEffect(() => {
    if (!focusTimer) {
      document.title = APP_TITLE;
      return;
    }
    const remaining = focusTimer.endsAt - now;
    document.title = remaining > 0 ? `⏱ ${formatRemaining(remaining)} - ${APP_TITLE}` : `⏰ 時間です - ${APP_TITLE}`;
  }, [focusTimer, now]);

  const startFocusTimer = (subtaskId: string, minutes: number) => {
    const startedAt = Date.now();
    setNow(startedAt);
    setFocusTimer({ subtaskId, endsAt: startedAt + minutes * 60 * 1000 });
  };

  const stopFocusTimer = () => setFocusTimer(null);

  // AIの置き換えなどで取り組んでいたサブタスクが消えた場合はタイマーを止める
  const stopFocusTimerIfRemoved = (removedIds: string[]) => {
    setFocusTimer((timer) => (timer && removedIds.includes(timer.subtaskId) ? null : timer));
  };

  // サブタスクの並べ替え（direction: -1 で上へ、1 で下へ）
  const moveSubtask = (taskId: string, subtaskId: string, direction: -1 | 1) => {
    setTasks((prev) =>
      prev.map((task) => {
        if (task.id !== taskId) return task;
        const index = task.subtasks.findIndex((s) => s.id === subtaskId);
        const target = index + direction;
        if (index === -1 || target < 0 || target >= task.subtasks.length) return task;
        const subtasks = [...task.subtasks];
        [subtasks[index], subtasks[target]] = [subtasks[target], subtasks[index]];
        return { ...task, subtasks };
      })
    );
  };

  const toggleTaskExpanded = (taskId: string) => {
    setExpandedTaskIds((prev) =>
      prev.includes(taskId) ? prev.filter((id) => id !== taskId) : [...prev, taskId]
    );
  };

  // サブタスク完了チェック切り替え
  const toggleSubtask = (taskId: string, subtaskId: string) => {
    setLastCheckedId(subtaskId);
    setTimeout(() => setLastCheckedId(null), 300);
    // 取り組んでいたサブタスクを完了したらタイマーを止める
    if (focusTimer?.subtaskId === subtaskId) stopFocusTimer();

    setTasks(
      tasks.map((task) => {
        if (task.id === taskId) {
          const updatedSubtasks = task.subtasks.map((subtask) => {
            if (subtask.id === subtaskId) {
              return { ...subtask, completed: !subtask.completed };
            }
            return subtask;
          });
          return { ...task, subtasks: updatedSubtasks };
        }
        return task;
      })
    );
  };

  // サブタスク削除
  const deleteSubtask = (taskId: string, subtaskId: string) => {
    if (focusTimer?.subtaskId === subtaskId) stopFocusTimer();
    setTasks(
      tasks.map((task) => {
        if (task.id === taskId) {
          return {
            ...task,
            subtasks: task.subtasks.filter((sub) => sub.id !== subtaskId),
          };
        }
        return task;
      })
    );
  };

  // サブタスク編集保存
  const saveSubtaskEdit = () => {
    if (!editingSubtask) return;
    if (!editingSubtask.title.trim()) {
      setEditingSubtask(null);
      return;
    }
    setTasks(
      tasks.map((task) => {
        if (task.id === editingSubtask.taskId) {
          const updatedSubtasks = task.subtasks.map((sub) => {
            if (sub.id === editingSubtask.subtaskId) {
              // 内容を変えた AI 提案はユーザーの手順として扱い、AI再提案で消さない
              const isChanged = sub.title !== editingSubtask.title;
              return {
                ...sub,
                title: editingSubtask.title,
                source: isChanged ? "user" : sub.source,
              };
            }
            return sub;
          });
          return { ...task, subtasks: updatedSubtasks };
        }
        return task;
      })
    );
    setEditingSubtask(null);
  };

  const setTaskError = (taskId: string, message: string | null) => {
    setTaskErrors((prev) => ({ ...prev, [taskId]: message }));
  };

  const openKeyModal = (reason: string | null = null) => {
    setKeyModalReason(reason);
    setIsKeyModalOpen(true);
  };

  const closeKeyModal = useCallback(() => {
    setIsKeyModalOpen(false);
    setKeyModalReason(null);
  }, []);

  const removeApiKey = () => {
    clearApiKey();
    setApiKey(null);
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
    if (code === ERROR_CODES.RATE_LIMITED) {
      setTaskError(taskId, "Gemini の無料枠の利用上限に達しました。しばらく待ってから再試行してください。");
      return;
    }
    setTaskError(taskId, fallbackMessage);
  };

  // /api/decompose を呼び出し、生成されたサブタスクを返す（失敗時は例外）
  const requestSubtasks = async (payload: {
    taskTitle: string;
    count: number;
    existingSubtasks?: { title: string; completed: boolean }[];
    focusSubtask?: string;
  }, key: string): Promise<Subtask[]> => {
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

  const setUndoState = (
    taskId: string,
    state: { removed: Subtask[]; addedIds: string[] } | null
  ) => {
    setUndoStates((prev) => ({ ...prev, [taskId]: state }));
  };

  // 未完了のAI提案を新しい提案に置き換える
  // 新しい提案は、最初に置き換えたAI提案の位置に入れる（無ければ末尾）
  const replaceAiSubtasks = (subtasks: Subtask[], generated: Subtask[]) => {
    const firstIndex = subtasks.findIndex(isReplaceableByAi);
    const kept = subtasks.filter((s) => !isReplaceableByAi(s));
    const insertAt =
      firstIndex === -1
        ? kept.length
        : subtasks.slice(0, firstIndex).filter((s) => !isReplaceableByAi(s)).length;
    return [...kept.slice(0, insertAt), ...generated, ...kept.slice(insertAt)];
  };

  // AI再提案を取り消し、置き換える前のAI提案に戻す
  const undoRegenerate = (taskId: string) => {
    const undo = undoStates[taskId];
    if (!undo) return;
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== taskId) return t;
        const firstIndex = t.subtasks.findIndex((s) => undo.addedIds.includes(s.id));
        const remaining = t.subtasks.filter((s) => !undo.addedIds.includes(s.id));
        const remainingIds = new Set(remaining.map((s) => s.id));
        // 処理中に完了にされて残ったものは二重に戻さない
        const restore = undo.removed.filter((s) => !remainingIds.has(s.id));
        const insertAt = firstIndex === -1 ? remaining.length : firstIndex;
        return {
          ...t,
          subtasks: [...remaining.slice(0, insertAt), ...restore, ...remaining.slice(insertAt)],
        };
      })
    );
    setUndoState(taskId, null);
  };

  // AI分解 / AI再提案 / AI追加（動作の切り替えは getAiPlan を参照）
  // 完了済み・ユーザーの手順は残し、未完了のAI提案だけを同じ個数の新しい提案に作り直す
  // （再提案のたびにサブタスクが増え続けるのを防ぐ）
  const decomposeTask = async (task: Task) => {
    // APIキー未登録なら先に登録してもらう
    if (!apiKey) {
      openKeyModal();
      return;
    }
    const { count } = getAiPlan(task, decomposeCounts[task.id] || 5);
    setTaskError(task.id, null);
    setUndoState(task.id, null);
    // 作り直し対象（元に戻す用に控えておく）
    const removed = task.subtasks.filter(isReplaceableByAi);

    // 分解開始状態にする（スケルトン表示用）
    // 並行して分解した他タスクの結果を上書きしないよう、常に最新の状態から更新する
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, isDecomposing: true } : t))
    );

    try {
      const generatedSubtasks = await requestSubtasks({
        taskTitle: task.title,
        count,
        // 前回のAI案は渡さない（渡すと同じ案が返りやすく、作り直す意味が薄れる）
        existingSubtasks: task.subtasks
          .filter((s) => !isReplaceableByAi(s))
          .map((s) => ({
            title: s.title,
            completed: s.completed,
          })),
      }, apiKey.key);

      // 処理中にチェック・追加された内容も反映するため、最新の状態から差し替える
      setTasks((prev) =>
        prev.map((t) =>
          t.id === task.id
            ? {
                ...t,
                subtasks: replaceAiSubtasks(t.subtasks, generatedSubtasks),
                isDecomposing: false, // 分解完了
              }
            : t
        )
      );
      if (removed.length > 0) {
        stopFocusTimerIfRemoved(removed.map((s) => s.id));
        setUndoState(task.id, {
          removed,
          addedIds: generatedSubtasks.map((s) => s.id),
        });
      }
      return;
    } catch (e) {
      handleAiError(task.id, e, "AIの提案に失敗しました。少し時間をおいて再試行してください。");
    }

    // エラー時（APIエラー・通信失敗）は分解状態を解除
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, isDecomposing: false } : t))
    );
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
      const generatedSubtasks = await requestSubtasks({
        taskTitle: task.title,
        count: 3,
        focusSubtask: subtask.title,
      }, apiKey.key);

      setTasks((prev) =>
        prev.map((t) => {
          if (t.id !== task.id) return t;
          const index = t.subtasks.findIndex((s) => s.id === subtask.id);
          // 処理中に削除された場合は何もしない
          if (index === -1) return t;
          return {
            ...t,
            subtasks: [
              ...t.subtasks.slice(0, index),
              ...generatedSubtasks,
              ...t.subtasks.slice(index + 1),
            ],
          };
        })
      );
      stopFocusTimerIfRemoved([subtask.id]);
    } catch (e) {
      handleAiError(task.id, e, "AIの細分化に失敗しました。少し時間をおいて再試行してください。");
    } finally {
      setBreakingDownIds((prev) => prev.filter((id) => id !== subtask.id));
    }
  };

  // 分解個数の選択変更
  const setTaskDecomposeCount = (taskId: string, count: number) => {
    setDecomposeCounts({ ...decomposeCounts, [taskId]: count });
  };

  return (
    <div className="min-h-screen bg-[#0f1117] text-slate-100 antialiased selection:bg-cyan-500 selection:text-black font-sans relative overflow-x-hidden">
      {/* 水色単色 ネオンオーロラ */}
      <div className="fixed top-[-80px] left-1/2 -translate-x-1/2 w-[850px] h-[350px] bg-gradient-to-tr from-cyan-500/18 via-sky-500/12 to-cyan-400/10 blur-[120px] pointer-events-none -z-10" />
      <div className="fixed bottom-0 right-0 w-[400px] h-[400px] bg-cyan-500/10 blur-[140px] pointer-events-none -z-10" />

      {/* ヘッダーエリア（スッキリ化版） */}
      <header className="bg-[#141721]/80 backdrop-blur-2xl border-b border-cyan-500/20 sticky top-0 z-20 shadow-xl shadow-black/50">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-950 border border-cyan-400/60 flex items-center justify-center text-cyan-300 font-black text-lg shadow-[0_0_15px_rgba(6,182,212,0.4)]">
              T
            </div>
            <div>
              <h1 className="text-xl font-black tracking-wider bg-gradient-to-r from-cyan-300 via-sky-200 to-cyan-400 bg-clip-text text-transparent drop-shadow-[0_0_8px_rgba(6,182,212,0.3)]">
                TaskDecomposer
              </h1>
            </div>
          </div>

          {/* APIキー登録状態 */}
          {isLoaded && (
            <button
              onClick={() => openKeyModal()}
              className={`flex items-center gap-2 text-xs font-bold px-3 py-2 rounded-xl border transition-all active:scale-95 ${
                apiKey
                  ? "border-slate-700 text-slate-300 hover:border-cyan-500/60 hover:text-cyan-200"
                  : "border-rose-500/50 text-rose-300 hover:bg-rose-950/40"
              }`}
              title="Gemini APIキーの設定"
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  apiKey ? "bg-cyan-400 shadow-[0_0_6px_rgba(6,182,212,0.9)]" : "bg-rose-400 animate-pulse"
                }`}
              />
              {apiKey ? "APIキー登録済み" : "APIキー未登録"}
            </button>
          )}
        </div>
      </header>

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

      {/* メインコンテンツ */}
      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-12">
        {/* キャッチコピー */}
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-4xl font-black text-slate-100 tracking-tight mb-3">
            思考の摩擦を、<span className="bg-gradient-to-r from-cyan-400 via-sky-300 to-cyan-200 bg-clip-text text-transparent drop-shadow-[0_0_12px_rgba(6,182,212,0.4)]">ゼロ</span>にする。
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 tracking-wide font-medium">
            AIが超高精度で最小ステップへ分解。即時出撃ブースター
          </p>
        </div>

        {/* タスク入力エリア */}
        <section className="bg-[#181b26] rounded-2xl p-2 shadow-2xl border border-cyan-500/30 mb-10 flex gap-2 items-center focus-within:border-cyan-400 focus-within:ring-2 focus-within:ring-cyan-500/20 transition-all cyber-glow">
          <input
            type="text"
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTask()}
            placeholder="大きなタスクを入力... (例: レポートを提出する)"
            maxLength={MAX_TITLE_LENGTH}
            className="flex-1 px-4 py-3 text-slate-100 placeholder-slate-500 bg-transparent focus:outline-none text-sm font-medium tracking-wide"
          />
          <button
            onClick={addTask}
            className="bg-cyan-950 hover:bg-cyan-900 border border-cyan-400/80 text-cyan-300 font-black px-6 py-3 rounded-xl transition-all text-xs tracking-wider uppercase shrink-0 active:scale-95 shadow-[0_0_15px_rgba(6,182,212,0.3)]"
          >
            追加
          </button>
        </section>

        {/* APIキー未登録の案内 */}
        {isLoaded && !apiKey && (
          <div className="-mt-6 mb-10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-cyan-950/20 border border-cyan-500/30 rounded-2xl px-4 py-3">
            <p className="text-xs text-slate-300 leading-relaxed">
              AI分解を使うには、無料の <span className="font-bold text-cyan-300">Gemini APIキー</span> の登録が必要です（1分ほど・初回のみ）。
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
            <div className="text-center py-16 bg-[#141721] rounded-2xl border border-slate-800">
              <div className="w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-slate-500 text-xs font-mono">INITIALIZING SYSTEM...</p>
            </div>
          ) : tasks.length === 0 ? (
            <div className="text-center py-16 bg-[#141721] rounded-2xl border border-dashed border-slate-800">
              <div className="w-12 h-12 rounded-2xl bg-cyan-950/50 text-cyan-400 border border-cyan-500/30 flex items-center justify-center mx-auto mb-3 text-xl shadow-[0_0_15px_rgba(6,182,212,0.2)]">
                ⚡
              </div>
              <p className="text-slate-200 font-bold text-sm mb-1">NO ACTIVE TASKS</p>
              <p className="text-slate-500 text-xs">
                ターゲットを入力してAI分解を実行してください
              </p>
            </div>
          ) : (
            tasks.map((task) => {
              const completedCount = task.subtasks.filter((s) => s.completed).length;
              const totalCount = task.subtasks.length;
              const progressPercent =
                totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
              const isAllCompleted = totalCount > 0 && completedCount === totalCount;
              const selectedCount = decomposeCounts[task.id] || 5;
              const aiPlan = getAiPlan(task, selectedCount);
              const isDecomposing = task.isDecomposing;
              // 次に取り組むべきサブタスク（最初の未完了）
              const nextSubtaskId = task.subtasks.find((s) => !s.completed)?.id;
              const taskError = taskErrors[task.id];
              const undoState = undoStates[task.id];
              // すべて完了したタスクは折りたたんで一覧をすっきりさせる（AI処理中は除く）
              const isCollapsed =
                isAllCompleted && !isDecomposing && !expandedTaskIds.includes(task.id);

              return (
                <div
                  key={task.id}
                  className={`bg-[#141721] rounded-2xl p-6 shadow-xl border border-slate-800/80 transition-all ${
                    isDecomposing
                      ? "animate-cyber-scan animate-cyber-pulse border-cyan-500/60 shadow-[0_0_20px_rgba(6,182,212,0.4)]"
                      : task.id === recentlyAddedId
                      ? "animate-slide-in animate-cyber-pulse"
                      : "hover:border-cyan-500/40 cyber-glow"
                  }`}
                >
                  {/* カードヘッダー */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
                    {editingTask?.id === task.id ? (
                      <input
                        type="text"
                        value={editingTask.title}
                        maxLength={MAX_TITLE_LENGTH}
                        onChange={(e) => setEditingTask({ ...editingTask, title: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveTaskEdit();
                          if (e.key === "Escape") setEditingTask(null);
                        }}
                        onBlur={saveTaskEdit}
                        className="flex-1 bg-[#0d0e14] border border-cyan-400/80 rounded-lg px-2.5 py-1 text-base font-bold text-white focus:outline-none"
                        autoFocus
                      />
                    ) : (
                      <h3
                        onClick={() => setEditingTask({ id: task.id, title: task.title })}
                        className="text-base font-bold text-slate-100 tracking-wide leading-snug cursor-text hover:text-cyan-200 transition-colors"
                        title="クリックしてタスク名を編集"
                      >
                        {task.title}
                      </h3>
                    )}

                    {/* 分解操作エリア */}
                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                      {aiPlan.mode === "regenerate" ? (
                        /* 再提案時は個数が自動で決まる（未完了のAI提案と同数） */
                        <div
                          className="bg-[#0d0e14] px-3 py-1.5 rounded-xl text-xs font-mono text-slate-400 border border-slate-800"
                          title="未完了のAI提案と同じ個数で作り直すため、タスクの総数は増えません"
                        >
                          残り<span className="text-cyan-300 font-black mx-0.5">{aiPlan.count}</span>個
                        </div>
                      ) : (
                        /* 分解粒度チップ */
                        <div className="flex items-center bg-[#0d0e14] p-1 rounded-xl text-xs font-medium border border-slate-800">
                          {[1, 3, 5, 10].map((num) => (
                            <button
                              key={num}
                              onClick={() => setTaskDecomposeCount(task.id, num)}
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

                      {/* 高コントラスト AI分解ボタン */}
                      <button
                        onClick={() => decomposeTask(task)}
                        disabled={isDecomposing}
                        title={AI_MODE_DESCRIPTIONS[aiPlan.mode]}
                        className={`text-xs font-black px-4 py-2 rounded-xl transition-all shadow-md flex items-center gap-1.5 shrink-0 active:scale-95 border ${
                          isDecomposing
                            ? "animate-cyber-shimmer border-cyan-400/50 text-cyan-200 cursor-not-allowed"
                            : "bg-cyan-950 hover:bg-cyan-900/90 border-cyan-400/80 text-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.3)] hover:shadow-[0_0_20px_rgba(6,182,212,0.5)]"
                        }`}
                      >
                        <span className={`text-cyan-400 text-sm drop-shadow-[0_0_5px_rgba(6,182,212,0.8)] ${isDecomposing ? "animate-spin inline-block" : ""}`}>
                          ⚡
                        </span>
                        <span className="tracking-wider">{isDecomposing ? "PROCESSING..." : AI_MODE_LABELS[aiPlan.mode]}</span>
                      </button>

                      <button
                        onClick={() => deleteTask(task)}
                        className="text-slate-500 hover:text-rose-400 p-1 rounded-lg transition-colors text-xs font-mono"
                        title="タスクを削除"
                      >
                        DEL
                      </button>
                    </div>
                  </div>

                  {/* エラー表示 */}
                  {taskError && (
                    <div className="mb-4 flex items-start justify-between gap-2 text-xs text-rose-300 bg-rose-950/30 border border-rose-500/30 rounded-xl px-3 py-2">
                      <span>{taskError}</span>
                      <button
                        onClick={() => setTaskError(task.id, null)}
                        className="text-rose-400 hover:text-rose-200 shrink-0"
                        title="閉じる"
                      >
                        ✕
                      </button>
                    </div>
                  )}

                  {/* AI再提案の取り消し */}
                  {undoState && !isDecomposing && (
                    <div className="mb-4 flex items-center justify-between gap-2 text-xs text-cyan-200 bg-cyan-950/30 border border-cyan-500/30 rounded-xl px-3 py-2">
                      <span>
                        未完了のAI提案 {undoState.removed.length}件 を作り直しました
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => undoRegenerate(task.id)}
                          className="font-bold text-cyan-300 hover:text-cyan-100 underline underline-offset-2"
                        >
                          元に戻す
                        </button>
                        <button
                          onClick={() => setUndoState(task.id, null)}
                          className="text-slate-500 hover:text-slate-300"
                          title="閉じる"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  )}

                  {/* サイバー進捗バー */}
                  {totalCount > 0 && (
                    <div className="mb-5 bg-[#0d0e14] p-3 rounded-xl border border-slate-800/80">
                      <div className="flex justify-between items-center text-xs font-mono mb-2">
                        <span className={isAllCompleted ? "text-cyan-300 font-bold" : "text-slate-400"}>
                          {isAllCompleted ? "MISSION COMPLETE" : "PROGRESS"}
                        </span>
                        <span className="text-cyan-400 font-bold">
                          {completedCount} / {totalCount} ({progressPercent}%)
                        </span>
                      </div>
                      <div className="w-full bg-[#181b26] h-2 rounded-full overflow-hidden border border-slate-800">
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
                      onClick={() => toggleTaskExpanded(task.id)}
                      className={`w-full text-xs font-mono text-slate-400 hover:text-cyan-300 transition-colors py-1 ${
                        isCollapsed ? "" : "mb-4"
                      }`}
                    >
                      {isCollapsed ? `▼ 手順を表示（${totalCount}件）` : "▲ 折りたたむ"}
                    </button>
                  )}

                  {!isCollapsed && (
                  <>

                  {/* サブタスク表示エリア（手動整理した内容は分解中も表示し続ける） */}
                  <div className="space-y-2 mb-4">
                      {task.subtasks.map((subtask, index) => {
                        const isNext = subtask.id === nextSubtaskId;
                        const isBreakingDown = breakingDownIds.includes(subtask.id);
                        const isAi = subtask.source === "ai";
                        // AI再提案中は、置き換わる予定のAI提案を薄く表示する
                        const willBeReplaced = isDecomposing && isReplaceableByAi(subtask);
                        const isEditing = editingSubtask?.subtaskId === subtask.id;
                        // 集中タイマー：NEXT から開始できる（同時に1つだけ）
                        const isTimerTarget = focusTimer?.subtaskId === subtask.id;
                        const timerRemaining = isTimerTarget ? focusTimer.endsAt - now : 0;
                        const canStartTimer =
                          isNext && !focusTimer && !isBreakingDown && !isDecomposing && !isEditing;
                        return (
                        <div
                          key={subtask.id}
                          className={`flex items-center justify-between p-3 rounded-xl transition-all duration-200 group border ${
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
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            {/* チェックボックス */}
                            <input
                              type="checkbox"
                              checked={subtask.completed}
                              onChange={() => toggleSubtask(task.id, subtask.id)}
                              className={`w-4 h-4 rounded border-slate-700 bg-[#0d0e14] text-cyan-400 focus:ring-cyan-400 cursor-pointer shrink-0 transition-all accent-cyan-400 ${
                                lastCheckedId === subtask.id ? "animate-pop" : ""
                              }`}
                            />
                            {editingSubtask?.subtaskId === subtask.id ? (
                              <input
                                type="text"
                                value={editingSubtask.title}
                                maxLength={MAX_TITLE_LENGTH}
                                onChange={(e) =>
                                  setEditingSubtask({
                                    ...editingSubtask,
                                    title: e.target.value,
                                  })
                                }
                                onKeyDown={(e) => e.key === "Enter" && saveSubtaskEdit()}
                                className="bg-[#0d0e14] border border-cyan-400/80 rounded-lg px-2.5 py-1 text-sm flex-1 text-white focus:outline-none"
                                autoFocus
                              />
                            ) : (
                              <div className="flex-1 min-w-0">
                              <span
                                className={`text-sm transition-all duration-300 ${
                                  subtask.completed
                                    ? "line-through text-slate-500 font-normal whitespace-normal"
                                    : "text-slate-200 font-medium whitespace-normal"
                                }`}
                              >
                                {isNext && !isBreakingDown && (
                                  <span className="inline-block mr-2 px-1.5 py-0.5 rounded-md bg-cyan-400 text-black text-[10px] font-black font-mono tracking-wider align-middle">
                                    NEXT
                                  </span>
                                )}
                                {isAi && (
                                  <span
                                    className="inline-block mr-2 px-1 rounded border border-cyan-500/30 text-cyan-500/70 text-[10px] font-mono align-middle"
                                    title="AIの提案（未完了なら AI再提案 で作り直されます。編集すると自分の手順として残ります）"
                                  >
                                    AI
                                  </span>
                                )}
                                {subtask.title}
                              </span>

                              {/* 集中タイマー */}
                              {canStartTimer && (
                                <button
                                  onClick={() => startFocusTimer(subtask.id, FOCUS_MINUTES)}
                                  className="mt-2 flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-lg bg-cyan-400 text-black hover:bg-cyan-300 transition-all active:scale-95"
                                  title={`まずは${FOCUS_MINUTES}分だけ、これに集中してみましょう`}
                                >
                                  ▶ {FOCUS_MINUTES}分だけやる
                                </button>
                              )}
                              {isTimerTarget && timerRemaining > 0 && (
                                <div className="mt-2 flex items-center gap-2">
                                  <span className="font-mono text-sm font-black text-cyan-300 tabular-nums drop-shadow-[0_0_6px_rgba(6,182,212,0.6)]">
                                    ⏱ {formatRemaining(timerRemaining)}
                                  </span>
                                  <button
                                    onClick={stopFocusTimer}
                                    className="text-xs font-mono text-slate-400 hover:text-rose-300 px-2 py-0.5 rounded border border-slate-700"
                                  >
                                    ■ 止める
                                  </button>
                                </div>
                              )}
                              {isTimerTarget && timerRemaining <= 0 && (
                                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                                  <span className="font-bold text-cyan-300">⏰ {FOCUS_MINUTES}分経過！</span>
                                  <button
                                    onClick={() => toggleSubtask(task.id, subtask.id)}
                                    className="font-bold px-3 py-1 rounded-lg bg-cyan-400 text-black hover:bg-cyan-300 active:scale-95"
                                  >
                                    ✓ 完了にする
                                  </button>
                                  <button
                                    onClick={() => startFocusTimer(subtask.id, EXTEND_MINUTES)}
                                    className="font-mono px-2 py-1 rounded-lg border border-cyan-500/40 text-cyan-300 hover:bg-cyan-950/50"
                                  >
                                    +{EXTEND_MINUTES}分
                                  </button>
                                  <button
                                    onClick={stopFocusTimer}
                                    className="font-mono text-slate-500 hover:text-slate-300 px-1"
                                  >
                                    終了
                                  </button>
                                </div>
                              )}
                              </div>
                            )}
                          </div>

                          {isBreakingDown ? (
                            <span className="text-[10px] font-mono text-cyan-400/70 shrink-0 ml-2 animate-pulse">
                              ANALYZING...
                            </span>
                          ) : (
                          /* スマホではホバーできないため常時表示、PCではホバー時のみ表示 */
                          <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity ml-2 shrink-0">
                            {!subtask.completed && editingSubtask?.subtaskId !== subtask.id && (
                              <button
                                onClick={() => breakDownSubtask(task, subtask)}
                                className="text-xs text-cyan-500 hover:text-cyan-300 px-2 py-1"
                                title="手が止まったら：この手順をAIが10分でできるアクションに細分化します"
                              >
                                ⚡
                              </button>
                            )}
                            {/* 並べ替え */}
                            {!isEditing && (
                              <>
                                <button
                                  onClick={() => moveSubtask(task.id, subtask.id, -1)}
                                  disabled={index === 0}
                                  className="text-xs font-mono text-slate-500 hover:text-slate-200 px-1.5 py-1 disabled:opacity-20 disabled:cursor-not-allowed"
                                  title="上へ移動"
                                >
                                  ↑
                                </button>
                                <button
                                  onClick={() => moveSubtask(task.id, subtask.id, 1)}
                                  disabled={index === task.subtasks.length - 1}
                                  className="text-xs font-mono text-slate-500 hover:text-slate-200 px-1.5 py-1 disabled:opacity-20 disabled:cursor-not-allowed"
                                  title="下へ移動"
                                >
                                  ↓
                                </button>
                              </>
                            )}
                            {isEditing ? (
                              <button
                                onClick={saveSubtaskEdit}
                                className="text-xs font-semibold text-cyan-400 hover:text-cyan-300 px-2 py-1"
                              >
                                保存
                              </button>
                            ) : (
                              <button
                                onClick={() =>
                                  setEditingSubtask({
                                    taskId: task.id,
                                    subtaskId: subtask.id,
                                    title: subtask.title,
                                  })
                                }
                                className="text-xs font-mono text-slate-500 hover:text-slate-300 px-2 py-1"
                              >
                                EDIT
                              </button>
                            )}
                            <button
                              onClick={() => deleteSubtask(task.id, subtask.id)}
                              className="text-xs font-mono text-slate-600 hover:text-cyan-400 px-2 py-1"
                            >
                              ✕
                            </button>
                          </div>
                          )}
                        </div>
                        );
                      })}

                      {/* スケルトンUI（AI生成中は既存サブタスクの下に骨組みを表示） */}
                      {isDecomposing &&
                        Array.from({ length: aiPlan.count }).map((_, idx) => (
                          <div
                            key={`skeleton-${idx}`}
                            className="flex items-center gap-3 p-3 rounded-xl bg-[#0d0e14]/80 border border-cyan-500/20 overflow-hidden relative"
                          >
                            {/* ダミーチェックボックス */}
                            <div className="w-4 h-4 rounded border border-slate-800 bg-[#141721] shrink-0" />

                            {/* 光線が流れるスケルトンバー */}
                            <div className="h-4 bg-[#181b26] rounded-md flex-1 overflow-hidden relative">
                              <div className="absolute inset-0 animate-cyber-shimmer bg-gradient-to-r from-transparent via-cyan-500/20 to-transparent" />
                            </div>

                            <span className="text-[10px] font-mono text-cyan-500/40 shrink-0">
                              ANALYZING_{idx + 1}...
                            </span>
                          </div>
                        ))}
                  </div>

                  {/* 手動サブタスク追加フォーム */}
                  <div className="flex gap-2 pt-3 border-t border-slate-800">
                    <input
                      type="text"
                      placeholder="手順を自分で追加...（詰まったら AI再提案 / ⚡）"
                      maxLength={MAX_TITLE_LENGTH}
                      value={newSubtaskInputs[task.id] || ""}
                      onChange={(e) =>
                        setNewSubtaskInputs({
                          ...newSubtaskInputs,
                          [task.id]: e.target.value,
                        })
                      }
                      onKeyDown={(e) => e.key === "Enter" && addSubtask(task.id)}
                      className="flex-1 text-xs sm:text-sm bg-[#0d0e14] border border-slate-800 rounded-xl px-3.5 py-2 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 transition-all"
                    />
                    <button
                      onClick={() => addSubtask(task.id)}
                      className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono px-4 py-2 rounded-xl transition-all shrink-0 active:scale-95"
                    >
                      + ADD
                    </button>
                  </div>
                  </>
                  )}
                </div>
              );
            })
          )}
        </div>
      </main>
    </div>
  );
}