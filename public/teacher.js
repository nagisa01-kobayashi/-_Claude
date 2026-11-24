import { SKILLS, stars } from "./skills.js";
import { DEFAULT_LESSON, METHOD_LIBRARY, TIMINGS, normalizeLesson } from "./methods.js";
import { callApi } from "./api.js";
import { esc, mk, Room, dateLabel, summaryBubble } from "./chat.js";

// ============================================================
// 先生用の画面
// ============================================================
const $t = (id) => document.getElementById(id);

export const Teacher = {
  app: null, // app.js から渡される（画面の切りかえなど）
  data: null, // overview の結果

  async loadOverview() {
    this.data = await callApi("overview");
    return this.data;
  },

  /** 左側：クラス → 生徒 → トーク一覧 */
  renderTalkTree(box) {
    const { students, rooms, classes } = this.data;
    const clsList = [...new Set([...classes, ...students.map((s) => s.class)])].filter(Boolean);
    box.innerHTML = "";
    if (!students.length) {
      box.appendChild(mk("div", "side-empty", "まだ登録した生徒がいません。生徒がアプリを開いて登録すると、ここに表示されます。"));
      return;
    }
    for (const cls of clsList) {
      const list = students.filter((s) => s.class === cls).sort((a, b) => Number(a.number) - Number(b.number));
      if (!list.length) continue;
      const grp = mk("details", "tree-class");
      grp.open = clsList.length <= 2;
      grp.appendChild(mk("summary", "", `🏫 ${esc(cls)}<span class="count">${list.length}人</span>`));
      for (const s of list) {
        const st = mk("details", "tree-student");
        const dates = rooms.filter((r) => r.email === s.email).map((r) => r.date).sort().reverse();
        st.appendChild(mk("summary", "", `${esc(s.number)}　${esc(s.name)}<span class="count">${dates.length}</span>`));
        if (!dates.length) st.appendChild(mk("div", "side-empty small", "トークはまだありません"));
        for (const d of dates) {
          const b = mk("button", "side-item", `💬 ${esc(dateLabel(d))}`);
          b.onclick = () => {
            document.querySelectorAll(".side-item.on").forEach((x) => x.classList.remove("on"));
            b.classList.add("on");
            this.openStudentRoom(s, d);
          };
          st.appendChild(b);
        }
        grp.appendChild(st);
      }
      box.appendChild(grp);
    }
  },

  async openStudentRoom(s, date) {
    this.app.showChat(`${s.class} ${s.number}番 ${s.name}`, `${dateLabel(date)}のトーク（見るだけ）`);
    const room = await callApi("teacherRoom", s.email, date);
    Room.open({ date, messages: room.messages, readOnly: true, onModel: this.app.openModel });
    this.app.closeSidebarOnMobile();
  },

  // ---------------- まとめ・評価 ----------------
  async showSummaries() {
    const page = this.app.showPage("📝 学びのまとめ・評価", "生徒の振り返りを見て、観点ごとに評価を入力できます");
    const clsList = [...new Set([...(this.data?.classes || []), ...(this.data?.students || []).map((s) => s.class)])].filter(Boolean);
    const today = this.app.today;
    page.innerHTML = `
      <div class="filters">
        <label>クラス <select id="sumClass"><option value="">すべて</option>${clsList.map((c) => `<option>${esc(c)}</option>`).join("")}</select></label>
        <label>期間 <input type="date" id="sumFrom" value="${today}" /> 〜 <input type="date" id="sumTo" value="${today}" /></label>
        <button id="sumLoad" class="btn">表示する</button>
        <button id="sumPdf" class="btn primary">📄 PDFにする</button>
      </div>
      <div id="pdfResult" class="note"></div>
      <div class="hint-box">評価の観点のめやす：<b>思考・判断・表現</b>…課題の設定や方法の選び方、動画を見ての気づき、コツや感覚の言語化。<b>主体的に学習に取り組む態度</b>…ためした回数、方法の工夫、次への見通し。</div>
      <div id="sumList"></div>`;
    const load = async () => {
      $t("sumList").innerHTML = `<div class="note">読みこみ中…</div>`;
      const list = await callApi("summaries", $t("sumClass").value, $t("sumFrom").value, $t("sumTo").value);
      this.renderSummaryList(list);
    };
    $t("sumLoad").onclick = load;
    $t("sumPdf").onclick = async () => {
      const r = $t("pdfResult");
      r.textContent = "PDFを作っています…（少し時間がかかります）";
      try {
        const res = await callApi("makePdf", $t("sumClass").value, $t("sumFrom").value, $t("sumTo").value);
        r.innerHTML = `✅ 「${esc(res.name)}」を作りました。<a href="${esc(res.url)}" target="_blank" rel="noopener">PDFを開く</a>（ドライブの「評価資料（PDF）」フォルダにも保存されています）`;
      } catch (e) {
        r.textContent = `PDFを作れませんでした：${e.message}`;
      }
    };
    load();
  },

  renderSummaryList(list) {
    const box = $t("sumList");
    if (!list.length) {
      box.innerHTML = `<div class="note">この条件のまとめはまだありません。（生徒が振り返りまで終えると、ここに表示されます）</div>`;
      return;
    }
    box.innerHTML = "";
    for (const r of list) {
      const s = r.summary || {};
      const ind = s.indicators || {};
      const card = mk("div", "sum-card");
      card.innerHTML = `
        <div class="sum-head"><b>${esc(r.class)} ${esc(r.number)}番 ${esc(r.name)}</b><span>${esc(dateLabel(r.date))}　${esc(s.skill || "")}</span></div>
        <div class="sum-task">課題：${esc(s.task || "—")}</div>
        <div class="sum-ind">ためした回数 ${esc(ind.trials || 0)}回／方法 ${esc(ind.methodsTried || 0)}種類／振り返り ${esc(ind.reflectionChars || 0)}字${s.selfCheck ? `／自己評価 ${esc(s.selfCheck)}` : ""}</div>
        <details><summary>まとめをくわしく見る</summary></details>
        <div class="eval-row">
          <label>思考・判断・表現 <select data-k="thinking">${["", "A", "B", "C"].map((v) => `<option ${v === r.thinking ? "selected" : ""}>${v}</option>`).join("")}</select></label>
          <label>主体的に学習に取り組む態度 <select data-k="attitude">${["", "A", "B", "C"].map((v) => `<option ${v === r.attitude ? "selected" : ""}>${v}</option>`).join("")}</select></label>
          <input type="text" data-k="memo" placeholder="メモ（所見など）" value="${esc(r.memo)}" />
          <span class="saved"></span>
        </div>`;
      const det = card.querySelector("details");
      det.addEventListener("toggle", () => {
        if (det.open && !det.querySelector(".summary")) det.appendChild(summaryBubble(s));
      }, { once: false });
      let timer = null;
      const save = () => {
        clearTimeout(timer);
        timer = setTimeout(async () => {
          const v = (k) => card.querySelector(`[data-k=${k}]`).value;
          const mark = card.querySelector(".saved");
          try {
            await callApi("saveEvaluation", r.email, r.date, v("thinking"), v("attitude"), v("memo"));
            mark.textContent = "保存しました";
          } catch (e) {
            mark.textContent = "保存できませんでした";
          }
          setTimeout(() => (mark.textContent = ""), 2000);
        }, 500);
      };
      card.querySelectorAll("select, input").forEach((x) => x.addEventListener("change", save));
      card.querySelector("input[data-k=memo]").addEventListener("input", save);
      box.appendChild(card);
    }
  },

  // ---------------- 授業設定 ----------------
  async showLessons() {
    const page = this.app.showPage("🗓 授業設定", "その日のコーチの問いかけや、練習方法のメニューを決めます");
    page.innerHTML = `<div class="note">読みこみ中…</div>`;
    const lessons = await callApi("lessons");
    page.innerHTML = `<div class="filters"><button id="newLesson" class="btn primary">＋ 新しい授業を作る</button></div>
      <div class="hint-box">授業の日付の日に、対象のクラスの生徒のコーチがこの設定で動きます。設定がない日は、ひな形の流れで動きます。</div>
      <div id="lessonList"></div>`;
    const list = $t("lessonList");
    if (!lessons.length) list.innerHTML = `<div class="note">まだ授業設定がありません。</div>`;
    for (const l of lessons) {
      const row = mk("div", "lesson-row", `<div><b>${esc(dateLabel(l.date) || "日付なし")}</b>　${esc(l.title)}<div class="small">${esc((l.classes || []).join("・") || "全クラス")}</div></div>`);
      const btns = mk("div", "row-btns");
      const edit = mk("button", "btn", "編集");
      edit.onclick = () => this.editLesson(l);
      const copy = mk("button", "btn", "コピー");
      copy.onclick = () => this.editLesson({ ...l, id: "", date: this.app.today, title: `${l.title}（コピー）` });
      const del = mk("button", "btn danger", "削除");
      del.onclick = async () => {
        if (!confirm(`「${l.title}」を削除しますか？`)) return;
        await callApi("deleteLesson", l.id);
        this.showLessons();
      };
      btns.append(edit, copy, del);
      row.appendChild(btns);
      list.appendChild(row);
    }
    $t("newLesson").onclick = () => this.editLesson({ ...DEFAULT_LESSON, date: this.app.today, title: "" });
  },

  editLesson(input) {
    const l = normalizeLesson(input);
    const page = this.app.showPage(l.id ? "🗓 授業設定の編集" : "🗓 新しい授業", "保存すると、その日の生徒のコーチに反映されます");
    const classes = [...new Set([...(this.data?.classes || []), ...(this.data?.students || []).map((s) => s.class)])].filter(Boolean);
    const lines = (arr) => esc((arr || []).join("\n"));
    page.innerHTML = `
      <div class="form">
        <label class="f">日付<input type="date" id="lDate" value="${esc(l.date)}" /></label>
        <label class="f">授業のタイトル<input type="text" id="lTitle" value="${esc(l.title)}" placeholder="例：前転グループの技を高めよう" /></label>
        <div class="f">対象のクラス（えらばないと全クラス）<div class="checks">${classes.map((c) => `<label><input type="checkbox" name="lCls" value="${esc(c)}" ${l.classes.includes(c) ? "checked" : ""}/> ${esc(c)}</label>`).join("") || `<span class="small">「設定」でクラスを登録できます</span>`}</div></div>
        <div class="f">対象の技（えらばないと全部の技）<div class="checks">${SKILLS.map((s) => `<label><input type="checkbox" name="lSkill" value="${s.id}" ${l.skills.includes(s.id) ? "checked" : ""}/> ${esc(s.name)} <span class="stars">${"☆".repeat(s.level)}</span></label>`).join("")}</div></div>

        <h3>① 学習課題を決める</h3>
        <label class="f">コーチの問いかけ<textarea id="lTaskPrompt" rows="2">${esc(l.taskPrompt)}</textarea></label>
        <label class="f">課題の候補（1行に1つ。空なら技ごとの例を出します）<textarea id="lTaskOptions" rows="3">${lines(l.taskOptions)}</textarea></label>

        <h3>② 学習方法を選ぶ</h3>
        <label class="f">コーチの問いかけ<textarea id="lMethodPrompt" rows="2">${esc(l.methodPrompt)}</textarea></label>
        <div class="f">練習方法のメニュー<div id="methodRows"></div><button id="addMethod" class="btn">＋ 方法を追加</button> <button id="resetMethods" class="btn">ひな形に戻す</button></div>

        <h3>③ コーチの問いかけ（タイミングごと。1行に1つ）</h3>
        ${TIMINGS.map((t) => `<label class="f">${esc(t.label)}<textarea id="q_${t.key}" rows="3" placeholder="例：今日学んだコツは？">${lines(l.questions[t.key])}</textarea></label>`).join("")}
        <label class="check1"><input type="checkbox" id="lSelfCheck" ${l.selfCheck ? "checked" : ""}/> 振り返りの最初に「課題は達成できた？（◎○△）」と聞く</label>

        <h3>④ 生徒からの質問への答え</h3>
        <div class="small">生徒が「〜はどうすればいい？」と質問すると、コーチは練習方法メニューと技のポイントから合うものを探して答えます。決まった答えを返したいときは、下に「キーワード → 答え」の形で書いてください（1行に1つ。キーワードは「・」で区切ると複数にできます）。</div>
        <label class="f">よくある質問<textarea id="lFaq" rows="4" placeholder="例：ひざ・膝 → 長座でひざの裏をマットにつける練習をしてから、坂道マットでためしてみよう。">${esc((l.faq || []).map((f) => `${(f.keywords || []).join("・")} → ${f.answer}`).join("\n"))}</textarea></label>

        <div class="form-btns"><button id="lSave" class="btn primary">保存する</button><button id="lCancel" class="btn">もどる</button><span id="lMsg" class="note"></span></div>
      </div>`;

    let methods = l.methods.map((m) => ({ ...m }));
    const renderMethods = () => {
      const box = $t("methodRows");
      box.innerHTML = "";
      methods.forEach((m, i) => {
        const r = mk("div", "method-edit");
        r.innerHTML = `<input type="text" data-k="name" placeholder="方法の名前" value="${esc(m.name)}" />
          <textarea data-k="how" rows="2" placeholder="やり方">${esc(m.how)}</textarea>
          <input type="text" data-k="focus" placeholder="ここを意識するとよいかも（ヒント）" value="${esc(m.focus || "")}" />
          <div class="method-edit-foot">
            <select data-k="video"><option value="">お手本動画なし</option>${(this.app.modelVideos || []).map((v) => `<option value="${esc(v.id)}" ${v.id === m.video ? "selected" : ""}>🎬 ${esc(v.name)}</option>`).join("")}</select>
            <select data-k="skills"><option value="">全部の技</option>${SKILLS.map((s) => `<option value="${s.id}" ${(m.skills || []).length === 1 && m.skills[0] === s.id ? "selected" : ""}>${esc(s.name)}だけ</option>`).join("")}${(m.skills || []).length > 1 ? `<option value="__keep" selected>${esc(m.skills.map((id) => SKILLS.find((s) => s.id === id)?.name).join("・"))}</option>` : ""}</select>
            <button class="btn danger" data-del>削除</button>
          </div>`;
        r.querySelectorAll("[data-k]").forEach((x) =>
          x.addEventListener("input", () => {
            const k = x.dataset.k;
            if (k === "skills") {
              if (x.value !== "__keep") m.skills = x.value ? [x.value] : [];
            } else m[k] = x.value;
          })
        );
        r.querySelector("[data-del]").onclick = () => {
          methods.splice(i, 1);
          renderMethods();
        };
        box.appendChild(r);
      });
    };
    renderMethods();
    $t("addMethod").onclick = () => {
      methods.push({ name: "", how: "", focus: "", skills: [], video: "" });
      renderMethods();
    };
    $t("resetMethods").onclick = () => {
      methods = METHOD_LIBRARY.map((m) => ({ ...m }));
      renderMethods();
    };
    $t("lCancel").onclick = () => this.showLessons();
    $t("lSave").onclick = async () => {
      const split = (id) => $t(id).value.split("\n").map((x) => x.trim()).filter(Boolean);
      const lesson = {
        id: l.id,
        date: $t("lDate").value,
        title: $t("lTitle").value.trim() || "マット運動",
        classes: [...document.querySelectorAll("input[name=lCls]:checked")].map((x) => x.value),
        skills: [...document.querySelectorAll("input[name=lSkill]:checked")].map((x) => x.value),
        taskPrompt: $t("lTaskPrompt").value.trim(),
        taskOptions: split("lTaskOptions"),
        methodPrompt: $t("lMethodPrompt").value.trim(),
        methods: methods.filter((m) => m.name.trim()),
        questions: Object.fromEntries(TIMINGS.map((t) => [t.key, split(`q_${t.key}`)])),
        selfCheck: $t("lSelfCheck").checked,
        faq: split("lFaq")
          .map((line) => {
            const [k, ...rest] = line.split(/→|->|＞|>/);
            return { keywords: k.split(/[・,、，\s]+/).map((x) => x.trim()).filter(Boolean), answer: rest.join("→").trim() };
          })
          .filter((f) => f.keywords.length && f.answer),
      };
      if (!lesson.date) {
        $t("lMsg").textContent = "日付を入れてください。";
        return;
      }
      $t("lMsg").textContent = "保存しています…";
      try {
        await callApi("saveLesson", lesson);
        this.showLessons();
      } catch (e) {
        $t("lMsg").textContent = `保存できませんでした：${e.message}`;
      }
    };
  },

  // ---------------- 設定 ----------------
  showSettings() {
    const page = this.app.showPage("⚙️ 設定", "クラスや、いっしょに使う先生を登録します");
    const s = this.app.settings;
    page.innerHTML = `<div class="form">
      <label class="f">クラス（1行に1つ。例：3-1）<textarea id="sClasses" rows="5">${esc((s.classes || []).join("\n"))}</textarea></label>
      <label class="f">いっしょに使う先生のメールアドレス（1行に1つ。アプリを公開した先生は自動で先生になります）<textarea id="sTeachers" rows="3">${esc((s.teachers || []).join("\n"))}</textarea></label>
      <div class="hint-box">🎬 <b>お手本動画</b>は、ドライブの「マット運動コーチ」→「お手本動画」フォルダに動画を入れると、生徒がいつでも見られるようになります。ファイル名に技の名前（例：前転_お手本.mp4）を入れると、その技のお手本として先に表示されます。<br>📄 データは同じフォルダの「マット運動コーチ_データ」（スプレッドシート）に保存されています。</div>
      <div class="form-btns"><button id="sSave" class="btn primary">保存する</button><span id="sMsg" class="note"></span></div></div>`;
    $t("sSave").onclick = async () => {
      const split = (id) => $t(id).value.split("\n").map((x) => x.trim()).filter(Boolean);
      const settings = { classes: split("sClasses"), teachers: split("sTeachers") };
      $t("sMsg").textContent = "保存しています…";
      try {
        await callApi("saveSettings", settings);
        Object.assign(this.app.settings, settings);
        if (this.data) this.data.classes = settings.classes;
        $t("sMsg").textContent = "保存しました。";
      } catch (e) {
        $t("sMsg").textContent = `保存できませんでした：${e.message}`;
      }
    };
  },
};
