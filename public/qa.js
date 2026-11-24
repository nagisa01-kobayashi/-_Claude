// 生徒の質問に答える（AI は使わず、ことばを手がかりに、練習方法メニューや技のポイント、先生が登録した答えから探します）
import { SKILLS } from "./skills.js";
import { methodsFor } from "./methods.js";

/** 質問らしい文かどうか */
// strict: 問いかけに答えている途中など、答えと質問を取りちがえやすいときは、はっきりした質問だけにする
export function isQuestion(text, strict = false) {
  const t = text.trim();
  if (/[?？]$/.test(t) || /(教えて|どうすれば|どうしたら|どうやったら|どんな練習|何を練習|なにを練習|ありますか|ないかな)/.test(t)) return true;
  if (strict) return false;
  return /(ない|こわい|怖い|不安)$/.test(t.replace(/[。!！…\s]+$/, ""));
}

// 手がかりにすることば（言いかえをまとめる）
const TOPICS = [
  { words: ["ひざ", "膝", "足が曲", "あしが曲"], terms: ["ひざ"] },
  { words: ["伸び", "のび", "伸ば", "のば"], terms: ["伸"] },
  { words: ["あご", "顎", "首", "頭", "おへそ", "へそ"], terms: ["あご", "首", "頭"] },
  { words: ["手", "腕", "うで", "ひじ", "肘", "押"], terms: ["手", "腕", "押", "ひじ"] },
  { words: ["背中", "丸", "まる", "ボール", "痛"], terms: ["背中", "丸"] },
  { words: ["開", "ひら", "開脚"], terms: ["開"] },
  { words: ["腰", "こし", "おしり"], terms: ["腰", "おしり"] },
  { words: ["立て", "立ち", "起き", "立つ"], terms: ["立"] },
  { words: ["回れ", "回ら", "まわれ", "勢い", "止ま", "回転"], terms: ["勢い", "回", "坂"] },
  { words: ["倒立", "逆さ", "さかさ", "足が上が", "けり上"], terms: ["倒立", "腰を肩", "けり上"] },
  { words: ["まっすぐ", "一直線", "曲が"], terms: ["一直線", "まっすぐ"] },
  { words: ["こわい", "怖", "不安"], terms: ["坂", "ゆりかご", "補助"], scared: true },
];

/**
 * 質問への答えを作る
 * @returns {{text: string, card: {title, lines, note}|null}}
 */
export function answerQuestion(text, { lesson, skill }) {
  const t = text.trim();

  // 1) 先生が登録した「よくある質問」
  for (const f of lesson.faq || []) {
    const keys = (f.keywords || []).filter(Boolean);
    if (keys.length && keys.some((k) => t.includes(k))) {
      return { text: f.answer, card: null };
    }
  }

  const topics = TOPICS.filter((tp) => tp.words.some((w) => t.includes(w)));
  const terms = [...new Set(topics.flatMap((tp) => tp.terms))];
  const targetSkill = [...SKILLS].sort((a, b) => b.name.length - a.name.length).find((s) => t.includes(s.name)) || skill;
  const forSkill = new Set(targetSkill ? methodsFor(lesson, targetSkill.id) : lesson.methods);

  // 2) 練習方法メニューから、ことばが合うものを探す（今の技に合う方法を少し優先）
  const score = (m) => {
    const hits = terms.reduce((n, w) => n + (`${m.name} ${m.how} ${m.focus || ""}`.includes(w) ? 1 : 0), 0);
    return hits ? hits * 2 + (forSkill.has(m) ? 1 : 0) : 0;
  };
  const methods = lesson.methods.map((m) => ({ m, s: score(m) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 3).map((x) => x.m);

  // 3) 技のポイントから、ことばが合うものを探す
  const points = targetSkill ? targetSkill.points.filter((p) => terms.some((w) => p.includes(w))).slice(0, 2) : [];

  if (!methods.length && !points.length) {
    return {
      text: "ごめんね、その質問にはうまく答えられなかったよ🙏\n「ひざ」「あご」「手」「回れない」など、体のどこのことか入れて聞いてみてね。先生や友だちに聞いてみるのもおすすめだよ。",
      card: null,
    };
  }
  const lines = [
    ...methods.map((m) => `【練習】${m.name}：${m.how}${m.focus ? `（意識：${m.focus}）` : ""}`),
    ...points.map((p) => `【ポイント】${p}`),
  ];
  const scared = topics.some((tp) => tp.scared);
  return {
    text: scared ? "こわいと感じるのは大事なサインだよ。無理をせず、やさしい練習から始めよう。" : "こんな練習やポイントがあるよ。どれか、ためしてみる？",
    card: { title: `💡 「${t.length > 24 ? t.slice(0, 24) + "…" : t}」へのヒント`, lines, note: "ほかにも気になることがあれば、先生や友だちにも聞いてみよう。" },
  };
}
