
"use strict";

/* =========================================================
   STUDYX — PERSONAL STUDY OS
   Theme: #080d1b / #49e3f4 / #a18aff
   Storage: browser localStorage
   ========================================================= */

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const STORAGE_KEY = "studyx_advanced_v1";
const COLORS = { cyan: "#49e3f4", violet: "#a18aff" };

const today = () => dateKey(new Date());
const dateKey = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const shiftDate = (key, days) => {
  const d = parseDate(key);
  d.setDate(d.getDate() + days);
  return dateKey(d);
};
const parseDate = key => {
  const [y,m,d] = String(key || today()).split("-").map(Number);
  return new Date(y || 2000, (m || 1)-1, d || 1);
};
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,8);
const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, ch => ({
  "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
}[ch]));
const safeUrl = value => {
  try {
    const u = new URL(value);
    return ["http:", "https:"].includes(u.protocol) ? u.href : "";
  } catch { return ""; }
};
const fmtDate = (key, options = {day:"numeric",month:"short",year:"numeric"}) =>
  parseDate(key).toLocaleDateString("en-IN", options);
const fmtTime = value => {
  if (!value) return "No time set";
  const [h,m] = value.split(":").map(Number);
  const d = new Date();
  d.setHours(h || 0, m || 0, 0, 0);
  return d.toLocaleTimeString("en-IN",{hour:"numeric",minute:"2-digit"});
};
const daysBetween = (a,b) => Math.round((parseDate(b)-parseDate(a))/86400000);
const clamp = (n,min,max) => Math.max(min,Math.min(max,n));
const pct = (a,b) => b ? Math.round(a/b*100) : 0;

function blankData() {
  return {
    profile: null,
    tasks: [],
    exams: [],
    chapters: [],
    schedule: [],
    revisions: [],
    notes: [],
    sessions: [],
    goals: [],
    reminders: [],
    activity: {},
    streak: {lastDate:"",count:0}
  };
}

function loadData() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!saved || typeof saved !== "object") return blankData();
    const base = blankData();
    Object.keys(base).forEach(k => {
      if (saved[k] !== undefined) base[k] = saved[k];
    });
    ["tasks","exams","chapters","schedule","revisions","notes","sessions","goals","reminders"].forEach(k => {
      if (!Array.isArray(base[k])) base[k] = [];
    });
    if (!base.activity || typeof base.activity !== "object") base.activity = {};
    if (!base.streak || typeof base.streak !== "object") base.streak = {lastDate:"",count:0};
    return base;
  } catch {
    return blankData();
  }
}

let db = loadData();
let currentPage = "dashboard";
let taskFilter = "all";
let selectedScheduleDay = today();
let selectedCalendarDay = today();
let calendarMonth = new Date(new Date().getFullYear(),new Date().getMonth(),1);
let onboardingStep = 0;
let modalType = "";
let modalEditId = null;
let timerMode = "focus";
let timerSeconds = 25 * 60;
let timerInitialSeconds = timerSeconds;
let timerRunning = false;
let timerInterval = null;
let chartInstances = {};
let toastTimeouts = [];

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    return true;
  } catch (err) {
    toast("Couldn't save. Browser storage may be full.", true);
    return false;
  }
}

function toast(message, error = false) {
  const node = document.createElement("div");
  node.className = "toast" + (error ? " error" : "");
  node.textContent = message;
  $("#toastRegion").appendChild(node);
  const t = setTimeout(() => node.remove(), 3300);
  toastTimeouts.push(t);
}

function emptyState(title, description, buttonLabel = "", buttonAction = "") {
  return `<div class="empty-state"><div class="empty-icon">✧</div><strong>${escapeHTML(title)}</strong><p>${escapeHTML(description)}</p>${buttonLabel ? `<button class="btn btn-secondary" data-action="${escapeHTML(buttonAction)}">${escapeHTML(buttonLabel)}</button>` : ""}</div>`;
}

function makeOptions(values, selected = "") {
  return values.map(v => {
    const label = typeof v === "string" ? v : v.label;
    const value = typeof v === "string" ? v : v.value;
    return `<option value="${escapeHTML(value)}" ${String(value)===String(selected)?"selected":""}>${escapeHTML(label)}</option>`;
  }).join("");
}

function field(name, label, type = "text", value = "", extra = {}) {
  const id = "f_" + name;
  const required = extra.required === false ? "" : "required";
  const placeholder = extra.placeholder ? `placeholder="${escapeHTML(extra.placeholder)}"` : "";
  const min = extra.min !== undefined ? `min="${extra.min}"` : "";
  const max = extra.max !== undefined ? `max="${extra.max}"` : "";
  const step = extra.step ? `step="${extra.step}"` : "";
  const opts = extra.options || [];
  const content = type === "select"
    ? `<select id="${id}" name="${name}" ${required}>${makeOptions(opts,value)}</select>`
    : type === "textarea"
      ? `<textarea id="${id}" name="${name}" rows="${extra.rows || 4}" ${placeholder} ${required}>${escapeHTML(value)}</textarea>`
      : `<input id="${id}" name="${name}" type="${type}" value="${escapeHTML(value)}" ${placeholder} ${min} ${max} ${step} ${required}>`;
  return `<label>${escapeHTML(label)}${content}</label>`;
}

function formFields(items) {
  return items.map(item => {
    if (item.type === "group") {
      return `<div class="form-grid">${formFields(item.fields)}</div>`;
    }
    return field(item.name,item.label,item.type,item.value,item);
  }).join("");
}

