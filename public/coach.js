// コーチ機能（iPad の中だけで動き、インターネットも有料サービスも使いません）
// 骨格から計算した数値を、技ごとのチェック項目と照らし合わせて、
// 「よかったところ」「もっとよくなるポイント」「次の練習」を組み立てます。
//
// 先生へ：判定の目安（しきい値）や言葉は、このファイルで書きかえられます。

// ---------- 練習メニュー ----------
const DRILLS = {
  yurikago: {
    name: "ゆりかご",
    how: "体育座りからひざをかかえ、あごを引いて背中を丸め、前後にゆらゆら転がります。10回を目安にしましょう。",
    why: "背中を丸めて、なめらかに転がる感覚が身につきます。",
  },
  yurikagoStand: {
    name: "ゆりかごから立ち上がり",
    how: "ゆりかごで前に戻ってくる勢いを使い、かかとをおしりに引きつけて、手をつかずに立ち上がります。5回を目安にしましょう。",
    why: "回り終わりから立ち上がるまでの、体重を前にのせる感覚が身につきます。",
  },
  slopeRoll: {
    name: "坂道マットで前転",
    how: "マットの下にロイター板や丸めたマットを入れて坂を作り、下り坂に向かって前転します。",
    why: "坂の勢いで回転しやすくなるので、あごを引く・背中を丸めるなどのポイントに集中できます。",
  },
  chinBall: {
    name: "あごにボールをはさんで前転",
    how: "あごと胸の間に、やわらかいボールや丸めたタオルをはさんだまま前転します。落とさなければ合格です。",
    why: "あごを引いたまま回る感覚が身につき、首を守ることにもつながります。",
  },
  pushYurikago: {
    name: "手のひらゆりかご",
    how: "ゆりかごで後ろに転がるとき、手のひらを上に向けて耳の横に構え、マットについたらぐっと押します。",
    why: "後転で、手でマットを押すタイミングと形が身につきます。首を守るためにも大切です。",
  },
  slopeBack: {
    name: "坂道マットで後転",
    how: "坂を作ったマットで、上り坂から下り坂に向かって後転します。手でマットを押すことを意識しましょう。",
    why: "坂の勢いで回りやすくなるので、手で押す・足を頭の向こうに送る感覚がつかめます。",
  },
  legSpreadStand: {
    name: "開脚で立ち上がる練習",
    how: "長座から足を大きく開き、両手を股の近くについてマットを押しながら、上体を前に倒して立ち上がります。",
    why: "開脚前転・開脚後転の立ち上がりに必要な、手で押す力と上体を前に倒す感覚が身につきます。",
  },
  kneeStretch: {
    name: "長座の前屈とつま先ピン",
    how: "長座でひざの裏をマットにつけたまま、つま先をのばして前屈します。20秒×3回を目安にしましょう。",
    why: "ひざを伸ばしたまま動くための柔らかさと、ひざを伸ばす意識が身につきます。",
  },
  kaeru: {
    name: "かえるの足打ち",
    how: "両手をついて腰を高く上げ、足をけり上げて空中で足を打ちます。2回、3回と打つ回数を増やしましょう。",
    why: "腕で体を支える力と、腰を肩の上まで上げる感覚が身につきます。",
  },
  wallHandstand: {
    name: "壁倒立",
    how: "壁から手のひら1枚分はなれて手をつき、足をけり上げて壁にかかとをつけます。10秒止まれるように挑戦しましょう。",
    why: "腕を伸ばして体を支える力と、手から足先まで一直線にする感覚が身につきます。",
  },
  lineCartwheel: {
    name: "ラインの上の側方倒立回転",
    how: "マットの上にテープなどで1本の線を引き、その線の上に「手・手・足・足」の順につくように回ります。",
    why: "手と足を一直線上について、大きく回る感覚が身につきます。",
  },
  bridgeBalance: {
    name: "補助つき倒立で静止",
    how: "友だちに足首を支えてもらって倒立し、おなかとおしりに力を入れて5秒止まります。",
    why: "体をまっすぐにした倒立の形が身につきます。",
  },
};

