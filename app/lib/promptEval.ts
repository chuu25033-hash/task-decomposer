// プロンプト比較用の簡易チェック（scripts/evalPrompt.ts で使う）
// 生成された手順が「特定の物を前提にしすぎ」「曖昧すぎ」ではないかを、言葉から機械的に推定する。
// あくまで目安なので、最終的には人の目で読んで判断する

// 確認用のタスク（分野をばらけさせ、プロンプトの例に出てこない分野も含める）
export const EVAL_TASKS = [
  "英語の勉強をする",
  "部屋を片付ける",
  "レポートを書く",
  "転職活動を始める",
  "運動習慣をつける",
  "引っ越しの準備をする",
  "料理を覚える",
  "プログラミングを学ぶ",
  "確定申告をする",
  "絵を描けるようになる",
];

// 比較の相手：ひとつ前のルール（ルールを変えたら、変える前の ACTION_RULES をここに移す）
// 現在は「準備だけの手順」を禁止した版（2026-11。機器の例外が広すぎ・小さすぎる手順が出た）
export const PREVIOUS_ACTION_RULES = `条件:
- 各アクションは「今すぐ10分以内で終わる」最低限の大きさにする。迷ったら、より小さく・ハードルの低い方を選ぶ
- 1つのアクションに多くの作業（「すべて集める」「全部入力する」など）をまとめない
- 誰が読んでもそのまま実行できる、一般的な行動にする
  - 特定のアプリ・サービス・製品・ブランド・サイト名を出さない
  - 特定の道具・持ち物・お金・場所・人（先生・同僚・友人など）がある前提にしない
  - スマートフォン・パソコン・インターネットも、タスクにどうしても必要な場合（オンラインでしかできない手続きなど）以外は前提にしない
  - 必要な物は、特定の製品ではなく「教材」「資料」のような一般的な呼び方にする
  - ただし、ユーザーがタスク名や手順で自分から指定している道具・サービスは使ってよい
- どのタスクにも当てはまる準備だけの手順（「メモを用意する」「道具を手元に出す」など）は入れず、そのタスクならではの最初の一歩にする
- 動詞で終わる具体的な行動にする（例:「最初の1行を書く」「問題を1問だけ解く」）
- 考えるだけ・曖昧な表現（「検討する」「頑張る」など）は避ける
- 実行する順番に並べる`;

// 特定のアプリ・サービス・機器・場所・人・お金などを前提にしている疑いのある言葉
const SPECIFIC_WORDS = [
  "アプリ", "サイト", "ツール", "ソフト", "サービス", "サブスク", "オンライン", "ウェブ",
  "スマホ", "スマートフォン", "携帯", "パソコン", "タブレット", "インターネット", "ネットで", "検索",
  "ジム", "カフェ", "図書館", "スクール", "教室",
  "先生", "上司", "同僚", "友人", "友達", "家族", "講師", "コーチ",
  "購入", "買う", "買い", "円",
];

// 考えるだけ・曖昧な表現の疑いのある言葉
const VAGUE_WORDS = ["検討", "頑張", "意識する", "心がける", "考える", "計画を立てる", "準備する", "整理する"];

// どのタスクにも当てはまる、準備だけの手順の疑いのある言葉
const FILLER_WORDS = ["メモできるもの", "メモを用意", "手元に用意", "目の前に出す", "道具を用意", "手元に出す"];

// 小さすぎ（やっても前に進まない）・大きすぎ（まとめすぎ）の疑いのある言葉
const SIZE_WORDS = ["1回だけ", "一回だけ", "1秒", "一秒", "すべて", "全て", "全部"];

export interface SubtaskCheck {
  specific: string[];
  vague: string[];
  filler: string[];
  size: string[];
}

// 1つの手順を調べ、引っかかった言葉を返す
export const checkSubtask = (title: string): SubtaskCheck => ({
  specific: [
    ...SPECIFIC_WORDS.filter((w) => title.includes(w)),
    // 英字2文字以上の単語（PC・Google・YouTube・Excel などの機器名・製品名の疑い）
    ...(title.match(/[A-Za-z][A-Za-z0-9]+/g) ?? []),
  ],
  vague: VAGUE_WORDS.filter((w) => title.includes(w)),
  filler: FILLER_WORDS.filter((w) => title.includes(w)),
  size: SIZE_WORDS.filter((w) => title.includes(w)),
});

// 手順の一覧をまとめて調べる
export const summarizeChecks = (subtasks: string[]) => {
  const checks = subtasks.map(checkSubtask);
  return {
    specificCount: checks.filter((c) => c.specific.length > 0).length,
    vagueCount: checks.filter((c) => c.vague.length > 0).length,
    fillerCount: checks.filter((c) => c.filler.length > 0).length,
    sizeCount: checks.filter((c) => c.size.length > 0).length,
    checks,
  };
};