function openModal(type, editId = null) {
  modalType = type;
  modalEditId = editId;
  const collections = {
    task: db.tasks, exam: db.exams, chapter: db.chapters,
    schedule: db.schedule, revision: db.revisions,
    note: db.notes, goal: db.goals, reminder: db.reminders
  };
  const existing = editId ? (collections[type] || []).find(x => x.id === editId) : null;
  const x = existing || {};
  const subjectOptions = [...new Set(db.chapters.map(c => c.subject).filter(Boolean))];
  const commonSubjects = [...new Set([...subjectOptions,"Mathematics","Science","English","History","Geography","Computer","Other"])];
  let title = "Add item", eyebrow = "YOUR WORKSPACE", fields = [];

  switch(type) {
    case "task":
      title = existing ? "Edit task" : "Create a task";
      eyebrow = "TASK MANAGER";
      fields = [
        {name:"title",label:"Task title",value:x.title||"",placeholder:"e.g. Complete algebra homework"},
        {name:"subject",label:"Subject",value:x.subject||"General",type:"select",options:commonSubjects},
        {name:"due",label:"Due date",type:"date",value:x.due||today()},
        {type:"group",fields:[
          {name:"priority",label:"Priority",type:"select",value:x.priority||"medium",options:[{label:"Low",value:"low"},{label:"Medium",value:"medium"},{label:"High",value:"high"}]},
          {name:"kind",label:"Type",type:"select",value:x.kind||"Homework",options:["Homework","Assignment","Practice","Reading","Other"]}
        ]},
        {name:"notes",label:"Details (optional)",type:"textarea",value:x.notes||"",required:false}
      ];
      break;
    case "exam":
      title = existing ? "Edit exam" : "Add an exam";
      eyebrow = "EXAM COUNTDOWN";
      fields = [
        {name:"title",label:"Exam name",value:x.title||"",placeholder:"e.g. Mathematics Half-Yearly"},
        {type:"group",fields:[
          {name:"subject",label:"Subject",value:x.subject||"Mathematics",type:"select",options:commonSubjects},
          {name:"date",label:"Exam date",type:"date",value:x.date||today()}
        ]},
        {name:"time",label:"Exam time (optional)",type:"time",value:x.time||"",required:false},
        {name:"notes",label:"Preparation notes",type:"textarea",value:x.notes||"",required:false}
      ];
      break;
    case "chapter":
      title = existing ? "Edit chapter" : "Add a chapter";
      eyebrow = "SYLLABUS TRACKER";
      fields = [
        {name:"subject",label:"Subject",type:"select",value:x.subject||"Mathematics",options:commonSubjects},
        {name:"title",label:"Chapter / topic",value:x.title||"",placeholder:"e.g. Rational numbers"},
        {name:"status",label:"Status",type:"select",value:x.status||"pending",options:[{label:"Not started",value:"pending"},{label:"Learning",value:"learning"},{label:"Completed / mastered",value:"done"}]},
        {name:"notes",label:"Notes (optional)",type:"textarea",value:x.notes||"",required:false}
      ];
      break;
    case "schedule":
      title = existing ? "Edit session" : "Add study session";
      eyebrow = "TIMETABLE";
      fields = [
        {name:"title",label:"Session title",value:x.title||"",placeholder:"e.g. Science revision"},
        {name:"subject",label:"Subject",type:"select",value:x.subject||"Mathematics",options:commonSubjects},
        {type:"group",fields:[
          {name:"date",label:"Date",type:"date",value:x.date||selectedScheduleDay||today()},
          {name:"start",label:"Start time",type:"time",value:x.start||"17:00"}
        ]},
        {type:"group",fields:[
          {name:"end",label:"End time",type:"time",value:x.end||"18:00"},
          {name:"repeat",label:"Repeat",type:"select",value:x.repeat||"none",options:[{label:"Does not repeat",value:"none"},{label:"Every day",value:"daily"},{label:"Every week",value:"weekly"}]}
        ]},
        {name:"notes",label:"Notes (optional)",type:"textarea",value:x.notes||"",required:false}
      ];
      break;
    case "revision":
      title = existing ? "Edit revision" : "Schedule revision";
      eyebrow = "REVISION PLANNER";
      fields = [
        {name:"title",label:"Topic to revise",value:x.title||"",placeholder:"e.g. Algebraic identities"},
        {name:"subject",label:"Subject",type:"select",value:x.subject||"Mathematics",options:commonSubjects},
        {name:"date",label:"Revision date",type:"date",value:x.date||today()},
        {name:"notes",label:"What needs reviewing?",type:"textarea",value:x.notes||"",required:false}
      ];
      break;
    case "note":
      title = existing ? "Edit note" : "Create a note";
      eyebrow = "NOTES & RESOURCES";
      fields = [
        {name:"title",label:"Note title",value:x.title||"",placeholder:"e.g. Important formulas"},
        {name:"subject",label:"Subject",type:"select",value:x.subject||"General",options:commonSubjects},
        {name:"body",label:"Your notes",type:"textarea",value:x.body||"",rows:6,placeholder:"Write your summary, key points or reminders..."},
        {name:"url",label:"Resource link (optional)",type:"url",value:x.url||"",required:false,placeholder:"https://..."}
      ];
      break;
    case "goal":
      title = existing ? "Edit goal" : "Set a goal";
      eyebrow = "GOALS & STREAKS";
      fields = [
        {name:"title",label:"Goal",value:x.title||"",placeholder:"e.g. Finish 5 chapters"},
        {type:"group",fields:[
          {name:"target",label:"Target",type:"number",min:1,step:1,value:x.target||5},
          {name:"current",label:"Current progress",type:"number",min:0,step:1,value:x.current||0}
        ]},
        {name:"unit",label:"Unit",value:x.unit||"chapters",placeholder:"chapters, sessions, tasks"},
        {name:"due",label:"Target date",type:"date",value:x.due||shiftDate(today(),7)}
      ];
      break;
    case "reminder":
      title = existing ? "Edit reminder" : "Add a reminder";
      eyebrow = "REMINDERS";
      fields = [
        {name:"title",label:"Reminder",value:x.title||"",placeholder:"e.g. Submit science project"},
        {type:"group",fields:[
          {name:"date",label:"Date",type:"date",value:x.date||today()},
          {name:"time",label:"Time (optional)",type:"time",value:x.time||"",required:false}
        ]},
        {name:"notes",label:"Details (optional)",type:"textarea",value:x.notes||"",required:false}
      ];
      break;
  }

  if (!collections[type]) return;
  $("#modalTitle").textContent = title;
  $("#modalEyebrow").textContent = eyebrow;
  $("#modalFields").innerHTML = formFields(fields);
  $("#modalSave").textContent = existing ? "Save changes" : "Save";
  $("#itemDialog").showModal();
}

function closeModal() {
  if ($("#itemDialog").open) $("#itemDialog").close();
}