// 技ごとの「できたら次はこれ」
const NEXT_STEP = {
  zenten: { name: "開脚前転にチャレンジ", how: "前転がよくできています。回り終わりに足を大きく開いて立ち上がる「開脚前転」に挑戦してみましょう。", why: "前転の「背中を丸めて転がる」感覚を生かして、技を発展させられます。" },
  "kaikyaku-zenten": { name: "伸膝前転にチャレンジ", how: "足を閉じたまま、ひざを伸ばして立ち上がる「伸膝前転」に挑戦してみましょう。", why: "手で強く押す力と、上体を深く前に倒す感覚がさらに高まります。" },
  kouten: { name: "開脚後転にチャレンジ", how: "回り終わりに足を大きく開いて着地する「開脚後転」に挑戦してみましょう。", why: "手でマットを押す力を生かして、技を発展させられます。" },
  "kaikyaku-kouten": { name: "伸膝後転にチャレンジ", how: "ひざを伸ばしたまま足を閉じて着地する「伸膝後転」に挑戦してみましょう。", why: "腕でしっかり体を持ち上げる力がさらに高まります。" },
  "sokuhou-touritsu": { name: "連続の側方倒立回転", how: "2回続けて側方倒立回転をしてみましょう。リズムよく、一直線上に回れるか挑戦です。", why: "技を安定させ、組み合わせにつなげる力が高まります。" },
  touritsu: { name: "倒立前転にチャレンジ", how: "倒立から、腕を少しずつ曲げてあごを引き、前転につなげる「倒立前転」に挑戦してみましょう。（はじめは補助をつけて）", why: "倒立の安定した形を、回転技に生かせるようになります。" },
};

// ---------- チェック項目 ----------
// ok: true＝できている / false＝もう少し / null＝動画から判定できない
// priority: 大きいほど大事（けがにつながるものを大きく）
const fmt = (t) => (typeof t === "number" ? Math.round(t * 10) / 10 : -1);

