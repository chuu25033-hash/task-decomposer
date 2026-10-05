"use client";

import { useState } from "react";

// タスクの型定義
interface Task {
  id: string;
  title: string;
}

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [inputTitle, setInputTitle] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  // タスク追加
  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputTitle.trim()) return;

    const newTask: Task = {
      id: crypto.randomUUID(),
      title: inputTitle,
    };

    setTasks([...tasks, newTask]);
    setInputTitle("");
  };

  // タスク削除
  const handleDeleteTask = (id: string) => {
    setTasks(tasks.filter((task) => task.id !== id));
  };

  // 編集モード開始
  const handleStartEdit = (task: Task) => {
    setEditingId(task.id);
    setEditingTitle(task.title);
  };

  // 編集保存
  const handleSaveEdit = (id: string) => {
    if (!editingTitle.trim()) return;
    setTasks(
      tasks.map((task) =>
        task.id === id ? { ...task, title: editingTitle } : task
      )
    );
    setEditingId(null);
    setEditingTitle("");
  };

  return (
    <main className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto space-y-8">
        {/* ヘッダー */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">TaskDecomposer</h1>
          <p className="mt-2 text-sm text-gray-600">
            複雑なタスクを入力して管理しましょう（第2週：UIプロトタイプ）
          </p>
        </div>

        {/* タスク入力フォーム */}
        <form onSubmit={handleAddTask} className="flex gap-2">
          <input
            type="text"
            value={inputTitle}
            onChange={(e) => setInputTitle(e.target.value)}
            placeholder="新しいタスクを入力してください..."
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
          />
          <button
            type="submit"
            className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            追加
          </button>
        </form>

        {/* タスク一覧 */}
        <div className="space-y-3">
          {tasks.length === 0 ? (
            <p className="text-center text-gray-500 py-8">
              タスクがまだありません。上のフォームから追加してください。
            </p>
          ) : (
            tasks.map((task) => (
              <div
                key={task.id}
                className="flex items-center justify-between p-4 bg-white rounded-lg border border-gray-200 shadow-sm"
              >
                {editingId === task.id ? (
                  /* 編集モード */
                  <div className="flex flex-1 gap-2 mr-2">
                    <input
                      type="text"
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      className="flex-1 px-3 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                    />
                    <button
                      onClick={() => handleSaveEdit(task.id)}
                      className="px-3 py-1 bg-green-600 text-white text-sm font-medium rounded hover:bg-green-700"
                    >
                      保存
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="px-3 py-1 bg-gray-300 text-gray-700 text-sm font-medium rounded hover:bg-gray-400"
                    >
                      キャンセル
                    </button>
                  </div>
                ) : (
                  /* 通常表示モード */
                  <>
                    <span className="text-gray-800 font-medium">{task.title}</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleStartEdit(task)}
                        className="px-3 py-1 bg-gray-100 text-gray-600 text-sm font-medium rounded hover:bg-gray-200"
                      >
                        編集
                      </button>
                      <button
                        onClick={() => handleDeleteTask(task.id)}
                        className="px-3 py-1 bg-red-100 text-red-600 text-sm font-medium rounded hover:bg-red-200"
                      >
                        削除
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </main>
  );
}