function getFormObject(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function handleItemSubmit(event) {
  event.preventDefault();
  const form = getFormObject(event.currentTarget);
  const collections = {
    task: "tasks", exam: "exams", chapter: "chapters",
    schedule: "schedule", revision: "revisions",
    note: "notes", goal: "goals", reminder: "reminders"
  };
  const key = collections[modalType];
  if (!key) return;

  const old = modalEditId ? db[key].find(x => x.id === modalEditId) : null;
  const item = {...form, id: modalEditId || uid(), createdAt: old?.createdAt || new Date().toISOString()};

  if (modalType === "task") item.done = old?.done || false;
  if (modalType === "chapter") item.status = form.status || "pending";
  if (modalType === "revision") item.done = old?.done || false;
  if (modalType === "reminder") item.done = old?.done || false;
  if (modalType === "goal") {
    item.target = Math.max(1,Number(form.target)||1);
    item.current = clamp(Number(form.current)||0,0,item.target);
  }
  if (modalType === "schedule" && form.end <= form.start) {
    toast("The end time must be after the start time.",true);
    return;
  }
  if (modalType === "note" && form.url && !safeUrl(form.url)) {
    toast("Enter a valid HTTP or HTTPS resource link.",true);
    return;
  }
  if (modalType === "exam" && form.date < today()) {
    toast("This exam date is in the past. You can still save it if intended.",false);
  }

  if (old) {
    Object.assign(old,item);
  } else {
    db[key].push(item);
  }

  save();
  closeModal();
  renderAll();
  toast(old ? "Changes saved." : "Added to your STUDYX workspace.");
}

/* ONBOARDING */
function showOnboardingStep(step) {
  onboardingStep = clamp(step,0,3);
  $$(".onboard-step").forEach(el => {
    el.classList.toggle("active",Number(el.dataset.step)===onboardingStep);
  });
  $("#stepLabel").textContent = `0${onboardingStep+1} / 04`;
  $("#onboardProgress").style.width = `${(onboardingStep+1)*25}%`;
  $("#backOnboard").hidden = onboardingStep === 0;
  $("#onboarding").scrollTop = 0;
}

function populateProfileForm() {
  if (!db.profile) return;
  $("#profileName").value = db.profile.name || "";
  $("#profileAge").value = db.profile.age || "";
  $("#profileClass").value = db.profile.class || "";
  $("#profileBoard").value = db.profile.board || "";
  $("#profileGoal").value = db.profile.goal || "";
}

function launchApp() {
  if (!db.profile) {
    showOnboardingStep(1);
    return;
  }
  $("#onboarding").hidden = true;
  $("#app").hidden = false;
  populateProfileForm();
  updateProfileUI();
  renderAll();
}

function updateProfileUI() {
  const p = db.profile || {name:"Student",class:"My study space"};
  const name = p.name || "Student";
  $("#sidebarName").textContent = name;
  $("#sidebarClass").textContent = `${p.class || "Student"} · ${p.board || ""}`;
  $("#sidebarAvatar").textContent = name.trim().charAt(0).toUpperCase() || "S";
  $("#greeting").textContent = `${greeting()}, ${name.split(/\s+/)[0]}.`;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function openAppOnboarding() {
  $("#app").hidden = true;
  $("#onboarding").hidden = false;
  populateProfileForm();
  showOnboardingStep(1);
}

$("#profileForm").addEventListener("submit", event => {
  event.preventDefault();
  const f = getFormObject(event.currentTarget);
  db.profile = {
    name: f.name.trim(),
    age: Number(f.age),
    class: f.class,
    board: f.board,
    goal: f.goal
  };
  if (!db.profile.name || db.profile.age < 5 || db.profile.age > 100) {
    toast("Please check your name and age.",true);
    return;
  }
  save();
  updateProfileUI();
  showOnboardingStep(2);
});

$$("[data-next]").forEach(button => button.addEventListener("click", () => {
  if (onboardingStep === 0) {
    showOnboardingStep(1);
  } else if (onboardingStep === 2) {
    showOnboardingStep(3);
  }
}));
$("#backOnboard").addEventListener("click", () => showOnboardingStep(onboardingStep-1));
$("#launchApp").addEventListener("click", launchApp);

/* NAVIGATION */
function navigate(page) {
  if (!$(`#page-${page}`)) return;
  currentPage = page;
  $$(".page").forEach(p => p.classList.toggle("active",p.id===`page-${page}`));
  $$(".nav-item").forEach(b => b.classList.toggle("active",b.dataset.page===page));
  const nav = $(`.nav-item[data-page="${page}"]`);
  $("#topbarTitle").textContent = nav ? nav.textContent.trim() : "Dashboard";
  closeSidebar();
  renderAll();
  window.scrollTo({top:0,behavior:"smooth"});
}

function openSidebar() {
  $("#sidebar").classList.add("open");
  $("#sidebarBackdrop").classList.add("visible");
  $("#menuToggle").setAttribute("aria-expanded","true");
}
function closeSidebar() {
  $("#sidebar").classList.remove("open");
  $("#sidebarBackdrop").classList.remove("visible");
  $("#menuToggle").setAttribute("aria-expanded","false");
}

$("#menuToggle").addEventListener("click", () => {
  $("#sidebar").classList.contains("open") ? closeSidebar() : openSidebar();
});
$("#sidebarBackdrop").addEventListener("click",closeSidebar);
$("#sideNav").addEventListener("click",e => {
  const b = e.target.closest("[data-page]");
  if (b) navigate(b.dataset.page);
});
$(".sidebar-brand").addEventListener("click",e => {e.preventDefault();navigate("dashboard");});
$("#editProfile").addEventListener("click",openAppOnboarding);
$$("[data-page]").forEach(el => {
  if (!el.closest("#sideNav") && !el.classList.contains("sidebar-brand")) {
    el.addEventListener("click",e => {
      e.preventDefault();
      navigate(el.dataset.page);
    });
  }
});

/* GENERAL ADD BUTTONS */
$("#quickAdd").addEventListener("click",() => openModal("task"));
$("#addTaskInline").addEventListener("click",() => openModal("task"));
$("#addTaskBtn").addEventListener("click",() => openModal("task"));
$("#addExamBtn").addEventListener("click",() => openModal("exam"));
$("#addChapterBtn").addEventListener("click",() => openModal("chapter"));
$("#addScheduleBtn").addEventListener("click",() => openModal("schedule"));
$("#addRevisionBtn").addEventListener("click",() => openModal("revision"));
$("#addNoteBtn").addEventListener("click",() => openModal("note"));
$("#addGoalBtn").addEventListener("click",() => openModal("goal"));
$("#addReminderBtn").addEventListener("click",() => openModal("reminder"));
$("#modalClose").addEventListener("click",closeModal);
$("#modalCancel").addEventListener("click",closeModal);
$("#itemDialog").addEventListener("click",e => {
  if (e.target === $("#itemDialog")) closeModal();
});
$("#itemForm").addEventListener("submit",handleItemSubmit);

/* SHARED ACTIONS */
function collectionForType(type) {
  return {
    task:"tasks",exam:"exams",chapter:"chapters",schedule:"schedule",
    revision:"revisions",note:"notes",goal:"goals",reminder:"reminders"
  }[type];
}
function removeItem(type,id) {
  const key = collectionForType(type);
  if (!key) return;
  const item = db[key].find(x => x.id === id);
  if (!item) return;
  if (!confirm(`Delete "${item.title || item.subject || "this item"}"?`)) return;
  db[key] = db[key].filter(x => x.id !== id);
  save();
  renderAll();
  toast("Item deleted.");
}
function editItem(type,id) { openModal(type,id); }

function markTask(id, done) {
  const task = db.tasks.find(t => t.id===id);
  if (!task) return;
  task.done = done;
  if (done) markActivity();
  save();
  renderAll();
}
function markRevision(id, done) {
  const item = db.revisions.find(x => x.id===id);
  if (!item) return;
  item.done = done;
  if (done) markActivity();
  save();
  renderAll();
}
function markReminder(id, done) {
  const item = db.reminders.find(x => x.id===id);
  if (!item) return;
  item.done = done;
  save();
  renderAll();
}
function markChapter(id, done) {
  const item = db.chapters.find(x => x.id===id);
  if (!item) return;
  item.status = done ? "done" : "pending";
  if (done) markActivity();
  save();
  renderAll();
}
function markActivity() {
  const day = today();
  db.activity[day] ||= {minutes:0,completed:0};
  db.activity[day].completed = (db.activity[day].completed||0)+1;
  const s = db.streak;
  if (s.lastDate !== day) {
    s.count = s.lastDate === shiftDate(day,-1) ? (s.count||0)+1 : 1;
    s.lastDate = day;
  }
}

document.addEventListener("click",e => {
  const button = e.target.closest("[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  if (action === "task") openModal("task");
  if (action === "exam") openModal("exam");
  if (action === "chapter") openModal("chapter");
  if (action === "schedule") openModal("schedule");
  if (action === "revision") openModal("revision");
  if (action === "note") openModal("note");
  if (action === "goal") openModal("goal");
  if (action === "reminder") openModal("reminder");
});

document.addEventListener("click",e => {
  const button = e.target.closest("[data-edit-type]");
  if (button) editItem(button.dataset.editType,button.dataset.id);
  const del = e.target.closest("[data-delete-type]");
  if (del) removeItem(del.dataset.deleteType,del.dataset.id);
});

document.addEventListener("change",e => {
  const t = e.target;
  if (t.matches("[data-task-check]")) markTask(t.dataset.taskCheck,t.checked);
  if (t.matches("[data-revision-check]")) markRevision(t.dataset.revisionCheck,t.checked);
  if (t.matches("[data-reminder-check]")) markReminder(t.dataset.reminderCheck,t.checked);
  if (t.matches("[data-chapter-check]")) markChapter(t.dataset.chapterCheck,t.checked);
  if (t.matches("[data-chapter-status]")) {
    const c = db.chapters.find(x => x.id===t.dataset.chapterStatus);
    if (c) {c.status=t.value;save();renderAll();}
  }
  if (t.matches("[data-goal-progress]")) {
    const g = db.goals.find(x => x.id===t.dataset.goalProgress);
    if (g) {g.current=clamp(Number(t.value)||0,0,Number(g.target)||1);save();renderAll();}
  }
});

/* TASKS */
$("#taskFilters").addEventListener("click",e => {
  const b = e.target.closest("[data-filter]");
  if (!b) return;
  taskFilter = b.dataset.filter;
  $$("#taskFilters .filter-btn").forEach(x=>x.classList.toggle("active",x===b));
  renderTasks();
});

function taskRow(t) {
  const dueText = t.due ? fmtDate(t.due,{day:"numeric",month:"short"}) : "No deadline";
  const late = !t.done && t.due && t.due < today();
  const priority = t.priority || "medium";
  return `<div class="task-row ${t.done?"completed":""}">
    <input class="task-check" type="checkbox" data-task-check="${escapeHTML(t.id)}" ${t.done?"checked":""} aria-label="Mark ${escapeHTML(t.title)} complete">
    <div class="task-main"><strong>${escapeHTML(t.title)}</strong>
      <small>${escapeHTML(t.subject||"General")} · ${escapeHTML(t.kind||"Task")} · <span class="${late?"red":""}">${late?"Overdue":escapeHTML(dueText)}</span></small>
      ${t.notes?`<small>${escapeHTML(t.notes)}</small>`:""}
      <span class="pill ${priority==="high"?"red":priority==="low"?"green":"violet"}">${escapeHTML(priority)} priority</span>
    </div>
    <div class="task-actions"><button class="mini-action" data-edit-type="task" data-id="${escapeHTML(t.id)}" aria-label="Edit task">✎</button><button class="mini-action delete" data-delete-type="task" data-id="${escapeHTML(t.id)}" aria-label="Delete task">×</button></div>
  </div>`;
}

function renderTasks() {
  const all = [...db.tasks].sort((a,b) => (a.due||"9999").localeCompare(b.due||"9999"));
  const todayTasks = all.filter(t => t.due === today() && !t.done);
  const visible = all.filter(t => {
    if (taskFilter==="today") return t.due===today();
    if (taskFilter==="pending") return !t.done;
    if (taskFilter==="done") return t.done;
    return true;
  });
  $("#todayTasks").innerHTML = todayTasks.length
    ? todayTasks.slice(0,5).map(taskRow).join("")
    : emptyState("A little breathing room","No pending tasks due today.","Add a task","task");
  $("#taskPageList").innerHTML = visible.length
    ? visible.map(taskRow).join("")
    : emptyState("Nothing on this list","Add a task or switch filters to see your work.","Create a task","task");
  const done = db.tasks.filter(t=>t.done).length;
  const total = db.tasks.length;
  $("#statTasks").innerHTML = `${done} <small>/ ${total}</small>`;
  $("#taskProgress").style.width = `${pct(done,total)}%`;
  $("#dayScore").textContent = `${todayTasks.length ? 0 : total ? pct(done,total) : 0}%`;
}

/* EXAMS */
function daysLabel(n) {
  if (n < 0) return `${Math.abs(n)} day${Math.abs(n)===1?"":"s"} ago`;
  if (n === 0) return "Today";
  return `${n} day${n===1?"":"s"}`;
}
function countdownMarkup(exam) {
  const n = daysBetween(today(),exam.date);
  return `<div class="exam-countdown-number">${n<0?"Past":n}<small>${n<0?"exam":n===0?"days · today":"days to go"}</small></div>`;
}
function examCard(e) {
  const n = daysBetween(today(),e.date);
  return `<article class="exam-card">
    <div class="card-actions"><button class="mini-action" data-edit-type="exam" data-id="${escapeHTML(e.id)}" aria-label="Edit exam">✎</button><button class="mini-action delete" data-delete-type="exam" data-id="${escapeHTML(e.id)}" aria-label="Delete exam">×</button></div>
    <span class="pill violet">${escapeHTML(e.subject||"Exam")}</span>
    <h3>${escapeHTML(e.title)}</h3><p class="muted">${escapeHTML(fmtDate(e.date))}${e.time?" · "+escapeHTML(fmtTime(e.time)):""}</p>
    ${countdownMarkup(e)}
    ${e.notes?`<p class="muted">${escapeHTML(e.notes)}</p>`:""}
    <div class="exam-card-footer"><span>${n<0?"Already passed":n===0?"Exam day":"Upcoming"}</span><span>${escapeHTML(fmtDate(e.date,{day:"numeric",month:"short"}))}</span></div>
  </article>`;
}
function renderExams() {
  const future = db.exams.filter(e=>e.date>=today()).sort((a,b)=>a.date.localeCompare(b.date));
  const all = [...db.exams].sort((a,b)=>a.date.localeCompare(b.date));
  $("#examGrid").innerHTML = all.length ? all.map(examCard).join("") : emptyState("Your exam timeline starts here","Add an exam to see a live countdown and organize your preparation.","Add your first exam","exam");
  $("#examStats").innerHTML = [
    ["Upcoming exams",future.length],
    ["Next exam",future.length?daysLabel(daysBetween(today(),future[0].date)):"—"],
    ["All exams",db.exams.length]
  ].map(([label,val])=>`<article class="stat-card"><div class="stat-top">${escapeHTML(label)}</div><div class="stat-number">${escapeHTML(val)}</div><div class="stat-foot">Your exam schedule</div></article>`).join("");
  const next = future[0];
  $("#nextExamCard").innerHTML = next
    ? `<span class="pill violet">${escapeHTML(next.subject||"Exam")}</span><h3 style="margin-top:12px">${escapeHTML(next.title)}</h3>${countdownMarkup(next)}<div class="exam-meta">${escapeHTML(fmtDate(next.date))}${next.time?" · "+escapeHTML(fmtTime(next.time)):""}</div><button class="btn btn-secondary" data-page="exams">View exam schedule ↗</button>`
    : `<div class="empty-icon">◇</div><strong>No upcoming exams</strong><p>Add your next exam to start counting down.</p><button class="btn btn-secondary" data-action="exam">Add an exam</button>`;
}

/* TIMETABLE */
function renderWeekStrip() {
  const base = parseDate(selectedScheduleDay);
  const monday = new Date(base);
  const weekday = (monday.getDay()+6)%7;
  monday.setDate(monday.getDate()-weekday);
  $("#weekStrip").innerHTML = Array.from({length:7},(_,i)=>{
    const d = new Date(monday);
    d.setDate(d.getDate()+i);
    const key = dateKey(d);
    const names = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
    return `<button class="week-day ${key===selectedScheduleDay?"active":""} ${key===today()?"today":""}" data-schedule-day="${key}"><small>${names[i]}</small><strong>${d.getDate()}</strong></button>`;
  }).join("");
  $("#scheduleDayTitle").textContent = `${fmtDate(selectedScheduleDay,{weekday:"long",day:"numeric",month:"short"})}'s sessions`;
}
function scheduleRow(s) {
  return `<div class="schedule-row"><span class="schedule-time">${escapeHTML(fmtTime(s.start))}</span><span class="schedule-marker"></span><div class="schedule-info"><strong>${escapeHTML(s.title)}</strong><small>${escapeHTML(s.subject||"Study")} · ${escapeHTML(fmtTime(s.start))}–${escapeHTML(fmtTime(s.end))}</small></div><div class="task-actions"><button class="mini-action" data-edit-type="schedule" data-id="${escapeHTML(s.id)}" aria-label="Edit session">✎</button><button class="mini-action delete" data-delete-type="schedule" data-id="${escapeHTML(s.id)}" aria-label="Delete session">×</button></div></div>`;
}
function scheduleOnDate(s, day) {
  if (s.date === day) return true;
  if (s.repeat === "daily" && s.date <= day) return true;
  if (s.repeat === "weekly" && s.date <= day) return parseDate(s.date).getDay()===parseDate(day).getDay();
  return false;
}
function renderTimetable() {
  renderWeekStrip();
  const list = db.schedule.filter(s=>scheduleOnDate(s,selectedScheduleDay)).sort((a,b)=>(a.start||"").localeCompare(b.start||""));
  $("#scheduleCount").textContent = `${list.length} session${list.length===1?"":"s"}`;
  $("#scheduleList").innerHTML = list.length ? list.map(scheduleRow).join("") : emptyState("A clear schedule","Plan a session that fits your day.","Add study session","schedule");
  const todayList = db.schedule.filter(s=>scheduleOnDate(s,today())).sort((a,b)=>(a.start||"").localeCompare(b.start||""));
  $("#todaySchedule").innerHTML = todayList.length ? todayList.slice(0,4).map(scheduleRow).join("") : emptyState("No sessions planned","Add a study session to structure your day.","Plan a session","schedule");
}
$("#weekStrip").addEventListener("click",e=>{
  const b=e.target.closest("[data-schedule-day]");
  if(b){selectedScheduleDay=b.dataset.scheduleDay;renderTimetable();}
});

/* SYLLABUS */
function renderSyllabus() {
  const groups = {};
  db.chapters.forEach(c=>{(groups[c.subject||"General"] ||= []).push(c);});
  const all = db.chapters.length;
  const done = db.chapters.filter(c=>c.status==="done").length;
  $("#statChapters").textContent = done;
  $("#chapterProgress").style.width = `${pct(done,all)}%`;
  $("#syllabusOverview").innerHTML = `<div class="overview-card"><small>CHAPTERS COMPLETED</small><strong>${done} / ${all}</strong><small>${pct(done,all)}% overall progress</small><div class="subject-progress"><span style="width:${pct(done,all)}%"></span></div></div><div class="overview-card"><small>SUBJECTS TRACKED</small><strong>${Object.keys(groups).length}</strong><small>Topics grouped by subject</small><div class="subject-progress"><span style="width:${Math.min(100,Object.keys(groups).length*15)}%"></span></div></div>`;
  $("#subjectGrid").innerHTML = Object.keys(groups).length ? Object.entries(groups).map(([subject,chapters])=>{
    const completed=chapters.filter(c=>c.status==="done").length;
    const learning=chapters.filter(c=>c.status==="learning").length;
    return `<article class="subject-card"><div class="panel-heading"><span class="feature-icon cyan-icon">▤</span><div class="card-actions"><button class="mini-action" data-action="chapter" aria-label="Add chapter">＋</button></div></div><h3>${escapeHTML(subject)}</h3><p>${completed}/${chapters.length} completed · ${learning} in progress</p><div class="subject-progress"><span style="width:${pct(completed,chapters.length)}%"></span></div><div class="chapter-list">${chapters.map(c=>`<div class="chapter-row"><input type="checkbox" data-chapter-check="${escapeHTML(c.id)}" ${c.status==="done"?"checked":""} aria-label="Mark ${escapeHTML(c.title)} complete"><span>${escapeHTML(c.title)}<br><small style="color:var(--muted)">${escapeHTML(c.status==="done"?"Mastered":c.status==="learning"?"In progress":"Not started")}</small></span><button class="mini-action" data-edit-type="chapter" data-id="${escapeHTML(c.id)}" aria-label="Edit chapter">✎</button><button class="mini-action delete" data-delete-type="chapter" data-id="${escapeHTML(c.id)}" aria-label="Delete chapter">×</button></div>`).join("")}</div></article>`;
  }).join("") : emptyState("Your syllabus, organized","Add your first chapter and track its progress.","Add a chapter","chapter");
}

/* REVISION */
function renderRevisions() {
  const list=[...db.revisions].sort((a,b)=>(a.date||"").localeCompare(b.date||""));
  $("#revisionCount").textContent=`${list.filter(x=>!x.done).length} pending`;
  $("#revisionList").innerHTML=list.length?list.map(r=>`<div class="task-row ${r.done?"completed":""}"><input type="checkbox" class="task-check" data-revision-check="${escapeHTML(r.id)}" ${r.done?"checked":""} aria-label="Complete revision"><div class="task-main"><strong>${escapeHTML(r.title)}</strong><small>${escapeHTML(r.subject||"Study")} · ${escapeHTML(r.date?fmtDate(r.date):"No date")}</small>${r.notes?`<small>${escapeHTML(r.notes)}</small>`:""}</div><div class="task-actions"><button class="mini-action" data-edit-type="revision" data-id="${escapeHTML(r.id)}" aria-label="Edit revision">✎</button><button class="mini-action delete" data-delete-type="revision" data-id="${escapeHTML(r.id)}" aria-label="Delete revision">×</button></div></div>`).join(""):emptyState("Nothing to revise yet","Schedule a revision session for a topic you want to revisit.","Plan revision","revision");
}

/* NOTES */
function renderNotes() {
  const q=($("#noteSearch").value||"").toLowerCase().trim();
  const notes=db.notes.filter(n=>`${n.title} ${n.subject} ${n.body}`.toLowerCase().includes(q)).sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||""));
  $("#notesGrid").innerHTML=notes.length?notes.map(n=>{
    const link=safeUrl(n.url);
    return `<article class="note-card"><span class="pill">${escapeHTML(n.subject||"General")}</span><h3>${escapeHTML(n.title)}</h3><p>${escapeHTML(n.body||"No note content yet.")}</p>${link?`<a href="${escapeHTML(link)}" target="_blank" rel="noopener noreferrer">Open resource ↗</a>`:""}<div class="note-footer"><span>${escapeHTML(n.createdAt?fmtDate(n.createdAt.slice(0,10)): "Study note")}</span><span><button class="mini-action" data-edit-type="note" data-id="${escapeHTML(n.id)}" aria-label="Edit note">✎</button><button class="mini-action delete" data-delete-type="note" data-id="${escapeHTML(n.id)}" aria-label="Delete note">×</button></span></div></article>`;
  }).join(""):emptyState("Your notes live here","Save formulas, summaries and useful resources.","Create a note","note");
}
$("#noteSearch").addEventListener("input",renderNotes);

/* FOCUS TIMER */
function setTimerMode(mode, minutes) {
  if(timerRunning && !confirm("Switch timer mode and stop the current session?")) return;
  stopTimer();
  timerMode=mode;
  timerSeconds=minutes*60;
  timerInitialSeconds=timerSeconds;
  $("#timerMode").textContent=mode==="focus"?"FOCUS":mode==="short"?"SHORT BREAK":"LONG BREAK";
  $("#timerStatus").textContent="Ready when you are";
  $("#timerStart").textContent="Start " + (mode==="focus"?"focus":"break");
  $$(".timer-modes [data-minutes]").forEach(b=>b.classList.toggle("active",b.dataset.mode===mode));
  updateTimerDisplay();
}
function updateTimerDisplay() {
  const mins=Math.floor(timerSeconds/60);
  const secs=timerSeconds%60;
  $("#timerDisplay").textContent=`${String(mins).padStart(2,"0")}:${String(secs).padStart(2,"0")}`;
  const remaining=timerInitialSeconds?timerSeconds/timerInitialSeconds:1;
  const degrees=(1-remaining)*360;
  $("#timerRing").style.background=`conic-gradient(var(--cyan) ${degrees}deg, var(--violet) ${Math.min(360,degrees+80)}deg, #26324b ${Math.min(360,degrees+80)}deg)`;
  document.title=timerRunning?`${$("#timerDisplay").textContent} · STUDYX`:"STUDYX — Study OS";
}
function stopTimer() {
  timerRunning=false;
  if(timerInterval) clearInterval(timerInterval);
  timerInterval=null;
  if($("#timerStart")) $("#timerStart").textContent="Resume timer";
}
function startTimer() {
  if(timerRunning) return;
  if(timerSeconds<=0) timerSeconds=timerInitialSeconds;
  timerRunning=true;
  $("#timerStatus").textContent="Session in progress";
  $("#timerStart").textContent="Pause";
  timerInterval=setInterval(()=>{
    timerSeconds--;
    updateTimerDisplay();
    if(timerSeconds<=0) completeTimer();
  },1000);
}
function completeTimer() {
  stopTimer();
  timerSeconds=0;
  updateTimerDisplay();
  $("#timerStatus").textContent="Session complete!";
  $("#timerStart").textContent="Start again";
  if(timerMode==="focus") {
    const mins=Math.round(timerInitialSeconds/60);
    const session={id:uid(),date:today(),minutes:mins,task:$("#focusTask").value.trim()||"Focused study",createdAt:new Date().toISOString()};
    db.sessions.push(session);
    db.activity[today()] ||= {minutes:0,completed:0};
    db.activity[today()].minutes=(db.activity[today()].minutes||0)+mins;
    markActivity();
    save();
    renderAll();
    toast(`Focus session completed: ${mins} minutes.`);
  } else {
    toast("Break complete. Ready for another session?");
  }
}
$("#timerStart").addEventListener("click",()=>{
  if(timerRunning) {
    stopTimer();
    $("#timerStatus").textContent="Paused";
  } else startTimer();
});
$("#timerReset").addEventListener("click",()=>{
  stopTimer();
  timerSeconds=timerInitialSeconds;
  $("#timerStatus").textContent="Ready when you are";
  updateTimerDisplay();
});
$$("[data-minutes]").forEach(b=>b.addEventListener("click",()=>setTimerMode(b.dataset.mode,Number(b.dataset.minutes))));
function renderFocusHistory() {
  const list=[...db.sessions].sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||"")).slice(0,12);
  $("#focusHistory").innerHTML=list.length?list.map(s=>`<div class="task-row"><span class="stat-icon cyan-icon">◷</span><div class="task-main"><strong>${escapeHTML(s.task)}</strong><small>${escapeHTML(fmtDate(s.date))} · ${Number(s.minutes)||0} minutes</small></div></div>`).join(""):emptyState("Your first session awaits","Complete a focus session to see your history.");
  const mins=db.sessions.filter(s=>s.date===today()).reduce((sum,s)=>sum+(Number(s.minutes)||0),0);
  $("#statFocus").innerHTML=`${mins} <small>min</small>`;
  $("#focusProgress").style.width=`${Math.min(100,mins/120*100)}%`;
}

