/* ============================================================
   Smart Study Planner — script.js
   Everything runs in the browser using localStorage, so there is
   no server needed. Structure:
     1. Storage helpers
     2. Auth (sign up / log in / log out)
     3. Task CRUD (add / complete / delete)
     4. Stats + progress ring + streak calculation
     5. Rendering
   ============================================================ */

/* ---------- 1. Storage helpers ---------- */

const DB_USERS = "ssp_users";        // all registered users
const DB_SESSION = "ssp_session";    // currently logged-in user's email
const taskKeyFor = (email) => `ssp_tasks_${email}`;

function getUsers() {
  return JSON.parse(localStorage.getItem(DB_USERS) || "[]");
}
function saveUsers(users) {
  localStorage.setItem(DB_USERS, JSON.stringify(users));
}
function getTasks() {
  const email = getSession();
  return JSON.parse(localStorage.getItem(taskKeyFor(email)) || "[]");
}
function saveTasks(tasks) {
  const email = getSession();
  localStorage.setItem(taskKeyFor(email), JSON.stringify(tasks));
}
function getSession() {
  return localStorage.getItem(DB_SESSION);
}
function setSession(email) {
  localStorage.setItem(DB_SESSION, email);
}
function clearSession() {
  localStorage.removeItem(DB_SESSION);
}

/* A tiny non-cryptographic hash so we don't store raw passwords in
   localStorage. This is fine for a client-only demo project, but a
   real app must hash + verify passwords on a server. */
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString(36);
}

/* ---------- 2. Auth ---------- */

const authScreen = document.getElementById("authScreen");
const dashboard = document.getElementById("dashboard");

const loginForm = document.getElementById("loginForm");
const signupForm = document.getElementById("signupForm");
const loginError = document.getElementById("loginError");
const signupError = document.getElementById("signupError");

// Tab switching between Log in / Sign up
document.querySelectorAll(".auth-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".auth-tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    const isLogin = tab.dataset.tab === "login";
    loginForm.classList.toggle("hidden", !isLogin);
    signupForm.classList.toggle("hidden", isLogin);
    loginError.textContent = "";
    signupError.textContent = "";
  });
});

signupForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = document.getElementById("signupName").value.trim();
  const email = document.getElementById("signupEmail").value.trim().toLowerCase();
  const password = document.getElementById("signupPassword").value;

  const users = getUsers();
  if (users.some((u) => u.email === email)) {
    signupError.textContent = "An account with this email already exists.";
    return;
  }

  users.push({ name, email, passwordHash: simpleHash(password) });
  saveUsers(users);
  setSession(email);
  enterDashboard();
});

loginForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const email = document.getElementById("loginEmail").value.trim().toLowerCase();
  const password = document.getElementById("loginPassword").value;

  const users = getUsers();
  const user = users.find((u) => u.email === email);
  if (!user || user.passwordHash !== simpleHash(password)) {
    loginError.textContent = "Incorrect email or password.";
    return;
  }

  setSession(email);
  enterDashboard();
});

document.getElementById("logoutBtn").addEventListener("click", () => {
  clearSession();
  authScreen.classList.remove("hidden");
  dashboard.classList.add("hidden");
  loginForm.reset();
  signupForm.reset();
});

function enterDashboard() {
  const users = getUsers();
  const user = users.find((u) => u.email === getSession());
  document.getElementById("userGreeting").textContent = `Hi, ${user.name.split(" ")[0]}`;
  authScreen.classList.add("hidden");
  dashboard.classList.remove("hidden");
  renderAll();
}

// If a session already exists (page refresh), skip straight to dashboard
window.addEventListener("DOMContentLoaded", () => {
  if (getSession()) enterDashboard();
  // default the date picker to today
  document.getElementById("taskDate").valueAsDate = new Date();
});

/* ---------- 3. Task CRUD ---------- */

const taskForm = document.getElementById("taskForm");
let currentFilter = "all";

taskForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const title = document.getElementById("taskTitle").value.trim();
  const subject = document.getElementById("taskSubject").value.trim();
  const date = document.getElementById("taskDate").value;
  const priority = document.getElementById("taskPriority").value;

  const tasks = getTasks();
  tasks.unshift({
    id: Date.now().toString(),
    title,
    subject,
    date,
    priority,
    done: false,
    completedOn: null,
  });
  saveTasks(tasks);
  taskForm.reset();
  document.getElementById("taskDate").valueAsDate = new Date();
  renderAll();
});

function toggleTask(id) {
  const tasks = getTasks();
  const task = tasks.find((t) => t.id === id);
  task.done = !task.done;
  task.completedOn = task.done ? new Date().toISOString().slice(0, 10) : null;
  saveTasks(tasks);
  renderAll();
}

function deleteTask(id) {
  const tasks = getTasks().filter((t) => t.id !== id);
  saveTasks(tasks);
  renderAll();
}

document.querySelectorAll(".filter-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    document.querySelectorAll(".filter-chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    currentFilter = chip.dataset.filter;
    renderTasks();
  });
});

/* ---------- 4. Stats, progress ring, streak ---------- */

function updateStats() {
  const tasks = getTasks();
  const total = tasks.length;
  const done = tasks.filter((t) => t.done).length;
  const pending = total - done;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);

  document.getElementById("statTotal").textContent = total;
  document.getElementById("statDone").textContent = done;
  document.getElementById("statPending").textContent = pending;
  document.getElementById("progressPercent").textContent = `${percent}%`;

  const ring = document.getElementById("progressRing");
  const circumference = 264; // 2 * π * r (r = 42)
  ring.style.strokeDashoffset = circumference - (percent / 100) * circumference;

  document.getElementById("statStreak").textContent = calculateStreak(tasks);
}

// Streak = number of consecutive days (ending today or yesterday) that
// have at least one completed task.
function calculateStreak(tasks) {
  const completedDates = new Set(
    tasks.filter((t) => t.done && t.completedOn).map((t) => t.completedOn)
  );
  if (completedDates.size === 0) return 0;

  let streak = 0;
  let cursor = new Date();

  // allow the streak to still "count" if today has no completion yet,
  // as long as yesterday was covered
  if (!completedDates.has(cursor.toISOString().slice(0, 10))) {
    cursor.setDate(cursor.getDate() - 1);
  }

  while (completedDates.has(cursor.toISOString().slice(0, 10))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/* ---------- 5. Rendering ---------- */

function renderTasks() {
  const tasks = getTasks().filter((t) => {
    if (currentFilter === "pending") return !t.done;
    if (currentFilter === "done") return t.done;
    return true;
  });

  const list = document.getElementById("taskList");
  const empty = document.getElementById("emptyState");

  list.innerHTML = "";
  empty.classList.toggle("hidden", tasks.length !== 0);

  tasks
    .sort((a, b) => (a.date > b.date ? 1 : -1))
    .forEach((task) => {
      const card = document.createElement("div");
      card.className = `task-card priority-${task.priority} ${task.done ? "done" : ""}`;
      card.innerHTML = `
        <button class="task-check" title="Mark as ${task.done ? "pending" : "done"}">${task.done ? "✓" : ""}</button>
        <div class="task-body">
          <p class="task-title"></p>
          <div class="task-meta">
            <span class="task-subject-tag"></span>
            <span>📅 ${formatDate(task.date)}</span>
            <span>${priorityLabel(task.priority)}</span>
          </div>
        </div>
        <button class="task-delete" title="Delete task">✕</button>
      `;
      // set text via textContent to avoid any HTML injection from user input
      card.querySelector(".task-title").textContent = task.title;
      card.querySelector(".task-subject-tag").textContent = task.subject;

      card.querySelector(".task-check").addEventListener("click", () => toggleTask(task.id));
      card.querySelector(".task-delete").addEventListener("click", () => deleteTask(task.id));

      list.appendChild(card);
    });
}

function priorityLabel(priority) {
  const map = { high: "🔴 High", medium: "🟠 Medium", low: "🟢 Low" };
  return map[priority] || "";
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function renderAll() {
  updateStats();
  renderTasks();
}