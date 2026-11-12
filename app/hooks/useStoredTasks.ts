"use client";

import { useEffect, useRef, useState } from "react";
import { readStorage, writeStorage } from "@/app/lib/safeStorage";
import { sanitizeTasks, stripRuntimeState } from "@/app/lib/taskBackup";
import type { Task } from "@/app/types/task";

// LocalStorage のキー
export const TASKS_KEY = "task_decomposer_tasks";
// タスクの並び順の形式（旧バージョンの古い順データを一度だけ新しい順に揃えるための目印）
const TASK_ORDER_KEY = "task_decomposer_task_order";

const parseStoredTasks = (raw: string | null): Task[] | null => {
  if (!raw) return null;
  try {
    // 壊れた要素は捨て、ID の重複などを直してから使う（isDecomposing は復元しない）
    return sanitizeTasks(JSON.parse(raw));
  } catch (e) {
    console.error("保存されたタスクを読み込めませんでした", e);
    return null;
  }
};

// タスク一覧の状態と、LocalStorage への保存・復元・他のタブとの同期
// - isLoaded: 初回の復元が終わったか（復元前に空の一覧で上書き保存しないため）
// - saveFailed: 直近の保存に失敗したか（容量オーバーなど）
export function useStoredTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  // 最後に保存した（または他のタブから受け取った）内容。同じ内容を書き戻さないために使う
  const lastSavedRef = useRef<string | null>(null);

  // 初回レンダリング後に LocalStorage から復元
  useEffect(() => {
    let restored = parseStoredTasks(readStorage(TASKS_KEY));
    if (restored) {
      // 旧バージョンは古い順（末尾に追加）で保存していたため、一度だけ新しい順に並べ替える
      // （Strict Mode で effect が2回走っても二重に反転しないよう、並べ替えた結果をすぐ保存する）
      if (readStorage(TASK_ORDER_KEY) !== "newest-first") {
        restored = [...restored].reverse();
        writeStorage(TASKS_KEY, JSON.stringify(restored));
      }
      // 静的生成された HTML とのハイドレーション不一致を避けるため、マウント後に復元する
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTasks(restored);
    }
    writeStorage(TASK_ORDER_KEY, "newest-first");
    setIsLoaded(true);
  }, []);

  // tasks 変更時に自動保存（実行中の状態は保存しない）
  useEffect(() => {
    if (!isLoaded) return;
    const serialized = JSON.stringify(stripRuntimeState(tasks));
    if (serialized === lastSavedRef.current) return;
    const ok = writeStorage(TASKS_KEY, serialized);
    if (ok) lastSavedRef.current = serialized;
    setSaveFailed(!ok);
  }, [tasks, isLoaded]);

  // 他のタブでの変更を反映する（同じアプリを複数のタブで開いても上書きし合わないように）
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key !== TASKS_KEY || e.newValue === null) return;
      const incoming = parseStoredTasks(e.newValue);
      if (!incoming) return;
      lastSavedRef.current = JSON.stringify(stripRuntimeState(incoming));
      // このタブで AI分解中のタスクは、その表示を保つ
      setTasks((prev) => {
        const decomposingIds = new Set(prev.filter((t) => t.isDecomposing).map((t) => t.id));
        return incoming.map((t) => (decomposingIds.has(t.id) ? { ...t, isDecomposing: true } : t));
      });
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  return { tasks, setTasks, isLoaded, saveFailed };
}