/* GOALS AND STREAKS */
function renderGoals() {
  const completed=db.goals.filter(g=>Number(g.current)>=Number(g.target)).length;
  $("#goalSummary").innerHTML=`<div><strong>${db.goals.length}</strong><span>Total goals</span></div><div><strong>${completed}</strong><span>Goals completed</span></div><div><strong>${db.streak.count||0}</strong><span>Day streak</span></div>`;
  $("#statStreak").innerHTML=`${db.streak.count||0} <small>days</small>`;
  $("#streakProgress").style.width=`${Math.min(100,(db.streak.count||0)/7*100)}%`;
  $("#goalsGrid").innerHTML=db.goals.length?db.goals.map(g=>{
    const progress=pct(Number(g.current)||0,Number(g.target)||1);
    return `<article class="goal-card"><div class="card-actions"><button class="mini-action" data-edit-type="goal" data-id="${escapeHTML(g.id)}" aria-label="Edit goal">✎</button><button class="mini-action delete" data-delete-type="goal" data-id="${escapeHTML(g.id)}" aria-label="Delete goal">×</button></div><span class="feature-icon violet-icon">✧</span><h3>${escapeHTML(g.title)}</h3><p>${g.due?`Target date: ${escapeHTML(fmtDate(g.due))}`:"Personal study goal"}</p><div class="goal-value">${progress}%</div><div class="goal-progress"><span style="width:${progress}%"></span></div><div class="progress-row-head"><span>${Number(g.current)||0} / ${Number(g.target)||1} ${escapeHTML(g.unit||"units")}</span><span>${progress===100?"Completed":"In progress"}</span></div><label class="focus-task-label" style="margin-top:15px">Update progress<input type="number" min="0" max="${Number(g.target)||1}" value="${Number(g.current)||0}" data-goal-progress="${escapeHTML(g.id)}"></label></article>`;
  }).join(""):emptyState("Give yourself a target","Goals help turn intentions into visible progress.","Set a goal","goal");
}

