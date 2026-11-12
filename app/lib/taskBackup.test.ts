import { describe, expect, it } from "vitest";
import {
  BACKUP_FORMAT,
  backupFileName,
  BackupError,
  createBackup,
  MAX_IMPORT_TASKS,
  mergeImportedTasks,
  parseBackup,
  sanitizeTasks,
} from "@/app/lib/taskBackup";
import { MAX_TITLE_LENGTH, type Task } from "@/app/types/task";

// テスト用に予測できる ID を振る
const idFactory = () => {
  let n = 0;
  return () => `gen-${++n}`;
};

const sample: Task[] = [
  {
    id: "t1",
    title: "レポートを提出する",
    isDecomposing: true,
    subtasks: [
      { id: "s1", title: "テーマを決める", completed: true, source: "ai" },
      { id: "s2", title: "参考文献を3つ探す", completed: false, source: "ai", kept: true },
    ],
  },
];

describe("createBackup / parseBackup", () => {
  it("書き出したファイルを読み込むと元のタスクに戻る（実行中の状態は除く）", () => {
    const backup = createBackup(sample, new Date("2026-11-08T00:00:00Z"));
    expect(backup.format).toBe(BACKUP_FORMAT);
    expect(backup.tasks[0]).not.toHaveProperty("isDecomposing");

    const restored = parseBackup(JSON.stringify(backup));
    expect(restored).toEqual([
      {
        id: "t1",
        title: "レポートを提出する",
        subtasks: [
          { id: "s1", title: "テーマを決める", completed: true, source: "ai" },
          { id: "s2", title: "参考文献を3つ探す", completed: false, source: "ai", kept: true },
        ],
      },
    ]);
  });

  it("LocalStorage の中身（配列そのまま）も読み込める", () => {
    expect(parseBackup(JSON.stringify(sample))).toHaveLength(1);
  });

  it("JSON でないファイルはエラーにする", () => {
    expect(() => parseBackup("これはJSONではない")).toThrow(BackupError);
  });

  it("別のアプリの JSON はエラーにする", () => {
    expect(() => parseBackup(JSON.stringify({ hello: "world" }))).toThrow(BackupError);
  });

  it("新しいバージョンのファイルは読み込まない", () => {
    const future = { format: BACKUP_FORMAT, version: 999, tasks: sample };
    expect(() => parseBackup(JSON.stringify(future))).toThrow(/新しいバージョン/);
  });

  it("読み込めるタスクが1件も無ければエラーにする", () => {
    expect(() => parseBackup(JSON.stringify([{ title: "" }, 123, null]))).toThrow(BackupError);
  });
});

describe("sanitizeTasks", () => {
  it("壊れた要素を捨て、欠けている値を補う", () => {
    const result = sanitizeTasks(
      [
        null,
        "文字列",
        { title: "   " },
        {
          title: "掃除する",
          subtasks: [
            { title: "机を拭く", completed: "yes", source: "robot" },
            { completed: true },
            42,
          ],
        },
      ],
      idFactory()
    );
    expect(result).toEqual([
      {
        id: "gen-1",
        title: "掃除する",
        // completed が真偽値でなければ未完了、不明な source はユーザーの手順（消さない側）
        subtasks: [{ id: "gen-2", title: "机を拭く", completed: false, source: "user" }],
      },
    ]);
  });

  it("重複した ID は振り直す", () => {
    const result = sanitizeTasks(
      [
        { id: "dup", title: "A", subtasks: [{ id: "dup", title: "a" }] },
        { id: "dup", title: "B", subtasks: [] },
      ],
      idFactory()
    );
    const allIds = [result[0].id, result[0].subtasks[0].id, result[1].id];
    expect(new Set(allIds).size).toBe(3);
  });

  it("長すぎるタイトル・件数は上限で切り詰める", () => {
    const many = Array.from({ length: MAX_IMPORT_TASKS + 10 }, (_, i) => ({
      id: `t${i}`,
      title: "あ".repeat(MAX_TITLE_LENGTH + 50),
    }));
    const result = sanitizeTasks(many);
    expect(result).toHaveLength(MAX_IMPORT_TASKS);
    expect(result[0].title).toHaveLength(MAX_TITLE_LENGTH);
  });

  it("配列でなければ空にする", () => {
    expect(sanitizeTasks({ tasks: [] })).toEqual([]);
  });
});

describe("mergeImportedTasks", () => {
  it("新しいタスクを先頭に追加し、同じ ID のタスクはスキップする", () => {
    const current: Task[] = [{ id: "t1", title: "既存", subtasks: [] }];
    const imported: Task[] = [
      { id: "t1", title: "既存（重複）", subtasks: [] },
      { id: "t2", title: "新規", subtasks: [] },
    ];
    const result = mergeImportedTasks(current, imported);
    expect(result.tasks.map((t) => t.id)).toEqual(["t2", "t1"]);
    expect(result.addedCount).toBe(1);
    expect(result.changedCount).toBe(1);
    expect(result.updatedCount).toBe(0);
    // 既定では既存のタスクを読み込んだ内容で上書きしない
    expect(result.tasks[1].title).toBe("既存");
  });

  it("内容が同じタスクは「変更なし」として数える", () => {
    const current: Task[] = [{ id: "t1", title: "既存", subtasks: [], isDecomposing: true }];
    const result = mergeImportedTasks(current, [{ id: "t1", title: "既存", subtasks: [] }]);
    expect(result.unchangedCount).toBe(1);
    expect(result.changedCount).toBe(0);
  });

  it("置き換えを選ぶと、同じ ID のタスクを読み込んだ内容で更新する（位置はそのまま）", () => {
    const current: Task[] = [
      { id: "t0", title: "別", subtasks: [] },
      { id: "t1", title: "古い", subtasks: [{ id: "s1", title: "a", completed: false }] },
    ];
    const imported: Task[] = [
      { id: "t1", title: "新しい", subtasks: [{ id: "s1", title: "a", completed: true }] },
    ];
    const result = mergeImportedTasks(current, imported, { replaceExisting: true });
    expect(result.updatedCount).toBe(1);
    expect(result.tasks.map((t) => t.title)).toEqual(["別", "新しい"]);
    // 置き換え前の自分自身とは衝突扱いにしない（ID を保つ）
    expect(result.tasks[1].subtasks[0]).toMatchObject({ id: "s1", completed: true });
  });

  it("既存のサブタスクと ID が衝突したら振り直す", () => {
    const current: Task[] = [
      { id: "t1", title: "A", subtasks: [{ id: "s1", title: "a", completed: false }] },
    ];
    const imported: Task[] = [
      { id: "t2", title: "B", subtasks: [{ id: "s1", title: "b", completed: false }] },
    ];
    const { tasks } = mergeImportedTasks(current, imported);
    expect(tasks[0].subtasks[0].id).not.toBe("s1");
    expect(tasks[0].subtasks[0].title).toBe("b");
  });
});

describe("backupFileName", () => {
  it("日付入りのファイル名にする", () => {
    expect(backupFileName(new Date(2026, 10, 8))).toBe("task-decomposer-2026-11-08.json");
  });
});