const CHECKS = {
  rotate: (r) => ({
    ok: r.rotated,
    priority: 5,
    keys: ["回", "まわ", "回転"],
    good: { title: "最後まで回りきれた", detail: "止まらずに、体がしっかり回転していました。" },
    bad: {
      title: "回転の勢いをつけよう",
      detail: "体が回りきる前に、勢いが止まっているように見えます。",
      how_to: "足でマットをけって、おしりを高く上げてから回り始めましょう。",
      time_sec: fmt(r.peakT),
    },
    drill: "slopeRoll",
  }),
  chinTuck: (r) => ({
    ok: r.minNeckRoll == null ? null : r.minNeckRoll <= 150,
    priority: 9,
    keys: ["あご", "顎", "首", "頭", "へそ"],
    good: { title: "あごを引けていた", detail: "回るときにあごを引いて、頭と背中が丸くなっていました。首を守る大切なポイントです。" },
    bad: {
      title: "あごをしっかり引こう",
      detail: "回るときに、頭が背中と一直線に近く、あごが上がっているように見えます。頭のてっぺんがマットにつくと、首を痛めることがあります。",
      how_to: "おへそをのぞきこむように、あごを胸にくっつけましょう。後頭部からマットにつくのが目標です。",
      time_sec: fmt(r.neckT),
    },
    drill: "chinBall",
  }),
  roundBack: (r) => ({
    ok: r.minHipRoll == null ? null : r.minHipRoll <= 80,
    priority: 7,
    keys: ["背中", "丸", "まる", "ボール"],
    good: { title: "体を小さく丸められた", detail: "回っている途中で、ボールのように体を小さく丸められていました。" },
    bad: {
      title: "背中をもっと丸めよう",
      detail: "回っている途中で、体が伸び気味に見えます。体が伸びると、背中をドスンと打ちやすくなります。",
      how_to: "ひざを胸に近づけて、ボールのように小さく丸くなりましょう。",
      time_sec: fmt(r.tightestT),
    },
    drill: "yurikago",
  }),
  highHips: (r) => ({
    ok: r.startHipH == null ? null : r.startHipH >= 0.38,
    priority: 4,
    keys: ["腰", "こし", "おしり"],
    good: { title: "腰を高く上げてスタート", detail: "手をついたあと、腰を高く上げてから回り始められていました。" },
    bad: {
      title: "腰を高く上げてから回ろう",
      detail: "回り始めるとき、腰の位置が低めに見えます。",
      how_to: "手をついたら、足でマットをけっておしりを高く上げ、自分のおへそが見えたら回り始めましょう。",
      time_sec: fmt(r.handsDownT ?? r.rollStartT),
    },
    drill: "slopeRoll",
  }),
  stoodUp: (r) => ({
    ok: r.stoodUp,
    priority: 6,
    keys: ["立", "たち", "起き"],
    good: { title: "立ち上がりまでつなげられた", detail: "回転から立ち上がりまで、流れを止めずにつなげられていました。" },
    bad: {
      title: "立ち上がりまでつなげよう",
      detail: "回り終わってから、立ち上がるところまでつながっていないように見えます。",
      how_to: "回り終わりにかかとをおしりに引きつけて、両腕を前にのばしましょう。体重が前にのって立ちやすくなります。",
      time_sec: fmt(r.standT ?? r.endT),
    },
    drill: "yurikagoStand",
  }),
  noHands: (r) => ({
    ok: !r.stoodUp ? null : !r.handsAtRise,
    priority: 5,
    keys: ["手", "立"],
    good: { title: "手をつかずに立ち上がれた", detail: "立ち上がるときに手をつかず、足の力で立てていました。" },
    bad: {
      title: "手をつかずに立ち上がろう",
      detail: "立ち上がるときに、手がマットについているように見えます。",
      how_to: "かかとをおしりの近くに引きつけて、両手を前にのばしたまま立ちましょう。",
      time_sec: fmt(r.riseT),
    },
    drill: "yurikagoStand",
  }),
  straightKneesRoll: (r) => ({
    ok: r.medianKneeRoll == null ? null : r.medianKneeRoll >= 150,
    priority: 6,
    keys: ["ひざ", "膝", "伸", "のば", "ピン"],
    good: { title: "ひざを伸ばして回れた", detail: "回っている間、ひざがしっかり伸びていました。美しい形です。" },
    bad: {
      title: "ひざを伸ばしたまま回ろう",
      detail: "回っている途中で、ひざが曲がっているように見えます。",
      how_to: "ひざの裏をのばして、つま先までピンとさせる意識をもちましょう。",
      time_sec: fmt(r.tightestT),
    },
    drill: "kneeStretch",
  }),
  spreadLegs: (r) => ({
    ok: r.maxSpreadRise == null ? null : r.maxSpreadRise >= 55,
    priority: 5,
    keys: ["開", "ひら", "足"],
    good: { title: "足を大きく開けた", detail: "立ち上がるときに、足を大きく開けていました。" },
    bad: {
      title: "足をもっと大きく開こう",
      detail: "立ち上がるときの足の開きが小さめに見えます。（真横から撮ると、実際より小さく見えることがあります）",
      how_to: "かかとがマットにつく直前に、足を左右に大きく開きましょう。",
      time_sec: fmt(r.riseT),
    },
    drill: "legSpreadStand",
  }),
  straightKneeStand: (r) => ({
    ok: r.standKnee == null ? null : r.standKnee >= 150,
    priority: 5,
    keys: ["ひざ", "膝", "伸", "立"],
    good: { title: "ひざを伸ばして立ち上がれた", detail: "立ち上がるときも、ひざが伸びていました。" },
    bad: {
      title: "ひざを伸ばしたまま立ち上がろう",
      detail: "立ち上がるときに、ひざが曲がっているように見えます。",
      how_to: "手でマットを強く押し、上体を深く前に倒すと、ひざを伸ばしたまま立ちやすくなります。",
      time_sec: fmt(r.standT ?? r.riseT),
    },
    drill: "legSpreadStand",
  }),
  handPush: (r) => ({
    ok: r.maxElbowAfterPeak == null ? null : r.maxElbowAfterPeak >= 140,
    priority: 9,
    keys: ["手", "押", "おす", "腕", "首"],
    good: { title: "手でマットを押せた", detail: "回っている途中で、腕を伸ばしてマットを押せていました。首を守る大切なポイントです。" },
    bad: {
      title: "手でマットを強く押そう",
      detail: "逆さまになったところで、腕があまり伸びていないように見えます。首だけで回ると、首を痛めることがあります。",
      how_to: "手のひらを上に向けて耳の横に構え、マットについたら「ぐっ」と押して頭を通す道を作りましょう。",
      time_sec: fmt(r.peakT),
    },
    drill: "pushYurikago",
  }),
  feetHigh: (r) => ({
    ok: r.maxFeetH == null ? null : r.maxFeetH >= 0.85,
    priority: 6,
    keys: ["足", "高", "大きく"],
    good: { title: "足が高く上がった", detail: "足が頭より高いところを通り、大きな回転ができていました。" },
    bad: {
      title: "足をもっと高く通そう",
      detail: "足が低いところを通っているように見えます。",
      how_to: "振り上げる足を、天井に向かって大きくけり上げましょう。腰を肩の真上に乗せるイメージです。",
      time_sec: fmt(r.highestFeetT),
    },
    drill: "kaeru",
  }),
  invert: (min) => (r) => ({
    ok: r.peakTilt >= min,
    priority: 7,
    keys: ["倒立", "逆", "まっすぐ", "高"],
    good: { title: "体を逆さまに立てられた", detail: "腰が肩の上まで上がり、倒立に近い姿勢になっていました。" },
    bad: {
      title: "腰を肩の真上まで上げよう",
      detail: "体が倒立になる手前で止まっているように見えます。",
      how_to: "振り上げ足を大きくけり上げて、腰を肩の真上に乗せましょう。目線は両手の間です。",
      time_sec: fmt(r.peakT),
    },
    drill: "kaeru",
  }),
  straightArms: (r) => ({
    ok: r.peakElbow == null ? null : r.peakElbow >= 150,
    priority: 8,
    keys: ["腕", "うで", "ひじ", "肘", "支え"],
    good: { title: "腕を伸ばして支えられた", detail: "逆さまになったところで、ひじが伸びて体をしっかり支えていました。" },
    bad: {
      title: "ひじを伸ばして支えよう",
      detail: "逆さまになったところで、ひじが曲がっているように見えます。ひじが曲がると、頭から落ちやすくなります。",
      how_to: "手はパーにして指を開き、ひじをピンと伸ばして、肩で体を支えましょう。",
      time_sec: fmt(r.peakT),
    },
    drill: "kaeru",
  }),
  straightBody: (r) => ({
    ok: r.peakHip == null ? null : r.peakHip >= 150,
    priority: 6,
    keys: ["腰", "まっすぐ", "一直線", "伸"],
    good: { title: "体がまっすぐ伸びていた", detail: "逆さまになったところで、腰が伸びて体がまっすぐになっていました。" },
    bad: {
      title: "体を一直線にしよう",
      detail: "逆さまになったところで、腰が曲がって「く」の字に見えます。",
      how_to: "おなかとおしりにギュッと力を入れて、手首から足先まで一本の棒になるイメージをもちましょう。",
      time_sec: fmt(r.peakT),
    },
    drill: "wallHandstand",
  }),
  straightKneesPeak: (r) => ({
    ok: r.peakKnee == null ? null : r.peakKnee >= 150,
    priority: 4,
    keys: ["ひざ", "膝", "伸", "つま先"],
    good: { title: "ひざが伸びていた", detail: "逆さまのところで、ひざがしっかり伸びていました。" },
    bad: {
      title: "ひざを伸ばそう",
      detail: "逆さまのところで、ひざが曲がっているように見えます。",
      how_to: "つま先を天井に向けて、ピンとのばしましょう。",
      time_sec: fmt(r.peakT),
    },
    drill: "kneeStretch",
  }),
  cartSpread: (r) => ({
    ok: r.peakSpread == null ? null : r.peakSpread >= 70,
    priority: 5,
    keys: ["開", "足", "大きく"],
    good: { title: "足を大きく開いて回れた", detail: "逆さまのところで、足が大きく開いていました。" },
    bad: {
      title: "足を大きく開いて回ろう",
      detail: "逆さまのところで、足の開きが小さめに見えます。",
      how_to: "「大の字」のように、足を大きく開いたまま回りましょう。",
      time_sec: fmt(r.peakT),
    },
    drill: "lineCartwheel",
  }),
  hold: (r) => ({
    ok: r.invertedHold >= 1.0,
    priority: 5,
    keys: ["止", "静止", "秒", "バランス"],
    good: { title: `${Math.round(r.invertedHold * 10) / 10}秒ほど倒立を保てた`, detail: "逆さまの姿勢を、しばらく保つことができていました。" },
    bad: {
      title: "倒立で止まってみよう",
      detail: "倒立の姿勢がすぐにくずれているように見えます。",
      how_to: "目線を両手の間に向け、指先でマットをつかむように力を入れてバランスをとりましょう。",
      time_sec: fmt(r.peakT),
    },
    drill: "bridgeBalance",
  }),
};