/* CALENDAR */
function eventsForDate(key) {
  const events=[];
  db.exams.filter(x=>x.date===key).forEach(x=>events.push({type:"exam",title:x.title,meta:"Exam · "+(x.subject||"")}));
  db.tasks.filter(x=>x.due===key).forEach(x=>events.push({type:"task",title:x.title,meta:(x.done?"Completed task":"Task")}));
  db.schedule.filter(x=>scheduleOnDate(x,key)).forEach(x=>events.push({type:"schedule",title:x.title,meta:"Study · "+fmtTime(x.start)}));
  db.revisions.filter(x=>x.date===key).forEach(x=>events.push({type:"revision",title:x.title,meta:"Revision"}));
  db.reminders.filter(x=>x.date===key).forEach(x=>events.push({type:"reminder",title:x.title,meta:"Reminder"}));
  return events;
}
function renderCalendar() {
  const y=calendarMonth.getFullYear(),m=calendarMonth.getMonth();
  $("#calendarTitle").textContent=calendarMonth.toLocaleDateString("en-IN",{month:"long",year:"numeric"});
  const first=new Date(y,m,1);
  const offset=(first.getDay()+6)%7;
  const count=new Date(y,m+1,0).getDate();
  const names=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  let html=names.map(n=>`<div class="calendar-cell week-label">${n}</div>`).join("");
  for(let i=0;i<offset;i++) html+=`<div class="calendar-cell" style="background:transparent"></div>`;
  for(let day=1;day<=count;day++) {
    const key=dateKey(new Date(y,m,day));
    const events=eventsForDate(key);
    const hasExam=events.some(e=>e.type==="exam");
    html+=`<button class="calendar-cell ${key===today()?"today":""} ${key===selectedCalendarDay?"selected":""}" data-calendar-day="${key}"><span class="date-number">${day}</span><span class="event-dots">${events.slice(0,4).map(e=>`<i class="${e.type==="exam"?"exam-dot":""}"></i>`).join("")}</span></button>`;
  }
  $("#calendarGrid").innerHTML=html;
  $("#calendarSelectedTitle").textContent=fmtDate(selectedCalendarDay,{weekday:"long",day:"numeric",month:"long"});
  const events=eventsForDate(selectedCalendarDay);
  $("#calendarEvents").innerHTML=events.length?events.map(e=>`<div class="task-row"><span class="stat-icon ${e.type==="exam"?"violet-icon":"cyan-icon"}">${e.type==="exam"?"◇":e.type==="task"?"☷":e.type==="schedule"?"◷":e.type==="revision"?"↻":"♧"}</span><div class="task-main"><strong>${escapeHTML(e.title)}</strong><small>${escapeHTML(e.meta)}</small></div></div>`).join(""):emptyState("Nothing scheduled","This day is free of saved study events.");
}
$("#prevMonth").addEventListener("click",()=>{calendarMonth=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()-1,1);renderCalendar();});
$("#nextMonth").addEventListener("click",()=>{calendarMonth=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()+1,1);renderCalendar();});
$("#calendarGrid").addEventListener("click",e=>{
  const b=e.target.closest("[data-calendar-day]");
  if(b){selectedCalendarDay=b.dataset.calendarDay;renderCalendar();}
});

