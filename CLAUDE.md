@AGENTS.md

# CLAUDE.md

このファイルは、このリポジトリで作業する Claude Code 向けのガイドです。

## プロジェクト概要

**TaskDecomposer** — 大きなタスクを入力すると、Gemini API が「すぐ着手できる最小アクション」に分解してくれるタスク管理アプリ。サイバー/ネオン調（シアン系）のダークUI。

## 技術スタック

- **Next.js 16.3（App Router）** + **React 19** + **TypeScript**（strict）
  - ⚠️ 学習データと API・規約が異なる可能性あり。コードを書く前に `node_modules/next/dist/docs/` の該当ガイドを確認すること（AGENTS.md 参照）
- **Tailwind CSS v4**（`@tailwindcss/postcss`。`tailwind.config` は無く、`app/globals.css` の `@import "tailwindcss";` で読み込み）
- **Gemini API**（`gemini-3.5-flash-lite` → 失敗時 `gemini-3.1-flash-lite`。`app/lib/gemini.ts` の `GEMINI_MODELS`）— SDK は使わず、REST エンドポイントを `fetch` で直接呼び出している
  - 通常の flash 系（`gemini-3.8-flash` 等）は高負荷時に 20 秒以上かかりタイムアウトしたため、速度優先で lite 系を採用（実測 1〜2 秒）
- **Vercel** にデプロイ（Hobby プラン想定）
- ESLint 9（flat config: `eslint-config-next` の core-web-vitals + typescript）

## コマンド

```bash
npm install       # 依存関係のインストール
npm run dev       # 開発サーバー起動 (http://localhost:3000)
npm run build     # 本番ビルド
npm run start     # ビルド成果物を起動
npm run lint      # ESLint 実行
```

テストフレームワークは未導入。変更後は `npm run lint` と `npm run build` で型・ビルドエラーを確認する。

## ディレクトリ構成

```
app/
  layout.tsx              # ルートレイアウト（metadata, lang="ja"）
  page.tsx                # メイン画面（"use client"。UI・状態管理をすべてこの1ファイルに集約）
  globals.css             # Tailwind 読み込み + カスタムアニメーション（pop, cyber-shimmer, cyber-glow 等）
  types/task.ts           # Task / Subtask 型定義
  api/decompose/route.ts  # POST /api/decompose — Gemini でタスク分解
  api/verify-key/route.ts # POST /api/verify-key — 登録前に APIキーの有効性を確認
  components/ApiKeyModal.tsx # APIキー登録モーダル（3ステップの手順案内）
  components/HelpModal.tsx   # 使い方モーダル（基本の流れ3ステップ＋ボタンの意味）
  components/icons.tsx       # 操作ボタン用 SVG アイコン（編集・削除・保存）。✕ は「閉じる」専用、削除はゴミ箱
  lib/gemini.ts           # モデル名・ヘッダー名・エラーコード等の共通定数
  lib/apiKeyStorage.ts    # APIキーの LocalStorage 保存（有効期限 90 日）
```

## アーキテクチャ

### フロントエンド（`app/page.tsx`）
- 単一のクライアントコンポーネント `Home` が全状態を `useState` で管理
- データモデル: `Task { id, title, subtasks: Subtask[], isDecomposing? }` / `Subtask { id, title, completed, source? }`（型は `app/types/task.ts`）
  - `source`: `"ai"`（AI提案）/ `"user"`（ユーザーが追加・編集）。旧データの未設定は `"user"` 扱い（消さない側に倒す）
  - AI提案を内容変更して保存すると `"user"` に変わる
- 永続化は **LocalStorage**（キー: `task_decomposer_tasks`）。バックエンド DB は無い
  - `isLoaded` フラグで初回復元前の上書き保存を防いでいる
  - タスクは**新しい順**（追加時に先頭へ）。旧バージョンの古い順データは `task_decomposer_task_order` が `"newest-first"` でなければ初回読み込み時に一度だけ反転する
  - 追加直後のカードは `recentlyAddedId` で `animate-slide-in` + `animate-cyber-pulse` を付けて強調
- ID は `crypto.randomUUID()` で生成
- AIボタンは `getAiPlan` で3つの動作を切り替える（**タスク総数を勝手に増やさない**のが方針）
  - `decompose`（AI分解）: サブタスク無し → 粒度チップ（1/3/5/10）の個数で分解
  - `regenerate`（AI再提案）: 未完了のAI提案あり → **その個数のまま**作り直す（粒度チップは隠し「残りN個」と表示）
  - `append`（AI追加）: AI提案がすべて完了済み → 粒度チップの個数だけ次の手順を末尾に追加
- 再提案では**未完了で採用していないAI提案（`isReplaceableByAi`）だけを置き換える**。完了済み・ユーザーの手順・採用したAI提案は残す
  - AI提案の「AI」バッジをタップすると「📌採用」（`Subtask.kept`、永続）に切り替わる。気に入った提案だけ残して他を作り直せる
  - API には完了済み＋ユーザーの手順＋採用した提案を `existingSubtasks` として、作り直す提案を `rejectedSubtasks` として送り、同じ案が返らないようにする。新しい提案は最初に置き換えたAI提案の位置に挿入（`replaceAiSubtasks`）
  - 置き換えた内容は `undoStates`（非永続）に控え、「元に戻す」で復元できる
  - 分解中は `isDecomposing` で、置き換え予定のAI提案を薄く表示し、一覧の下にスケルトン表示
