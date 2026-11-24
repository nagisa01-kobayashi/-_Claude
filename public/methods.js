// 練習方法のメニューと、授業設定のひな形
// 先生は「授業設定」画面から、授業ごとに問いかけやメニューを変えられます。

// skills: 対象の技（空なら全部の技）
export const METHOD_LIBRARY = [
  { name: "ゆりかご", how: "体育座りからひざをかかえ、あごを引いて背中を丸め、前後にゆらゆら転がる。", focus: "あごを引いて、背中を丸くする感覚", skills: ["zenten", "kaikyaku-zenten", "kouten", "kaikyaku-kouten"] },
  { name: "ゆりかごから立ち上がり", how: "ゆりかごで前に戻る勢いを使い、かかとをおしりに引きつけて立ち上がる。", focus: "かかとをおしりに引きつけ、体重を前にのせる", skills: ["zenten", "kaikyaku-zenten"] },
  { name: "坂道マットで前転", how: "マットの下にロイター板などを入れて坂を作り、下り坂に向かって前転する。", focus: "坂の勢いを使って、回転の流れを感じる", skills: ["zenten", "kaikyaku-zenten", "shinshitsu-zenten"] },
  { name: "あごにボールをはさんで前転", how: "あごと胸の間にやわらかいボールやタオルをはさんだまま前転する。", focus: "あごを引いたまま回る", skills: ["zenten", "touritsu-zenten"] },
  { name: "開脚で立ち上がる練習", how: "長座で足を大きく開き、両手を股の近くについてマットを押しながら、上体を前に倒して立つ。", focus: "手で押すタイミングと上体を前に倒すこと", skills: ["kaikyaku-zenten", "shinshitsu-zenten", "kaikyaku-kouten"] },
  { name: "長座の前屈とつま先ピン", how: "長座でひざの裏をマットにつけたまま、つま先をのばして前屈する。", focus: "ひざを伸ばす感覚", skills: ["kaikyaku-zenten", "shinshitsu-zenten", "shinshitsu-kouten", "touritsu"] },
  { name: "手のひらゆりかご", how: "後ろに転がるとき、手のひらを上に向けて耳の横に構え、マットについたら押す。", focus: "手でマットを押すタイミング", skills: ["kouten", "kaikyaku-kouten", "shinshitsu-kouten"] },
  { name: "坂道マットで後転", how: "坂を作ったマットで、上り坂から下り坂に向かって後転する。", focus: "手で押して、足を頭の向こうに送る", skills: ["kouten", "kaikyaku-kouten", "shinshitsu-kouten"] },
  { name: "かえるの足打ち", how: "両手をついて腰を高く上げ、足をけり上げて空中で足を打つ。", focus: "腕で支えて、腰を肩の上まで上げる", skills: ["sokuhou-touritsu", "touritsu-zenten", "touritsu"] },
  { name: "壁倒立", how: "壁から手のひら1枚分はなれて手をつき、足をけり上げて壁にかかとをつける。", focus: "手首から足先まで一直線にする", skills: ["touritsu", "touritsu-zenten"] },
  { name: "ラインの上の側方倒立回転", how: "マットにテープで1本の線を引き、線の上に「手・手・足・足」の順につく。", focus: "手と足を一直線上につく", skills: ["sokuhou-touritsu"] },
  { name: "友だちに見てもらう", how: "友だちに、課題にしたところを見てもらい、気づいたことを教えてもらう。", focus: "自分では見えないところを知る", skills: [] },
  { name: "動画で自分の動きを見る", how: "1回ごとに動画を撮って、スローで見ながら確かめる。", focus: "課題にしたところが、どうなっているか", skills: [] },
];

export const TIMINGS = [
  { key: "afterTask", label: "学習課題を決めたあと" },
  { key: "afterMethod", label: "学習方法を選んだあと" },
  { key: "afterVideo", label: "動画を分析したあと（毎回）" },
  { key: "reflection", label: "振り返り" },
];

export const DEFAULT_LESSON = {
  id: "",
  date: "",
  title: "マット運動",
  classes: [],
  skills: [],
  taskPrompt: "今日の学習課題を決めよう。\nえらんだ技の、どんなところを高めたい？",
  taskOptions: [],
  methodPrompt: "どんな練習方法でためしてみる？\n下のメニューから選ぶか、自分で考えた方法を送ってね。",
  methods: METHOD_LIBRARY,
  questions: {
    afterTask: [],
    afterMethod: ["その練習で、どこを意識してみる？"],
    afterVideo: ["動画を見て、課題にしたところはどうだった？気づいたことを書こう。"],
    reflection: ["今日わかったコツを、自分の言葉で書こう。", "やってみて、体はどんな感覚だった？", "次の時間にためしてみたいことは？"],
  },
  selfCheck: true,
  // よくある質問（keywords のどれかが質問に入っていたら、answer を返す）
  faq: [],
};

/** 授業設定に足りない項目を、ひな形でうめる */
export function normalizeLesson(lesson) {
  const l = { ...DEFAULT_LESSON, ...(lesson || {}) };
  l.questions = { ...DEFAULT_LESSON.questions, ...((lesson && lesson.questions) || {}) };
  if (!Array.isArray(l.methods) || !l.methods.length) l.methods = METHOD_LIBRARY;
  return l;
}

/** その技で使える練習方法 */
export function methodsFor(lesson, skillId) {
  return lesson.methods.filter((m) => !m.skills || !m.skills.length || m.skills.includes(skillId));
}