/* REMINDERS */
function renderReminders() {
  const list=[...db.reminders].sort((a,b)=>(a.date||"").localeCompare(b.date||""));
  $("#reminderList").innerHTML=list.length?list.map(r=>{
    const overdue=!r.done&&r.date<today();
    return `<div class="task-row ${r.done?"completed":""}"><input type="checkbox" class="task-check" data-reminder-check="${escapeHTML(r.id)}" ${r.done?"checked":""} aria-label="Mark reminder complete"><div class="task-main"><strong>${escapeHTML(r.title)}</strong><small class="${overdue?"red":""}">${overdue?"Overdue · ":""}${escapeHTML(fmtDate(r.date))}${r.time?" · "+escapeHTML(fmtTime(r.time)):""}</small>${r.notes?`<small>${escapeHTML(r.notes)}</small>`:""}</div><div class="task-actions"><button class="mini-action" data-edit-type="reminder" data-id="${escapeHTML(r.id)}" aria-label="Edit reminder">✎</button><button class="mini-action delete" data-delete-type="reminder" data-id="${escapeHTML(r.id)}" aria-label="Delete reminder">×</button></div></div>`;
  }).join(""):emptyState("Your reminders appear here","Add important deadlines, tasks and study milestones.","Add a reminder","reminder");
}

