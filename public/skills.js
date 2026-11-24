// マット運動の技と、チェックポイント（先生の「技のチェックポイントシート」より）
// level：難しさ（☆の数・1〜5）
// points：チェックポイント（生徒へのヒントや、学習課題の候補にも使います）
// motion：動画の分析で見るところの種類
// 先生が自分の指導言葉に合わせて書きかえることができます。

export const SKILL_GROUPS = ["前転系", "後転系", "倒立系"];

export const SKILLS = [
  // ---------- 前転系 ----------
  {
    id: "zenten", name: "前転", group: "前転系", level: 1, motion: "forward-roll",
    points: ["手を肩幅で前についている", "あごを引いて首を守っている", "背中を丸めて転がっている", "スムーズに立ち上がれている"],
  },
  {
    id: "kaikyaku-zenten", name: "開脚前転", group: "前転系", level: 2, motion: "forward-roll",
    points: ["足を大きく開いている", "正しい位置に手をついている", "膝を伸ばして起き上がれている"],
  },
  {
    id: "tobi-zenten", name: "跳び前転", group: "前転系", level: 3, motion: "forward-roll",
    points: ["手を肩幅で前についている", "あごを引いて首を守っている", "背中を丸めて転がっている", "スムーズに立ち上がれている", "空中に浮く瞬間がある"],
  },
  {
    id: "touritsu-zenten", name: "倒立前転", group: "前転系", level: 4, motion: "handstand-roll",
    points: ["手を肩幅に開いている", "足をしっかり振り上げている", "体が一直線になっている", "一瞬でも静止できている"],
  },
  {
    id: "shinshitsu-zenten", name: "伸膝前転", group: "前転系", level: 5, motion: "forward-roll",
    points: ["膝を伸ばしたまま回っている", "手を肩幅に置いている", "背中を丸めてスムーズに転がっている", "美しい姿勢で立ち上がれている"],
  },
  // ---------- 後転系 ----------
  {
    id: "kouten", name: "後転", group: "後転系", level: 1, motion: "backward-roll",
    points: ["耳の横に手をついて押している", "あごを引いて首を守っている", "背中を丸めて回っている", "腕でしっかり床を押している"],
  },
  {
    id: "kaikyaku-kouten", name: "開脚後転", group: "後転系", level: 2, motion: "backward-roll",
    points: ["足を大きく開いている", "正しい位置に手をついている", "膝を伸ばして起き上がれている"],
  },
  {
    id: "shinshitsu-kouten", name: "伸膝後転", group: "後転系", level: 3, motion: "backward-roll",
    points: ["膝を伸ばしたまま回っている", "耳の横に手をついてしっかり押している", "背中を丸めて首を守っている", "膝が曲がらずに起き上がれている"],
  },
  {
    id: "kouten-touritsu", name: "後転倒立", group: "後転系", level: 5, motion: "backward-handstand",
    points: ["手を肩幅に開いている", "足をしっかり振り上げている", "体が一直線になっている", "一瞬でも静止できている"],
  },
  // ---------- 倒立系 ----------
  {
    id: "touritsu-bridge", name: "倒立ブリッジ", group: "倒立系", level: 4, motion: "bridge",
    points: ["手を肩幅に開いている", "足をしっかり振り上げている", "体が一直線になっている", "床に倒れずブリッジを保っている"],
  },
  {
    id: "sokuhou-touritsu", name: "側方倒立回転", group: "倒立系", level: 4, motion: "cartwheel",
    points: ["手を左右順番に正しくついている", "足を大きく振り上げている", "手・胴・足が直線に近い形になっている", "着地で安定して立っている"],
  },
  {
    id: "rondat", name: "ロンダート", group: "倒立系", level: 5, motion: "cartwheel",
    points: ["手を左右順番に正しくついている", "足を大きく振り上げている", "手・胴・足が直線に近い形になっている", "着地で安定して立っている", "空中で両足が揃っている"],
  },
  {
    id: "handspring", name: "前方倒立回転跳び", group: "倒立系", level: 5, motion: "handspring",
    note: "ハンドスプリング",
    points: ["両足をそろえて強く踏み切れている", "倒立の形で「手→肩→腰→足」が一直線に伸びている", "足を大きく振り上げて高い位置を通過している", "着地で足をそろえ、体を起こして安定して立てている"],
  },
];

// 学習課題の候補は、チェックポイントをそのまま使う
for (const s of SKILLS) if (!s.goalIdeas) s.goalIdeas = s.points;

/** ☆の表示（例：★★☆☆☆） */
export const stars = (level) => "★".repeat(level) + "☆".repeat(Math.max(0, 5 - level));

export const SELF_RATINGS = [
  { id: "good", label: "うまくできた" },
  { id: "soso", label: "少しできた" },
  { id: "hard", label: "むずかしかった" },
];

export function findSkill(id) {
  return SKILLS.find((s) => s.id === id) || null;
}
