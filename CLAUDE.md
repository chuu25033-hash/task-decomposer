@AGENTS.md

# CLAUDE.md

このファイルは、このリポジトリで作業する Claude Code 向けのガイドです。

## プロジェクト概要

**TaskDecomposer** — 大きなタスクを入力すると、Gemini API が「すぐ着手できる最小アクション」に分解してくれるタスク管理アプリ。サイバー/ネオン調（シアン系）のダークUI。

## 技術スタック

- **Next.js 16.4（App Router）** + **React 19** + **TypeScript**（strict）
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
npm test          # Vitest（app/**/*.test.{ts,tsx}）を1回実行
npm run test:watch # Vitest をウォッチモードで実行
npm run eval:prompt # プロンプト比較（例あり/なし × 確認用タスク10件を Gemini で生成。要 GEMINI_API_KEY 環境変数。結果は eval-results/）
```

変更後は `npm test`・`npm run lint`・`npm run build` で確認する（GitHub Actions の `.github/workflows/ci.yml` でも push・PR ごとに実行される）。テストは純粋なロジック（`app/lib/*.test.ts`）・API Route（`app/api/decompose/route.test.ts`、Gemini への fetch を差し替え）は node 環境、コンポーネント・フック・画面全体（`*.test.tsx`、先頭の `// @vitest-environment jsdom` で jsdom・React Testing Library）が対象（設定は `vitest.config.mts`、`@/*` エイリアスあり）。

## ディレクトリ構成

```
app/
  layout.tsx              # ルートレイアウト（metadata, lang="ja"）。CSP の nonce のため connection() で動的レンダリング
  page.tsx                # メイン画面（"use client"。状態管理と AI 呼び出し。カードの表示は TaskCard に分割）
  globals.css             # Tailwind 読み込み + カスタムアニメーション（pop, cyber-shimmer, cyber-glow 等）
  types/task.ts           # Task / Subtask 型定義
  api/decompose/route.ts  # POST /api/decompose — Gemini でタスク分解
  api/verify-key/route.ts # POST /api/verify-key — 登録前に APIキーの有効性を確認
  components/TaskCard.tsx    # タスク1件のカード（AIボタン・進捗・取り消し・ヒント・手順の追加。タスク名の編集状態はカード内に持つ）
  components/SubtaskRow.tsx  # サブタスク1行（完了・採用・⚡・並べ替え・編集・削除。編集状態は行の中に持つ）
  components/ApiKeyModal.tsx # APIキー登録モーダル（3ステップの手順案内）
  components/HelpModal.tsx   # 使い方モーダル（基本の流れ3ステップ＋ボタンの意味）
  components/BackupModal.tsx # バックアップ（JSON ファイルへの書き出し・読み込み）
  components/icons.tsx       # 操作ボタン用 SVG アイコン（編集・削除・保存）。✕ は「閉じる」専用、削除はゴミ箱
  hooks/useStoredTasks.ts # タスクの LocalStorage 保存・復元・他タブとの同期（storage イベント）・保存失敗の検知
  hooks/useInlineEdit.ts  # その場編集（Enter/フォーカス外れで保存・Esc で取り消し・IME 変換中の Enter は無視）
  hooks/useModalFocus.ts  # モーダルのフォーカス移動・閉じ込め・Esc・閉じたら元の要素に戻す
  lib/gemini.ts           # モデル名・ヘッダー名・エラーコード等の共通定数
  lib/apiKeyStorage.ts    # APIキーの LocalStorage 保存（有効期限 90 日）
  lib/subtaskLogic.ts     # getAiPlan・AI提案の置き換え/取り消し・細分化・並べ替えの純粋関数（テストあり）
  lib/taskBackup.ts       # 保存データの検証（sanitizeTasks）とバックアップの書き出し/読み込み/マージ（テストあり）
  lib/taskUpdates.ts      # タスク・サブタスクの追加/削除/編集/完了/採用/並べ替えの純粋関数（テストあり）
  lib/safeStorage.ts      # 例外を出さない LocalStorage の読み書き
  lib/csp.ts              # CSP の組み立てと nonce の生成（テストあり）
  lib/requestGuard.ts     # API Route の同一オリジン確認と簡易レート制限（テストあり）
  lib/decomposePrompt.ts  # Gemini に送るプロンプトの組み立て（行動の条件・安全性の判断。テストあり）
  lib/promptEval.ts       # プロンプト比較用の確認タスクと、具体的すぎ/曖昧な手順の簡易判定（テストあり）
  lib/decomposeRequest.ts # /api/decompose の入力検証と Gemini 応答の解釈（テストあり）
scripts/evalPrompt.ts     # プロンプト比較スクリプト（tsx で実行。本番と同じ buildGeminiRequestBody を使う）
proxy.ts                  # ページのリクエストごとに nonce を作り CSP ヘッダーを付ける（Next 16 の Proxy。旧 middleware）
```

## アーキテクチャ

### フロントエンド（`app/page.tsx`）
- `Home` が状態を持ち、表示は `TaskCard` → `SubtaskRow` に分割。カードへの操作は `TaskCardActions` にまとめて渡す
- **状態の更新は必ず `setTasks((prev) => 純粋関数(prev, ...))`**（`lib/taskUpdates.ts` / `lib/subtaskLogic.ts`）。AI の結果などと上書きし合わないため、`tasks` を直接参照して更新しない
- タイトルは保存時に `normalizeTitle` で前後の空白を除き、`MAX_TITLE_LENGTH` で切り詰める
- データモデル: `Task { id, title, subtasks: Subtask[], isDecomposing? }` / `Subtask { id, title, completed, source? }`（型は `app/types/task.ts`）
  - `source`: `"ai"`（AI提案）/ `"user"`（ユーザーが追加・編集）。旧データの未設定は `"user"` 扱い（消さない側に倒す）
  - AI提案を内容変更して保存すると `"user"` に変わる
- 永続化は **LocalStorage**（キー: `task_decomposer_tasks`）。バックエンド DB は無い
  - `useStoredTasks` が管理。`isLoaded` フラグで初回復元前の上書き保存を防いでいる
  - 保存時は `stripRuntimeState` で `isDecomposing` を落とす。他のタブの変更は `storage` イベントで反映（このタブで分解中の表示は保つ）。同じ内容は書き戻さない
  - 保存に失敗したら（容量不足など）画面上部に警告を出し、バックアップの書き出しを促す
  - タスクは**新しい順**（追加時に先頭へ）。旧バージョンの古い順データは `task_decomposer_task_order` が `"newest-first"` でなければ初回読み込み時に一度だけ反転する
  - 追加直後のカードは `recentlyAddedId` で `animate-slide-in` + `animate-cyber-pulse` を付けて強調
- ID は `crypto.randomUUID()` で生成
- LocalStorage からの復元時は `sanitizeTasks` を通す（壊れた要素の除去・ID 重複の振り直し・文字数/件数の切り詰め・`isDecomposing` を落とす）
- バックアップ: ヘッダーのボタンで `BackupModal` を開く。書き出しは `{ format: "task-decomposer-backup", version: 1, exportedAt, tasks }`（APIキーは含めない）。読み込みは `parseBackup` で検証し、`mergeImportedTasks` で反映。既定は**追加のみ**（同じ ID のタスクは置き換えず、内容が違う件数を表示）。「同じタスクを更新する」にチェックしたときだけ、確認のうえ同じ ID のタスクを読み込んだ内容で置き換える（位置はそのまま）。衝突するサブタスク ID は振り直し
  - 状態を変えるロジックは `app/lib/` の純粋関数に置き、page.tsx からは `setTasks(prev => ...)` で呼ぶ
- AIボタンは `getAiPlan` で3つの動作を切り替える（**タスク総数を勝手に増やさない**のが方針）
  - `decompose`（AI分解）: サブタスク無し → 粒度チップ（1/3/5/10）の個数で分解
  - `regenerate`（AI再提案）: 未完了のAI提案あり → **その個数のまま**作り直す（粒度チップは隠し「残りN個」と表示）。上限 10 個を超える分は今回は作り直さずに残す（`targetIds`）
  - `append`（AI追加）: AI提案がすべて完了済み → 粒度チップの個数だけ次の手順を末尾に追加
- 再提案では**未完了で採用していないAI提案（`isReplaceableByAi`）だけを置き換える**。完了済み・ユーザーの手順・採用したAI提案は残す
  - AI提案の「AI」バッジをタップすると「📌採用」（`Subtask.kept`、永続）に切り替わる。気に入った提案だけ残して他を作り直せる
  - API には完了済み＋ユーザーの手順＋採用した提案を `existingSubtasks` として、作り直す提案を `rejectedSubtasks` として送り、同じ案が返らないようにする。新しい提案は最初に置き換えたAI提案の位置に挿入（`replaceAiSubtasks`）。置き換えるのは依頼時の `targetIds` のうち、まだ手を付けていないものだけ
  - 置き換えた内容は `undoStates`（非永続）に控え、「元に戻す」で復元できる。新しい提案のうち、その後に完了・採用・編集したものは残す
  - 分解中は `isDecomposing` で、置き換え予定のAI提案を薄く表示し、一覧の下にスケルトン表示
- サブタスクの ⚡ で `focusSubtask` を送り、そのサブタスクを生成結果（3個）に**差し替える**。処理中の ID は `breakingDownIds`（非永続）で管理
  - ⚡ と AI再提案は同じタスクで同時に動かさない（どちらかの処理中はもう一方のボタンを無効化）
- AI 呼び出しはブラウザ側でも `AI_REQUEST_TIMEOUT_MS`（20 秒）で打ち切り、`CLIENT_TIMEOUT` としてカード内に表示する（分解中のまま固まらないように）
- タスク・手順の削除は確認を出さず、画面下に「元に戻す」を表示する（`deletedItems`・非永続、最大 10 件。最後の削除から 10 秒で消える）。続けて消した場合は新しい順に1つずつ戻せる（`lib/taskUpdates.ts` の `restoreDeleted`。戻したタスクは `isDecomposing` を持たない）
- 最初の未完了サブタスクに「次」バッジを表示。AI失敗時は `taskErrors` でカード内にエラー表示
- サブタスクは ↑↓ ボタンで並べ替え（スマホでも操作しやすいようドラッグは使わない）
- すべて完了したタスクは自動で折りたたむ（`expandedTaskIds` で開閉、非永続）
- 使い方: ヘッダーの「?」で `HelpModal` を開く。加えて「採用」は気づきにくいため、未採用のAI提案がある最初のカードに一度だけヒントを出す（✕ か採用操作で `task_decomposer_adopt_tip_dismissed` に記録し、以後出さない）
- タスク名・サブタスク名は `MAX_TITLE_LENGTH`（200文字）まで。API 側でも切り詰める
- 既存サブタスクは全件（最大 200）送り、API 側の `selectExistingSubtasks` で 50 件に絞る（未完了を優先し、残りは直近の完了済み。省いた完了済みの件数はプロンプトで伝える）
- 入力内容が Gemini（無料枠では Google の製品改善に使われうる）に送られること、キーがこのアプリのサーバーを経由することを、APIキー登録モーダルと使い方に明記している
- 文字色はコントラスト確保のため、暗い背景上の本文に `text-slate-500/600` を使わない（`text-slate-400` 以上）

### APIキー（ユーザー持ち込み方式）
- 各ユーザーが自分の Gemini APIキーを登録して使う。サーバー側の共通キーは使わない
- キーは LocalStorage（キー: `task_decomposer_gemini_api_key`）に `{ key, expiresAt }` で保存し、登録から 90 日間有効。期限切れは `loadApiKey()` が null を返す
- AI呼び出し時に `x-gemini-api-key` ヘッダーで API Route に渡し、Route からは `x-goog-api-key` ヘッダーで Gemini に転送する（URL クエリには載せない・ログに出さない）
- `INVALID_API_KEY` が返ったらキーを破棄して登録モーダルを再表示。`RATE_LIMITED`（429）は無料枠の上限としてカード内に表示

### API（`app/api/decompose/route.ts`）
- 入力の検証・切り詰めは `parseDecomposeRequest`、Gemini 応答の JSON 解釈は `parseGeminiOutput`（壊れた JSON は例外にせず空扱い → 次のモデルへ）。本文が JSON でなければ 400。返す件数は `count` で切り詰める
- リクエスト: `{ taskTitle: string, count?: number, existingSubtasks?: { title, completed }[], rejectedSubtasks?: string[], focusSubtask?: string }`（count 既定値 5、1〜10 に制限）
  - `focusSubtask` あり → その手順を細分化 / `existingSubtasks` あり → 完了済みの続きから、ユーザーの手順と重複しない「次に取り組む N 個」を提案（個数が少なくても1つを大きくしない） / どちらも無し → 一から分解
  - プロンプトは `lib/decomposePrompt.ts` の `buildDecomposePrompt`（テストあり）。いずれも「10分以内で終わる最低限の一歩・動詞で終わる具体的な行動」を条件にする
  - **誰にでも当てはまる一般的な行動にする**（コンセプトは「スタートアップブースター」）。特定のアプリ・サービス・製品名や、特定の道具・お金・場所・人がある前提の手順は出させない（×「英単語アプリを開く」→ ○「覚えたい英単語を3つ選ぶ」）。ユーザーがタスク名や手順で自分から指定した道具は使ってよい
  - スマホ・パソコン・ネット（ネットで調べる・検索・サイトやメモアプリ）も前提にしない。例外はユーザーが自分で指定した場合と、機器がないと成り立たないタスク（プログラミングなど）だけ
  - 「メモを用意する」のような、どのタスクにも当てはまる準備だけの手順は出さない。「1回だけ」「1秒だけ」のような小さすぎる行動や、「すべて」「全部」をまとめた大きすぎる行動も避ける
  - **× / ○ の具体例は入れない**（比較したところ、例の文言の流用と不自然に細かい手順が増えた）
  - ルールを変えたら、変える前の `ACTION_RULES` を `lib/promptEval.ts` の `PREVIOUS_ACTION_RULES` に移し、`npm run eval:prompt` で比べる（引数でタスクを絞れる: `npm run eval:prompt -- 絵`）
- 倫理に反するタスクは拒否する: `responseSchema` の `refusal`（`none` / `unethical` / `self_harm`）を AI に判定させ、拒否なら 422 + `TASK_REFUSED` / `TASK_REFUSED_SELF_HARM` を返す。Gemini の安全フィルタ（`GEMINI_BLOCK_REASONS`）でブロックされた場合も、次のモデルを試さず `TASK_REFUSED`
  - 正当な目的が考えられるもの（防犯・学習・創作など）まで断らないよう、プロンプトでは「明らかな場合のみ」拒否させている
  - 自傷・自殺に関わる場合は、カード内のエラーで相談窓口（よりそいホットライン）を案内する
- ヘッダー: `x-gemini-api-key`（必須）
- レスポンス: `{ subtasks: string[] }`、エラー時は `{ error, code? }`（400 / 401 / 403 / 422 / 429 / 500 / 504。`code` は `lib/gemini.ts` の `ERROR_CODES`）
- 乱用対策（`lib/requestGuard.ts`、`/api/verify-key` も同様）: `Origin` が無い・別サイトなら 403 + `FORBIDDEN_ORIGIN`。呼び出し元 IP ごとに 1 分 20 回（verify-key は 10 回）を超えたら 429 + `TOO_MANY_REQUESTS`（メモリ上の目安。厳密には Vercel Firewall を使う）
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

## セキュリティヘッダー

- CSP は `proxy.ts` でリクエストごとの nonce を付ける方式（`script-src 'self' 'nonce-…' 'strict-dynamic'`。`'unsafe-inline'` は使わない。開発時のみ `'unsafe-eval'`）。Next.js が自身のスクリプトに nonce を自動で付けるため、ページは動的レンダリング（`app/layout.tsx` の `connection()`）
  - `style-src` は要素の style 属性（進捗バーの幅）のため `'unsafe-inline'` を残している
  - 外部スクリプトや外部への通信先を追加する場合は `lib/csp.ts` を更新すること（APIキーを LocalStorage に平文で置いているため XSS の影響が大きい）
- その他のヘッダー（`X-Content-Type-Options`・`Referrer-Policy`・`Permissions-Policy`）は `next.config.ts` の `headers()`
- API の回数制限（`lib/requestGuard.ts`）はサーバーレスのインスタンスごとのメモリで数える目安。厳密に制限するには Vercel ダッシュボードの Firewall で `/api/decompose`・`/api/verify-key` に Rate Limiting ルールを追加する（コードでは設定できない）

## その他

- 利用者向けの説明は `README.md`（機能・使い方・データとプライバシー・開発・デプロイ）。機能を変えたら合わせて更新する
- ヘッダーは 400px 未満でロゴを隠し、360px 未満では「APIキー未登録」を「未登録」に縮めてアプリ名が切れないようにしている

- 改行コードは `.gitattributes`（`* text=auto eol=lf`）で LF に統一