/* ANALYTICS AND CHARTS */
function activityFor(day) {
  const saved=db.activity[day]||{minutes:0,completed:0};
  const sessionMinutes=db.sessions.filter(s=>s.date===day).reduce((sum,s)=>sum+(Number(s.minutes)||0),0);
  return {minutes:Math.max(Number(saved.minutes)||0,sessionMinutes),completed:Number(saved.completed)||0};
}
function weekKeys() {
  return Array.from({length:7},(_,i)=>shiftDate(today(),i-6));
}
function renderChart(id,labels,values) {
  const canvas=$("#"+id);
  if(!canvas || !window.Chart) return;
  if(chartInstances[id]) chartInstances[id].destroy();
  chartInstances[id]=new Chart(canvas,{
    type:"bar",
    data:{
      labels,
      datasets:[{
        label:"Focus minutes",
        data:values,
        backgroundColor:values.map((_,i)=>i===values.length-1?"rgba(73,227,244,.85)":"rgba(161,138,255,.58)"),
        borderColor:values.map((_,i)=>i===values.length-1?COLORS.cyan:COLORS.violet),
        borderWidth:1,
        borderRadius:7,
        maxBarThickness:28
      }]
    },
    options:{
      responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false},tooltip:{backgroundColor:"#10182b",titleColor:"#f2f5ff",bodyColor:"#cbd6eb",borderColor:"#34425e",borderWidth:1}},
      scales:{
        x:{grid:{display:false},ticks:{color:"#8996b2",font:{family:"DM Sans",size:10}},border:{display:false}},
        y:{beginAtZero:true,grid:{color:"rgba(148,169,209,.09)"},ticks:{color:"#8996b2",font:{family:"DM Sans",size:10},precision:0},border:{display:false}}
      }
    }
  });
}
function renderAnalytics() {
  const days=weekKeys();
  const values=days.map(d=>activityFor(d).minutes);
  const totalMinutes=values.reduce((a,b)=>a+b,0);
  const done=db.tasks.filter(t=>t.done).length;
  const chapterDone=db.chapters.filter(c=>c.status==="done").length;
  const weekDone=days.reduce((sum,d)=>sum+activityFor(d).completed,0);
  $("#analyticsStats").innerHTML=[
    ["Focus this week",`${Math.floor(totalMinutes/60)}h ${totalMinutes%60}m`],
    ["Tasks completed",done],
    ["Chapters mastered",chapterDone]
  ].map(([label,value])=>`<article class="stat-card"><div class="stat-top">${escapeHTML(label)}</div><div class="stat-number">${escapeHTML(value)}</div><div class="stat-foot">Based on saved study activity</div></article>`).join("");
  const labels=days.map(d=>parseDate(d).toLocaleDateString("en-IN",{weekday:"short"}));
  renderChart("weeklyChart",labels,values);
  renderChart("analyticsChart",labels,values);
  const groups={};
  db.chapters.forEach(c=>{(groups[c.subject||"General"] ||= []).push(c);});
  $("#subjectProgressList").innerHTML=Object.entries(groups).length?Object.entries(groups).map(([name,items])=>{
    const doneCount=items.filter(c=>c.status==="done").length;
    return `<div class="progress-row"><div class="progress-row-head"><span>${escapeHTML(name)}</span><span>${pct(doneCount,items.length)}%</span></div><div class="subject-progress"><span style="width:${pct(doneCount,items.length)}%"></span></div></div>`;
  }).join(""):emptyState("No syllabus data","Add chapters to see subject-wise progress.");
  $("#insightTitle").textContent=totalMinutes>=300?"Your effort is adding up.":done>=5?"Look at what you've already completed.":"Progress over perfection.";
  $("#insightText").textContent=totalMinutes>=300?`You've logged ${totalMinutes} focus minutes over the last seven days. Keep building a routine that works for you.`:done>=5?`You've completed ${done} tasks. Choose the next small step and keep moving at your own pace.`:"A short, focused session is a useful place to start. Add a task and take your first step.";
  $("#welcomeDate").textContent=new Date().toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long"}).toUpperCase();
  $("#todayLabel").textContent=new Date().toLocaleDateString("en-IN",{day:"numeric",month:"short"});
  $("#dayScore").textContent=`${pct(done,db.tasks.length)}%`;
  $("#statFocus").innerHTML=`${activityFor(today()).minutes} <small>min</small>`;
  $("#focusProgress").style.width=`${Math.min(100,activityFor(today()).minutes/120*100)}%`;
  $("#statTasks").innerHTML=`${done} <small>/ ${db.tasks.length}</small>`;
  $("#taskProgress").style.width=`${pct(done,db.tasks.length)}%`;
  $("#statChapters").textContent=chapterDone;
  $("#chapterProgress").style.width=`${pct(chapterDone,db.chapters.length)}%`;
  $("#statStreak").innerHTML=`${db.streak.count||0} <small>days</small>`;
  $("#streakProgress").style.width=`${Math.min(100,(db.streak.count||0)/7*100)}%`;
}

