// /api/decompose で Gemini に送るプロンプトの組み立て（Route から切り出し、単体テストで確認できるようにする）
import type { DecomposeRequest } from "@/app/lib/decomposeRequest";

// 各アクションに共通する条件
// アプリのコンセプトは「スタートアップブースター」なので、誰でもすぐ始められる最低限の一歩にする。
// 利用者ごとに環境（使っているアプリ・道具・お金・場所・人間関係など）は違うため、特定のものを前提にしない
//
// ※ 具体例（× / ○ の対比）は入れない。npm run eval:prompt で比べたところ、例の文言がそのまま
//   流用されたり、例につられて不自然なほど細かい手順が増えたりしたため（2026-11 時点）
// ※ ネットで調べる・スマホやパソコンを使う手順も、全員ができるとは限らないため出さない（ユーザーが指定した場合を除く）
export const ACTION_RULES = `条件:
- 各アクションは「今すぐ10分以内で終わる」最低限の大きさにする。迷ったら、ハードルの低い方を選ぶ
- ただし「1回だけ」「1秒だけ」のような、やっても前に進まないほど小さい行動にはしない（目安: 1つあたり数分）
- 「すべて」「全て」「全部」のように多くの作業を1つのアクションにまとめない
- 誰が読んでもそのまま実行できる、一般的な行動にする
  - 特定のアプリ・サービス・製品・ブランド・サイト名を出さない
  - 特定の道具・持ち物・お金・場所・人（先生・同僚・友人など）がある前提にしない
  - スマートフォン・パソコン・インターネットを使う前提にしない（ネットで調べる・検索する・サイトやメモアプリを使う、なども含む）。調べ物が必要なら「手元の教材や資料を読む」などにする
  - 必要な物は、特定の製品ではなく「教材」「資料」のような一般的な呼び方にする
  - 例外: ユーザーがタスク名や手順で自分から指定している道具・サービス（「ネットで確定申告する」「パソコンでプログラミングを学ぶ」など）や、機器がないと成り立たないタスクは、それを使ってよい
- どのタスクにも当てはまる準備だけの手順（「メモを用意する」「道具を手元に出す」など）は入れず、そのタスクならではの最初の一歩にする
- 動詞で終わる具体的な行動にする（例:「最初の1行を書く」「問題を1問だけ解く」）
- 考えるだけ・曖昧な表現（「検討する」「頑張る」など）は避ける
- 実行する順番に並べる`;

// 倫理チェック（タスク名だけでなく、細分化対象や既存の手順も含めて判断させる）
// 正当なタスクまで断らないよう、言葉ではなく「目的」で判断させ、明らかな場合に限って拒否する
// （軽量モデルは「ピッキング」「ハッキング」などの単語だけで拒否しがちなため、例を具体的に示す）
export const SAFETY_RULES = `安全性の判断（refusal の決め方）:
- 基本は "none"。危険そうな単語が含まれるかではなく、タスクの「目的」で判断する
- "unethical" にするのは、目的そのものが他者や社会を害することだと明らかな場合だけ
  （例:「隣の家の鍵をこじ開けて入る」「元恋人の居場所を突き止める」「他人のSNSに不正ログインする」「人を脅す文面を作る」）
- 防犯・セキュリティ対策・学習・研究・報道・創作・仕事・害虫駆除などの目的が書かれている、または普通に考えられる場合は "none"
  （例:「防犯のためにピッキングの手口を調べる」「自宅サーバーの脆弱性を診断する」「推理小説のトリックを考える」）
- 自傷・自殺そのものが目的の場合だけ "self_harm"
- "none" 以外のときは subtasks を空配列にする
- "none" で分解するときは、手口の実行方法ではなく、正当な目的を達成するための行動（公的機関の情報を読む・対策を実施する等）にする`;

const OUTPUT_FORMAT = `以下のJSON形式のみで出力してください。
{"refusal":"none","subtasks":["アクション1","アクション2"]}`;

// Gemini の generateContent に送る本文（API Route と比較用スクリプトで同じ設定を使う）
export const buildGeminiRequestBody = (prompt: string) => ({
  contents: [{ parts: [{ text: prompt }] }],
  generationConfig: {
    responseMimeType: "application/json",
    // 出力形式をスキーマで固定し、JSON の崩れを防ぐ
    responseSchema: {
      type: "OBJECT",
      properties: {
        refusal: { type: "STRING", enum: ["none", "unethical", "self_harm"] },
        subtasks: { type: "ARRAY", items: { type: "STRING" } },
      },
      required: ["refusal", "subtasks"],
      propertyOrdering: ["refusal", "subtasks"],
    },
    // 思考を最小限にして応答を速くする
    // （Gemini 3 系は temperature を下げると出力がループしやすいため既定値のままにする）
    thinkingConfig: { thinkingLevel: "low" },
  },
});

// rules は比較用に差し替えられるようにしている（通常は ACTION_RULES）
export const buildDecomposePrompt = (
  {
    taskTitle,
    count,
    existingSubtasks,
    omittedCompletedCount,
    rejectedSubtasks,
    focusSubtask,
  }: DecomposeRequest,
  rules: string = ACTION_RULES
): string => {
  // 手順が多いときは古い完了済みを省いているため、その件数だけ伝える（lib/decomposeRequest.ts）
  const existingList = [
    ...(omittedCompletedCount > 0
      ? [`- （ほかに、これより前に完了した手順が ${omittedCompletedCount} 件あります）`]
      : []),
    ...existingSubtasks.map((s) => `- ${s.completed ? "[完了] " : ""}${s.title}`),
  ].join("\n");

  // AI再提案時：ユーザーが採用しなかった案と同じ・似た案が返らないようにする
  const rejectedNote = rejectedSubtasks.length
    ? `

以下は前回提案したものの、ユーザーが採用しなかった案です。これらと同じ・言い換えただけの案は避け、別のやり方や切り口で提案してください。
${rejectedSubtasks.map((s) => `- ${s}`).join("\n")}`
    : "";

  let instruction: string;
  if (focusSubtask) {
    // 行き詰まった1ステップを細分化
    instruction = `最終目標:「${taskTitle}」
この目標に向けた手順のうち「${focusSubtask}」で手が止まっています。
この手順を、誰でも今すぐ始められる最低限のアクションに正確に【${count}個】分解してください。`;
  } else if (existingList) {
    // 今の進み具合（完了済み＋ユーザー自身の手順）を踏まえて、次に取り組む手順を提案する
    // 個数が少なくても1つあたりを大きくしないよう、「目標までの全部」ではなく「次の N 個」を求める
    instruction = `最終目標:「${taskTitle}」
現在の状況は以下の通りです。[完了] は実行済み、それ以外はユーザー自身が決めた予定の手順です。
${existingList}

実行済みの作業の続きから、次に取り組むべきアクションを、ユーザーの予定の手順と重複しないように正確に【${count}個】提案してください。
目標達成まで${count}個で収まらない場合も、1つのアクションを大きくせず、先に取り組むべきものから順に提案してください。${rejectedNote}`;
  } else {
    instruction = `タスク:「${taskTitle}」
上記に取りかかるための、誰でも今すぐ始められる最低限のアクションに正確に【${count}個】分解してください。${rejectedNote}`;
  }

  return `${instruction}

${rules}

${SAFETY_RULES}

${OUTPUT_FORMAT}`;
};