- サブタスクの ⚡ で `focusSubtask` を送り、そのサブタスクを生成結果（3個）に**差し替える**。処理中の ID は `breakingDownIds`（非永続）で管理
- 最初の未完了サブタスクに「NEXT」バッジを表示。AI失敗時は `taskErrors` でカード内にエラー表示
- 集中タイマー: NEXT に「▶ 10分だけやる」（`FOCUS_MINUTES`）。`focusTimer`（同時に1つ・非永続）で管理し、残り時間はタブのタイトルにも表示。時間切れで「完了にする / +5分 / 終了」。対象サブタスクの完了・削除・AIによる置き換えで自動停止
- サブタスクは ↑↓ ボタンで並べ替え（スマホでも操作しやすいようドラッグは使わない）
- すべて完了したタスクは自動で折りたたむ（`expandedTaskIds` で開閉、非永続）
- 使い方: ヘッダーの「?」で `HelpModal` を開く。加えて「採用」は気づきにくいため、未採用のAI提案がある最初のカードに一度だけヒントを出す（✕ か採用操作で `task_decomposer_adopt_tip_dismissed` に記録し、以後出さない）
- タスク名・サブタスク名は `MAX_TITLE_LENGTH`（200文字）まで。API 側でも切り詰め、既存サブタスクは最大 50 件まで送る

### APIキー（ユーザー持ち込み方式）
- 各ユーザーが自分の Gemini APIキーを登録して使う。サーバー側の共通キーは使わない
- キーは LocalStorage（キー: `task_decomposer_gemini_api_key`）に `{ key, expiresAt }` で保存し、登録から 90 日間有効。期限切れは `loadApiKey()` が null を返す
- AI呼び出し時に `x-gemini-api-key` ヘッダーで API Route に渡し、Route からは `x-goog-api-key` ヘッダーで Gemini に転送する（URL クエリには載せない・ログに出さない）
- `INVALID_API_KEY` が返ったらキーを破棄して登録モーダルを再表示。`RATE_LIMITED`（429）は無料枠の上限としてカード内に表示

### API（`app/api/decompose/route.ts`）
- リクエスト: `{ taskTitle: string, count?: number, existingSubtasks?: { title, completed }[], rejectedSubtasks?: string[], focusSubtask?: string }`（count 既定値 5、1〜10 に制限）
  - `focusSubtask` あり → その手順を細分化 / `existingSubtasks` あり → 完了済みの続きから、ユーザーの手順と重複しない「次に取り組む N 個」を提案（個数が少なくても1つを大きくしない） / どちらも無し → 一から分解
  - いずれも「10分以内で終わる・動詞で終わる具体的な行動」を条件としてプロンプトに含める
- 倫理に反するタスクは拒否する: `responseSchema` の `refusal`（`none` / `unethical` / `self_harm`）を AI に判定させ、拒否なら 422 + `TASK_REFUSED` / `TASK_REFUSED_SELF_HARM` を返す。Gemini の安全フィルタ（`GEMINI_BLOCK_REASONS`）でブロックされた場合も、次のモデルを試さず `TASK_REFUSED`
  - 正当な目的が考えられるもの（防犯・学習・創作など）まで断らないよう、プロンプトでは「明らかな場合のみ」拒否させている
  - 自傷・自殺に関わる場合は、カード内のエラーで相談窓口（よりそいホットライン）を案内する
- ヘッダー: `x-gemini-api-key`（必須）
- レスポンス: `{ subtasks: string[] }`、エラー時は `{ error, code? }`（400 / 401 / 422 / 429 / 500 / 504。`code` は `lib/gemini.ts` の `ERROR_CODES`）
- Gemini に `responseMimeType: "application/json"` + `responseSchema` で JSON 出力を強制。`thinkingConfig: { thinkingLevel: "low" }` で思考を抑えて高速化
  - `temperature` は指定しない（Gemini 3 系は低温度だと出力がループしやすい）
- Vercel Hobby の制限に合わせて `export const maxDuration = 15`。`GEMINI_MODELS` を順に試し、各モデルは `AbortController` で 6 秒 / 7 秒でタイムアウト。503・429・タイムアウト・空応答なら次のモデルへフォールバック（APIキー無効時は即 401）
  - モデルやタイムアウトを変える場合は合計が `maxDuration` 内に収まるよう調整すること

## 環境変数

現在、必須の環境変数は無い（Gemini APIキーは各ユーザーが画面から登録する）。

- 旧仕様の `GEMINI_API_KEY` はコードから参照されなくなった
- `.env*` は `.gitignore` 済み。**秘密情報は絶対にコミットしない・値をコードやログに出さない**

## 規約・注意点

- コメント・ログメッセージは日本語で書かれている。既存スタイルに合わせる
- スタイリングは Tailwind のユーティリティクラスが基本。独自アニメーションは `globals.css` に追加
- パスエイリアス `@/*` → プロジェクトルート