/* EXPORT */
$("#exportDataBtn").addEventListener("click",()=>{
  const blob=new Blob([JSON.stringify(db,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;
  a.download=`studyx-backup-${today()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast("Your study data backup was exported.");
});

/* RESET */
$("#resetApp").addEventListener("click",()=>{
  if(!confirm("Reset STUDYX? This deletes all saved profile and study data from this browser.")) return;
  if(!confirm("This cannot be undone unless you have an exported backup. Continue?")) return;
  stopTimer();
  localStorage.removeItem(STORAGE_KEY);
  db=blankData();
  location.reload();
});

/* RENDER */
function renderAll() {
  if(!db.profile) return;
  updateProfileUI();
  renderTasks();
  renderExams();
  renderTimetable();
  renderSyllabus();
  renderRevisions();
  renderNotes();
  renderFocusHistory();
  renderGoals();
  renderCalendar();
  renderReminders();
  renderAnalytics();
}

function boot() {
  $("#todayLabel").textContent=new Date().toLocaleDateString("en-IN",{day:"numeric",month:"short"});
  updateTimerDisplay();
  if(db.profile) {
    launchApp();
  } else {
    $("#app").hidden=true;
    $("#onboarding").hidden=false;
    showOnboardingStep(0);
  }
}
boot();