// 技ごとに使うチェック（並び順は関係なし。priority で並べます）
const SKILL_CHECKS = {
  zenten: ["rotate", "chinTuck", "roundBack", "highHips", "stoodUp", "noHands"],
  "kaikyaku-zenten": ["rotate", "chinTuck", "highHips", "straightKneesRoll", "spreadLegs", "stoodUp", "straightKneeStand"],
  "shinshitsu-zenten": ["rotate", "chinTuck", "highHips", "straightKneesRoll", "stoodUp", "straightKneeStand"],
  kouten: ["rotate", "chinTuck", "roundBack", "handPush", "stoodUp"],
  "kaikyaku-kouten": ["rotate", "chinTuck", "handPush", "straightKneesRoll", "spreadLegs", "stoodUp"],
  "shinshitsu-kouten": ["rotate", "handPush", "straightKneesRoll", "straightKneeStand", "stoodUp"],
  "sokuhou-touritsu": ["feetHigh", "straightArms", "straightBody", "straightKneesPeak", "cartSpread", "stoodUp"],
  "touritsu-zenten": ["invert150", "straightArms", "straightBody", "chinTuck", "stoodUp"],
  touritsu: ["invert155", "straightArms", "straightBody", "straightKneesPeak", "hold"],
};

const ENCOURAGE = [
  "動画で自分の動きを見ることが、上達へのいちばんの近道です。次の1回も楽しんでいきましょう！",
  "できているところは自信にして、ポイントを1つだけ意識して、もう一度やってみましょう！",
  "少しずつの積み重ねが大きな成長につながります。ナイスチャレンジでした！",
  "今日の気づきを次の1回に生かしてみましょう。きっと変化を感じられますよ！",
];

