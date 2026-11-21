import { findSkill } from "./skills.js";
import { normalizeLesson } from "./methods.js";
import { callApi } from "./api.js";
import { Room, mk, esc, dateLabel } from "./chat.js";
import { Teacher } from "./teacher.js";

// ============================================================
// 全体の画面（左：トークルーム一覧、右：トーク）
// ============================================================
const $a = (id) => document.getElementById(id);

const App = {
  me: null,
  today: "",
  settings: { classes: [], teachers: [] },
  lesson: null,
  rooms: [],
  modelVideos: [],
  mode: "student",

  async boot() {
    this.showPage("読みこみ中…", "").innerHTML = `<div class="loading"><div class="spinner"></div><p>読みこみ中…</p></div>`;
    let init;
    try {
      init = await callApi("init");
    } catch (e) {
      this.showPage("つながりませんでした", "").innerHTML = `<div class="note">サーバーにつながりませんでした。通信を確かめて、ページを読みこみ直してください。<br>${esc(e.message)}</div>`;
      return;
    }
    Object.assign(this, { me: init.me, today: init.today, settings: init.settings, rooms: init.rooms, modelVideos: init.modelVideos });
    this.lesson = normalizeLesson(init.lesson);
    if (!this.me.email) {
      this.showPage("Google アカウントを確認できません", "").innerHTML = `<div class="note">学校の Google アカウントでログインしてから、もう一度開いてください。</div>`;
      return;
    }
    if (this.me.isTeacher) this.startTeacher();
    else if (!this.me.student) this.register();
    else this.startStudent();
  },

  // ---------- 画面の切りかえ ----------
  setHead(title, sub) {
    $a("mainTitle").textContent = title;
    $a("mainSub").textContent = sub || "";
  },
  showChat(title, sub) {
    $a("chatView").classList.remove("hidden");
    $a("pageView").classList.add("hidden");
    this.setHead(title, sub);
  },
  showPage(title, sub) {
    $a("chatView").classList.add("hidden");
    const page = $a("pageView");
    page.classList.remove("hidden");
    page.innerHTML = "";
    page.scrollTop = 0;
    this.setHead(title, sub);
    return page;
  },
  closeSidebarOnMobile() {
    $a("shell").classList.remove("side-open");
  },

  // ---------- 生徒 ----------
  register() {
    const dlg = $a("registerDialog");
    const classes = this.settings.classes || [];
    $a("regClassBox").innerHTML = classes.length
      ? `<select id="regClass" required>${classes.map((c) => `<option>${esc(c)}</option>`).join("")}</select>`
      : `<input id="regClass" type="text" placeholder="例：3-3" required />`;
    $a("registerForm").onsubmit = async (e) => {
      e.preventDefault();
      $a("regMsg").textContent = "登録しています…";
      try {
        this.me.student = await callApi("register", $a("regClass").value, $a("regNumber").value, $a("regName").value);
        dlg.close();
        if (this.mode === "try" || this.me.isTeacher) this.startStudent(true);
        else {
          const init = await callApi("init");
          this.lesson = normalizeLesson(init.lesson);
          this.startStudent();
        }
      } catch (err) {
        $a("regMsg").textContent = err.message;
      }
    };
    dlg.showModal();
  },

  startStudent(trial = false) {
    this.mode = trial ? "try" : "student";
    this.renderStudentSide();
    this.openToday();
  },

  renderStudentSide() {
    const body = $a("sideBody");
    body.innerHTML = "";
    if (this.mode === "try") {
      const back = mk("button", "side-item accent", "↩ 先生の画面にもどる");
      back.onclick = () => this.startTeacher();
      body.appendChild(back);
    }
    const today = mk("button", "side-item room today", `<span class="room-icon">💬</span><span><b>今日のトーク</b><small>${esc(dateLabel(this.today))}　${esc(this.lesson.title)}</small></span>`);
    today.onclick = () => this.openToday();
    body.appendChild(today);
    const past = this.rooms.filter((d) => d !== this.today);
    body.appendChild(mk("div", "side-label", "これまでのトーク"));
    if (!past.length) body.appendChild(mk("div", "side-empty", "まだありません"));
    for (const d of past) {
      const b = mk("button", "side-item room", `<span class="room-icon">🗂</span><span>${esc(dateLabel(d))}</span>`);
      b.onclick = () => this.openPast(d, b);
      body.appendChild(b);
    }
    const s = this.me.student;
    $a("sideFoot").innerHTML = s ? `<div class="me-chip">🧑‍🎓 ${esc(s.class)}　${esc(s.number)}番　${esc(s.name)}</div>` : "";
    this.markRoom(today);
  },

  markRoom(btn) {
    document.querySelectorAll("#sideBody .side-item.on").forEach((x) => x.classList.remove("on"));
    btn && btn.classList.add("on");
  },

  async openToday() {
    this.markRoom(document.querySelector("#sideBody .today"));
    this.showChat(this.lesson.title, `${dateLabel(this.today)}のトーク`);
    this.closeSidebarOnMobile();
    $a("talk").innerHTML = `<div class="loading"><div class="spinner"></div></div>`;
    let room = { messages: [], ctx: null };
    try {
      room = await callApi("room", this.today);
    } catch (e) {
      console.warn(e);
    }
    Room.onSaved = () => {
      if (!this.rooms.includes(this.today)) {
        this.rooms.unshift(this.today);
      }
    };
    Room.open({
      date: this.today,
      messages: room.messages,
      ctx: room.ctx,
      lesson: this.lesson,
      student: this.me.student,
      readOnly: false,
      onModel: (id, skill) => this.openModel(id, skill),
    });
  },

  async openPast(date, btn) {
    this.markRoom(btn);
    this.showChat(dateLabel(date), "これまでのトーク（見るだけ）");
    this.closeSidebarOnMobile();
    $a("talk").innerHTML = `<div class="loading"><div class="spinner"></div></div>`;
    const room = await callApi("room", date);
    Room.open({ date, messages: room.messages, readOnly: true, onModel: (id, skill) => this.openModel(id, skill) });
  },

  // ---------- 先生 ----------
  async startTeacher() {
    this.mode = "teacher";
    Teacher.app = this;
    const body = $a("sideBody");
    body.innerHTML = "";
    const nav = [
      ["📝 学びのまとめ・評価", () => Teacher.showSummaries()],
      ["🗓 授業設定", () => Teacher.showLessons()],
      ["⚙️ 設定", () => Teacher.showSettings()],
      ["🧑‍🎓 生徒の画面を試す", () => (this.me.student ? this.startStudent(true) : ((this.mode = "try"), this.register()))],
    ];
    for (const [label, fn] of nav) {
      const b = mk("button", "side-item", label);
      b.onclick = () => {
        this.markRoom(b);
        this.closeSidebarOnMobile();
        fn();
      };
      body.appendChild(b);
    }
    body.appendChild(mk("div", "side-label", "💬 生徒のトーク"));
    const tree = mk("div", "tree");
    body.appendChild(tree);
    $a("sideFoot").innerHTML = `<div class="me-chip">👩‍🏫 先生　<small>${esc(this.me.email)}</small></div>`;
    this.teacherHome();
    tree.innerHTML = `<div class="side-empty">読みこみ中…</div>`;
    try {
      await Teacher.loadOverview();
      Teacher.renderTalkTree(tree);
    } catch (e) {
      tree.innerHTML = `<div class="side-empty">読みこめませんでした：${esc(e.message)}</div>`;
    }
  },

  teacherHome() {
    const page = this.showPage("先生のページ", dateLabel(this.today));
    page.innerHTML = `<div class="home">
      <h2>ようこそ 👩‍🏫</h2>
      <p>左の一覧から、クラス → 生徒 → 日付 をえらぶと、その日のトークを見られます。</p>
      <div class="home-cards">
        <button class="home-card" data-go="lessons"><b>🗓 授業設定</b><span>その日のコーチの問いかけや、練習方法のメニューを決めます。</span></button>
        <button class="home-card" data-go="summaries"><b>📝 学びのまとめ・評価</b><span>生徒の振り返りを見て、評価を入力し、PDFにまとめます。</span></button>
        <button class="home-card" data-go="settings"><b>⚙️ 設定</b><span>クラスの登録や、お手本動画の入れ方。</span></button>
      </div>
      <p class="note">今日の授業：${esc(this.lesson.title)}${this.lesson.id ? "" : "（授業設定がないため、ひな形で動きます）"}</p>
    </div>`;
    page.querySelectorAll("[data-go]").forEach((b) => {
      b.onclick = () => ({ lessons: () => Teacher.showLessons(), summaries: () => Teacher.showSummaries(), settings: () => Teacher.showSettings() })[b.dataset.go]();
    });
  },

  // ---------- お手本動画 ----------
  openModel(videoId, skill) {
    const dlg = $a("modelDialog");
    const list = $a("modelList");
    const player = $a("modelPlayer");
    const vids = [...this.modelVideos];
    if (skill) vids.sort((a, b) => (b.name.includes(skill.name) ? 1 : 0) - (a.name.includes(skill.name) ? 1 : 0));
    list.innerHTML = vids.length ? "" : `<div class="note">先生がまだお手本動画を入れていません。</div>`;
    const play = (v, btn) => {
      list.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === btn));
      player.innerHTML = `<iframe src="https://drive.google.com/file/d/${encodeURIComponent(v.id)}/preview" allow="autoplay; fullscreen" allowfullscreen></iframe><div class="note">${esc(v.name)}</div>`;
    };
    let first = null;
    for (const v of vids) {
      const b = mk("button", "model-item", `🎬 ${esc(v.name.replace(/\.[a-z0-9]+$/i, ""))}`);
      b.onclick = () => play(v, b);
      list.appendChild(b);
      if (v.id === videoId || (!videoId && !first)) first = [v, b];
    }
    player.innerHTML = "";
    if (first) play(...first);
    dlg.showModal();
  },
};

// ---------- 入力欄など ----------
function initUi() {
  const input = $a("msgInput");
  const send = $a("sendBtn");
  const resize = () => {
    input.style.height = "auto";
    input.style.height = `${Math.min(140, input.scrollHeight)}px`;
    send.disabled = !input.value.trim();
  };
  const submit = () => {
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    resize();
    Room.onText(text);
  };
  input.addEventListener("input", resize);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      submit();
    }
  });
  send.onclick = submit;
  $a("videoInput").addEventListener("change", (e) => {
    const f = e.target.files[0];
    e.target.value = "";
    Room.onVideo(f);
  });
  $a("menuBtn").onclick = () => $a("shell").classList.add("side-open");
  $a("sideClose").onclick = () => $a("shell").classList.remove("side-open");
  $a("scrim").onclick = () => $a("shell").classList.remove("side-open");
  $a("modelBtn").onclick = () => App.openModel(null, Room.ctx?.skillId ? findSkill(Room.ctx.skillId) : null);
  document.querySelectorAll("dialog [data-close]").forEach((b) => (b.onclick = () => {
    $a("modelPlayer").innerHTML = "";
    b.closest("dialog").close();
  }));
}

initUi();
App.boot();
