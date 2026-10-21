"use client";

import { useState, useEffect } from "react";

// 型定義
export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
}

export interface Task {
  id: string;
  title: string;
  subtasks: Subtask[];
  isDecomposing?: boolean;
}

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newSubtaskInputs, setNewSubtaskInputs] = useState<{ [key: string]: string }>({});
  const [editingSubtask, setEditingSubtask] = useState<{ taskId: string; subtaskId: string; title: string } | null>(null);
  const [lastCheckedId, setLastCheckedId] = useState<string | null>(null);
  const [decomposeCounts, setDecomposeCounts] = useState<{ [key: string]: number }>({});
  const [isLoaded, setIsLoaded] = useState(false);

  // 初回レンダリング時に LocalStorage から復元
  useEffect(() => {
    const savedTasks = localStorage.getItem("task_decomposer_tasks");
    if (savedTasks) {
      try {
        setTasks(JSON.parse(savedTasks));
      } catch (e) {
        console.error("Failed to load tasks from LocalStorage", e);
      }
    }
    setIsLoaded(true);
  }, []);

  // tasks 変更時に LocalStorage に自動保存
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem("task_decomposer_tasks", JSON.stringify(tasks));
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
    setTasks([...tasks, newTask]);
    setNewTaskTitle("");
  };

  // タスク削除
  const deleteTask = (taskId: string) => {
    setTasks(tasks.filter((task) => task.id !== taskId));
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
          };
          return { ...task, subtasks: [...task.subtasks, newSubtask] };
        }
        return task;
      })
    );

    setNewSubtaskInputs({ ...newSubtaskInputs, [taskId]: "" });
  };

  // サブタスク完了チェック切り替え
  const toggleSubtask = (taskId: string, subtaskId: string) => {
    setLastCheckedId(subtaskId);
    setTimeout(() => setLastCheckedId(null), 300);

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
    setTasks(
      tasks.map((task) => {
        if (task.id === editingSubtask.taskId) {
          const updatedSubtasks = task.subtasks.map((sub) => {
            if (sub.id === editingSubtask.subtaskId) {
              return { ...sub, title: editingSubtask.title };
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

  // AI分解呼び出し
  const decomposeTask = async (taskId: string, title: string) => {
    const count = decomposeCounts[taskId] || 5;

    // 分解開始状態にする（スケルトン表示用）
    setTasks(
      tasks.map((t) => (t.id === taskId ? { ...t, isDecomposing: true } : t))
    );

    try {
      const res = await fetch("/api/decompose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskTitle: title, count }),
      });
      const data = await res.json();

      if (data.subtasks) {
        const generatedSubtasks: Subtask[] = data.subtasks.map(
          (subTitle: string) => ({
            id: crypto.randomUUID(),
            title: subTitle,
            completed: false,
          })
        );

        setTasks(
          tasks.map((t) => {
            if (t.id === taskId) {
              return {
                ...t,
                subtasks: generatedSubtasks,
                isDecomposing: false, // 分解完了
              };
            }
            return t;
          })
        );
      }
    } catch {
      // エラー時も分解状態を解除
      setTasks(
        tasks.map((t) => (t.id === taskId ? { ...t, isDecomposing: false } : t))
      );
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
        </div>
      </header>

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
            className="flex-1 px-4 py-3 text-slate-100 placeholder-slate-500 bg-transparent focus:outline-none text-sm font-medium tracking-wide"
          />
          <button
            onClick={addTask}
            className="bg-cyan-950 hover:bg-cyan-900 border border-cyan-400/80 text-cyan-300 font-black px-6 py-3 rounded-xl transition-all text-xs tracking-wider uppercase shrink-0 active:scale-95 shadow-[0_0_15px_rgba(6,182,212,0.3)]"
          >
            追加
          </button>
        </section>

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
              const isDecomposing = task.isDecomposing;

              return (
                <div
                  key={task.id}
                  className={`bg-[#141721] rounded-2xl p-6 shadow-xl border border-slate-800/80 transition-all ${
                    isDecomposing
                      ? "animate-cyber-scan animate-cyber-pulse border-cyan-500/60 shadow-[0_0_20px_rgba(6,182,212,0.4)]"
                      : "hover:border-cyan-500/40 cyber-glow"
                  }`}
                >
                  {/* カードヘッダー */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
                    <h3 className="text-base font-bold text-slate-100 tracking-wide leading-snug">
                      {task.title}
                    </h3>

                    {/* 分解操作エリア */}
                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                      {/* 分解粒度チップ */}
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

                      {/* 高コントラスト AI分解ボタン */}
                      <button
                        onClick={() => decomposeTask(task.id, task.title)}
                        disabled={isDecomposing}
                        className={`text-xs font-black px-4 py-2 rounded-xl transition-all shadow-md flex items-center gap-1.5 shrink-0 active:scale-95 border ${
                          isDecomposing
                            ? "animate-cyber-shimmer border-cyan-400/50 text-cyan-200 cursor-not-allowed"
                            : "bg-cyan-950 hover:bg-cyan-900/90 border-cyan-400/80 text-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.3)] hover:shadow-[0_0_20px_rgba(6,182,212,0.5)]"
                        }`}
                      >
                        <span className={`text-cyan-400 text-sm drop-shadow-[0_0_5px_rgba(6,182,212,0.8)] ${isDecomposing ? "animate-spin inline-block" : ""}`}>
                          ⚡
                        </span>
                        <span className="tracking-wider">{isDecomposing ? "PROCESSING..." : "AI分解"}</span>
                      </button>

                      <button
                        onClick={() => deleteTask(task.id)}
                        className="text-slate-500 hover:text-rose-400 p-1 rounded-lg transition-colors text-xs font-mono"
                        title="タスクを削除"
                      >
                        DEL
                      </button>
                    </div>
                  </div>

                  {/* サイバー進捗バー */}
                  {!isDecomposing && totalCount > 0 && (
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

                  {/* サブタスク表示エリア */}
                  {isDecomposing ? (
                    /* スケルトンUI（生成中骨組みアニメーション） */
                    <div className="space-y-2 mb-4">
                      {Array.from({ length: selectedCount }).map((_, idx) => (
                        <div
                          key={idx}
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
                  ) : (
                    /* サブタスク一覧（通常描画） */
                    <div className="space-y-2 mb-4">
                      {task.subtasks.map((subtask) => (
                        <div
                          key={subtask.id}
                          className={`flex items-center justify-between p-3 rounded-xl transition-all duration-200 group border ${
                            subtask.completed
                              ? "bg-[#0d0e14]/50 border-transparent"
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
                              <span
                                className={`text-sm transition-all duration-300 ${
                                  subtask.completed
                                    ? "line-through text-slate-500 font-normal whitespace-normal"
                                    : "text-slate-200 font-medium whitespace-normal"
                                }`}
                              >
                                {subtask.title}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                            {editingSubtask?.subtaskId === subtask.id ? (
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
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 手動サブタスク追加フォーム */}
                  <div className="flex gap-2 pt-3 border-t border-slate-800">
                    <input
                      type="text"
                      placeholder="サブタスクを手動追加..."
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
                </div>
              );
            })
          )}
        </div>
      </main>
    </div>
  );
}