function runCheck(name, raw) {
  if (name === "invert150") return { name, ...CHECKS.invert(150)(raw) };
  if (name === "invert155") return { name, ...CHECKS.invert(155)(raw) };
  return { name, ...CHECKS[name](raw) };
}

/**
 * コーチのコメントを作る
 * @param {object} skill skills.js の技
 * @param {object} metrics analyze.js の computeMetrics の結果
 * @param {{goal?: string}} opts
 */
export function makeCoaching(skill, metrics, { goal = "" } = {}) {
  const r = metrics.raw;
  const names = SKILL_CHECKS[skill.id] || SKILL_CHECKS.zenten;
  let results = names.map((n) => runCheck(n, r));

  // 回転が見つからない動画では、回転中の判定は信用できないので「判定できない」にする
  const isHandstand = skill.motion === "handstand";
  const unreliable = r.detectionRate < 0.5 || (!r.rotated && !isHandstand);
  if (unreliable) {
    results = results.map((c) => (["rotate", "stoodUp"].includes(c.name) ? c : { ...c, ok: null }));
  }

  const goods = results.filter((c) => c.ok === true).sort((a, b) => b.priority - a.priority);
  const bads = results.filter((c) => c.ok === false).sort((a, b) => b.priority - a.priority);
  const unknown = results.filter((c) => c.ok === null);

  // まとめのひとこと
  const judged = goods.length + bads.length;
  const rate = judged ? goods.length / judged : 0;
  let summary;
  if (unknown.length > judged) summary = `${skill.name}にチャレンジしました。今回の動画では読み取れないポイントが多かったので、下の撮り方のコツを見て、もう一度撮ってみましょう。`;
  else if (!judged) summary = `${skill.name}にチャレンジしました。今回の動画では動きをうまく読み取れなかったので、撮り方を工夫してもう一度ためしてみましょう。`;
  else if (rate >= 0.85) summary = `${skill.name}、とてもよくできています！ポイントの多くがしっかりできていました。`;
  else if (rate >= 0.5) summary = `${skill.name}の大事なポイントができてきています。「${bads[0]?.bad.title ?? ""}」を意識すると、もっとよくなります。`;
  else summary = `${skill.name}にしっかりチャレンジできました。まずは「${bads[0]?.bad.title ?? ""}」から、1つずつ取り組んでいきましょう。`;

  // めあてについて
  let goal_feedback = "";
  const g = goal.trim();
  if (g) {
    // めあての文の中で、いちばん前に出てくることばに対応するチェックを選ぶ（同じなら大事な方）
    let hit = null, best = Infinity;
    for (const c of results) {
      for (const k of c.keys) {
        const pos = g.indexOf(k);
        if (pos >= 0 && (pos < best || (pos === best && c.priority > hit.priority))) {
          hit = c;
          best = pos;
        }
      }
    }
    if (!hit) goal_feedback = `めあての「${g}」は、動画で自分の動きを見て、できていたか確かめてみましょう。友だちに見てもらうのもおすすめです。`;
    else if (hit.ok === true) goal_feedback = `めあての「${g}」、できていました！ ${hit.good.detail}`;
    else if (hit.ok === false) goal_feedback = `めあての「${g}」は、あと少しです。${hit.bad.how_to}`;
    else goal_feedback = `めあての「${g}」は、今回の動画からははっきり判定できませんでした。動画を見て、自分でも確かめてみましょう。`;
  }

  const good_points = goods.slice(0, 3).map((c) => c.good);
  if (!good_points.length) good_points.push({ title: "最後までチャレンジできた", detail: "動画を撮って、自分の動きをふりかえろうとする姿勢がすばらしいです。" });

  const improvements = bads.slice(0, 3).map((c) => c.bad);

  const drill = bads.length ? DRILLS[bads[0].drill] : NEXT_STEP[skill.id] || DRILLS.yurikago;

  const notes = [];
  if (r.detectionRate < 0.7) notes.push("体を見つけられない場面が多くありました。全身が映るように、少しはなれて撮ってみましょう。");
  if (!r.rotated && !isHandstand) notes.push("回転している場面をはっきり読み取れませんでした。真横から、頭から足まで映るように撮ってみましょう。");
  if (unknown.length >= 2 && !notes.length) notes.push("一部のポイントは動画から判定できませんでした。真横から撮ると、より正確になります。");

  return {
    summary,
    goal_feedback,
    good_points,
    improvements,
    drill,
    encouragement: ENCOURAGE[Math.floor(Math.random() * ENCOURAGE.length)],
    reliability_note: notes.join(" "),
    checks: results.map((c) => ({ title: c.ok === false ? c.bad.title : c.good.title, ok: c.ok })),
  };
}
