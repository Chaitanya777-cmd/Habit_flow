
"use strict";

const $ = (id) => document.getElementById(id);

const STORAGE_KEY = "habitflow-habits";
const THEME_KEY = "habitflow-theme";

const habitList = $("habitList");
const allHabitsList = $("allHabitsList");
const emptyMessage = $("emptyMessage");
const allHabitsEmpty = $("allHabitsEmpty");
const selectedDateInput = $("selectedDate");
const habitModal = $("habitModal");
const habitForm = $("habitForm");
const habitNameInput = $("habitName");
const habitCategoryInput = $("habitCategory");
const habitTargetInput = $("habitTarget");

let habits = loadHabits();
let selectedDate = todayKey();
let calendarDate = new Date();
calendarDate.setDate(1);

let editingHabitId = null;
let activePage = "dashboard";
let weeklyChart = null;
let monthlyChart = null;
let analyticsWeeklyChart = null;
let toastTimer = null;

function pad(number) {
  return String(number).padStart(2, "0");
}

function dateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function todayKey() {
  return dateKey(new Date());
}

function parseDate(key) {
  const parts = key.split("-").map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function addDays(key, amount) {
  const date = parseDate(key);
  date.setDate(date.getDate() + amount);
  return dateKey(date);
}

function formatDate(key, options = { day: "numeric", month: "short" }) {
  return parseDate(key).toLocaleDateString("en-IN", options);
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function makeId() {
  return window.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function loadHabits() {
  let saved;

  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch (error) {
    console.error("Could not read saved habits:", error);
    saved = [];
  }

  if (!Array.isArray(saved)) return [];

  let migrated = false;

  const result = saved.map(oldHabit => {
    const habit = { ...oldHabit };

    // Migrate older HabitFlow versions without losing their completion.
    if (!habit.completions || typeof habit.completions !== "object") {
      habit.completions = {};

      if (habit.date && habit.completed) {
        habit.completions[habit.date] = true;
      }

      migrated = true;
    }

    if (!habit.id) {
      habit.id = makeId();
      migrated = true;
    }

    if (!habit.createdAt) {
      habit.createdAt = habit.date || todayKey();
      migrated = true;
    }

    if (!habit.category) {
      habit.category = "Personal";
      migrated = true;
    }

    if (!Number.isFinite(Number(habit.targetMinutes)) ||
        Number(habit.targetMinutes) < 1) {
      habit.targetMinutes = 30;
      migrated = true;
    }

    habit.name = String(habit.name || "Untitled habit");
    habit.targetMinutes = Number(habit.targetMinutes);
    habit.completions = habit.completions || {};

    delete habit.date;
    delete habit.completed;

    return habit;
  });

  if (migrated) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(result));
    } catch (error) {
      console.error("Could not save migrated data:", error);
    }
  }

  return result;
}

function saveHabits() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(habits));
    return true;
  } catch (error) {
    console.error("Could not save habits:", error);
    showToast("Unable to save data. Check browser storage.");
    return false;
  }
}

function isActiveOn(habit, date) {
  return habit.createdAt <= date;
}

function habitsForDate(date) {
  return habits.filter(habit => isActiveOn(habit, date));
}

function isCompleted(habit, date) {
  return habit.completions?.[date] === true;
}

function completionStats(date) {
  const dayHabits = habitsForDate(date);
  const completed = dayHabits.filter(habit => isCompleted(habit, date)).length;

  return {
    total: dayHabits.length,
    completed,
    rate: dayHabits.length ? Math.round(completed / dayHabits.length * 100) : 0
  };
}

function successfulDay(date) {
  const stats = completionStats(date);
  return stats.total > 0 && stats.completed === stats.total;
}

function getStreaks() {
  const today = todayKey();
  let current = 0;
  let cursor = today;

  // A streak is consecutive days on which all active habits were completed.
  while (successfulDay(cursor)) {
    current++;
    cursor = addDays(cursor, -1);
  }

  let best = 0;
  let running = 0;
  const earliest = habits.reduce(
    (min, habit) => habit.createdAt < min ? habit.createdAt : min,
    today
  );

  for (let day = earliest; day <= today; day = addDays(day, 1)) {
    if (successfulDay(day)) {
      running++;
      best = Math.max(best, running);
    } else {
      running = 0;
    }
  }

  return { current, best };
}

function categoryIcon(category) {
  const icons = {
    Learning: "📚",
    Fitness: "💪",
    Health: "🌿",
    Mindfulness: "🧘",
    Productivity: "⚡",
    Personal: "✨"
  };

  return icons[category] || "✦";
}

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

function renderHabitRow(habit, date, showDateActions = false) {
  const done = isCompleted(habit, date);
  const safeName = escapeHTML(habit.name);
  const safeCategory = escapeHTML(habit.category);
  const safeId = escapeHTML(habit.id);

  return `
    <div class="habit-row ${done ? "is-done" : ""}">
      <input class="habit-check" type="checkbox"
        data-action="toggle" data-id="${safeId}" data-date="${date}"
        aria-label="Mark ${safeName} complete" ${done ? "checked" : ""}>
      <div class="habit-icon">${categoryIcon(habit.category)}</div>
      <div class="habit-copy">
        <div class="habit-name">${safeName}</div>
        <div class="habit-meta">
          <span>${safeCategory}</span>
          <span>·</span>
          <span>${habit.targetMinutes} min/day</span>
          ${showDateActions ? `<span>· ${formatDate(habit.createdAt, {day:"numeric",month:"short",year:"numeric"})} start</span>` : ""}
        </div>
      </div>
      ${showDateActions ? `
        <div class="habit-actions">
          <button class="small-action" data-action="edit" data-id="${safeId}">Edit</button>
          <button class="small-action delete" data-action="delete" data-id="${safeId}">Delete</button>
        </div>` : ""}
    </div>`;
}

function renderDailyHabits() {
  const dayHabits = habitsForDate(selectedDate);
  const stats = completionStats(selectedDate);

  $("daySummary").textContent =
    selectedDate === todayKey() ? "Your daily checklist" : formatDate(selectedDate, {weekday:"long", day:"numeric", month:"long"});

  $("dayCount").textContent = `${stats.completed} / ${stats.total} done`;

  habitList.innerHTML = dayHabits
    .map(habit => renderHabitRow(habit, selectedDate, false))
    .join("");

  emptyMessage.hidden = dayHabits.length > 0;

  $("progressStat").textContent = `${stats.rate}%`;
  $("progressBar").style.width = `${stats.rate}%`;
  $("completedStat").innerHTML = `${stats.completed} <small>/ ${stats.total}</small>`;

  $("progressFoot").textContent = stats.total === 0
    ? "Add a habit to begin"
    : stats.rate === 100
      ? "Amazing! Every habit is complete."
      : `${stats.total - stats.completed} habit${stats.total - stats.completed === 1 ? "" : "s"} left to go`;

  const streaks = getStreaks();
  $("streakStat").innerHTML = `${streaks.current} <small>days</small>`;
  $("bestStreakStat").innerHTML = `${streaks.best} <small>days</small>`;
}

function renderAllHabits() {
  allHabitsList.innerHTML = habits
    .map(habit => renderHabitRow(habit, todayKey(), true))
    .join("");

  allHabitsEmpty.hidden = habits.length > 0;
  $("habitTotalBadge").textContent = `${habits.length} HABIT${habits.length === 1 ? "" : "S"}`;
  $("activeStat").textContent = habits.length;
}

function lastSevenDays() {
  const today = todayKey();
  return Array.from({ length: 7 }, (_, index) => addDays(today, index - 6));
}

function rateForDay(date) {
  return completionStats(date).rate;
}

function average(numbers) {
  return numbers.length
    ? Math.round(numbers.reduce((sum, value) => sum + value, 0) / numbers.length)
    : 0;
}

function chartDefaults() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 350 },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "#17213a",
        titleColor: "#ffffff",
        bodyColor: "#dbe4ff",
        padding: 11,
        cornerRadius: 8
      }
    },
    scales: {
      x: {
        grid: { display: false },
        border: { display: false },
        ticks: { color: "#91a0bb", maxRotation: 0 }
      },
      y: {
        min: 0,
        max: 100,
        grid: { color: "rgba(145,160,187,.12)" },
        border: { display: false },
        ticks: {
          color: "#91a0bb",
          stepSize: 25,
          callback: value => `${value}%`
        }
      }
    }
  };
}

function destroyChart(chart) {
  if (chart) chart.destroy();
}

function renderWeeklyChart(canvasId, previousChart) {
  if (typeof Chart === "undefined") return previousChart;

  destroyChart(previousChart);

  const days = lastSevenDays();
  const rates = days.map(rateForDay);
  const canvas = $(canvasId);

  if (!canvas) return null;

  return new Chart(canvas, {
    type: "bar",
    data: {
      labels: days.map(day => formatDate(day, { weekday: "short" })),
      datasets: [{
        label: "Completion rate",
        data: rates,
        backgroundColor: days.map(day =>
          day === todayKey() ? "#a78bfa" : "#6f5acb"
        ),
        borderRadius: 7,
        borderSkipped: false,
        maxBarThickness: 34
      }]
    },
    options: {
      ...chartDefaults(),
      scales: {
        ...chartDefaults().scales,
        x: { ...chartDefaults().scales.x },
        y: { ...chartDefaults().scales.y }
      }
    }
  });
}

function renderMonthlyChart() {
  if (typeof Chart === "undefined") return;

  destroyChart(monthlyChart);

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const dates = Array.from({ length: daysInMonth }, (_, index) =>
    dateKey(new Date(year, month, index + 1))
  ).filter(day => day <= todayKey());

  $("monthBadge").textContent = now.toLocaleDateString("en-IN", {
    month: "long", year: "numeric"
  }).toUpperCase();

  monthlyChart = new Chart($("monthlyChart"), {
    type: "line",
    data: {
      labels: dates.map(day => parseDate(day).getDate()),
      datasets: [{
        label: "Completion rate",
        data: dates.map(rateForDay),
        borderColor: "#a78bfa",
        backgroundColor: "rgba(139,92,246,.13)",
        fill: true,
        tension: .35,
        borderWidth: 2,
        pointRadius: dates.length > 20 ? 1 : 3,
        pointHoverRadius: 5,
        pointBackgroundColor: "#c4b5fd",
        spanGaps: false
      }]
    },
    options: {
      ...chartDefaults(),
      scales: {
        ...chartDefaults().scales,
        x: {
          ...chartDefaults().scales.x,
          title: { display: true, text: "Day of month", color: "#91a0bb" }
        }
      }
    }
  });
}

function renderAnalytics() {
  const dates = lastSevenDays();
  const rates = dates.map(rateForDay);

  $("weeklyAverage").textContent = `${average(rates)}% average`;

  let totalCompletions = 0;
  let possibleCompletions = 0;

  habits.forEach(habit => {
    Object.entries(habit.completions || {}).forEach(([date, completed]) => {
      if (completed === true && date <= todayKey()) totalCompletions++;
    });

    const start = habit.createdAt > addDays(todayKey(), -365)
      ? habit.createdAt
      : addDays(todayKey(), -365);

    for (let date = start; date <= todayKey(); date = addDays(date, 1)) {
      possibleCompletions++;
    }
  });

  $("allTimeStat").textContent = totalCompletions;
  $("overallStat").textContent = `${possibleCompletions
    ? Math.round(totalCompletions / possibleCompletions * 100)
    : 0}%`;

  if (typeof Chart !== "undefined" && $("analyticsWeeklyChart")) {
    analyticsWeeklyChart = renderWeeklyChart(
      "analyticsWeeklyChart",
      analyticsWeeklyChart
    );
  }

  const performance = habits.map(habit => {
    let eligible = 0;
    let completed = 0;
    const start = habit.createdAt > addDays(todayKey(), -365)
      ? habit.createdAt
      : addDays(todayKey(), -365);

    for (let date = start; date <= todayKey(); date = addDays(date, 1)) {
      eligible++;
      if (isCompleted(habit, date)) completed++;
    }

    return {
      name: habit.name,
      rate: eligible ? Math.round(completed / eligible * 100) : 0
    };
  });

  $("habitPerformance").innerHTML = performance.length
    ? performance.map(item => `
      <div class="performance-row">
        <div class="performance-name">${escapeHTML(item.name)}</div>
        <div class="performance-bar"><span style="width:${item.rate}%"></span></div>
        <div class="performance-percent">${item.rate}%</div>
      </div>`).join("")
    : `<div class="empty-state"><h3>No analytics yet</h3><p>Add habits to see your performance.</p></div>`;
}

function dayHeatLevel(date) {
  const stats = completionStats(date);
  if (!stats.total || !stats.completed) return 0;
  return Math.min(4, Math.ceil(stats.rate / 25));
}

function renderCalendar() {
  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const offset = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  $("calendarMonth").textContent = calendarDate.toLocaleDateString("en-IN", {
    month: "long", year: "numeric"
  });

  const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  let html = labels.map(label =>
    `<div class="heatmap-day-label">${label}</div>`
  ).join("");

  for (let index = 0; index < offset; index++) {
    html += `<button class="heat-cell" disabled aria-hidden="true"></button>`;
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const key = dateKey(new Date(year, month, day));
    const future = key > todayKey();
    const level = future ? 0 : dayHeatLevel(key);
    const stats = completionStats(key);

    html += `
      <button class="heat-cell h${level} ${key === selectedDate ? "selected" : ""}"
        data-calendar-date="${key}" ${future ? "disabled" : ""}
        title="${formatDate(key, {day:"numeric",month:"long",year:"numeric"})}: ${stats.completed}/${stats.total} completed"
        aria-label="${key}, ${stats.completed} of ${stats.total} completed">
        ${day}
      </button>`;
  }

  $("heatmapGrid").innerHTML = html;
  renderCalendarDayDetails();
}

function renderCalendarDayDetails() {
  const stats = completionStats(selectedDate);
  $("calendarSelectedLabel").textContent =
    `${formatDate(selectedDate, { weekday:"long", day:"numeric", month:"long", year:"numeric" })} — ${stats.completed}/${stats.total} completed`;

  const dayHabits = habitsForDate(selectedDate);

  $("calendarDayDetails").innerHTML = dayHabits.length
    ? dayHabits.map(habit => `
      <div class="habit-row ${isCompleted(habit, selectedDate) ? "is-done" : ""}">
        <span class="habit-icon">${categoryIcon(habit.category)}</span>
        <div class="habit-copy">
          <div class="habit-name">${escapeHTML(habit.name)}</div>
          <div class="habit-meta">${escapeHTML(habit.category)}</div>
        </div>
        <span>${isCompleted(habit, selectedDate) ? "✓ Done" : "Not done"}</span>
      </div>`).join("")
    : `<div class="empty-state"><p>No habits were scheduled on this date.</p></div>`;
}

function renderHeader() {
  const today = new Date();

  $("headerDate").textContent = today.toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric"
  });

  $("welcomeDate").textContent = today.toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
  }).toUpperCase();

  selectedDateInput.value = selectedDate;
  selectedDateInput.max = todayKey();
}

function renderAll() {
  renderHeader();
  renderDailyHabits();
  renderAllHabits();
  renderMonthlyChart();
  renderAnalytics();
  renderCalendar();
}

function openModal(habit = null) {
  editingHabitId = habit ? habit.id : null;
  habitForm.reset();

  $("modalTitle").textContent = habit ? "Edit habit" : "Create a habit";
  $("saveHabitButton").textContent = habit ? "Save changes" : "Save habit";
  
$("calendarDayDetails").addEventListener("change", handleHabitAction);
$("calendarDayDetails").addEventListener("click", handleHabitAction);


  if (habit) {
    habitNameInput.value = habit.name;
    habitCategoryInput.value = habit.category;
    habitTargetInput.value = habit.targetMinutes;
  } else {
    habitCategoryInput.value = "Learning";
    habitTargetInput.value = 30;
  }

  habitModal.hidden = false;
  habitNameInput.focus();
}

function closeModal() {
  habitModal.hidden = true;
  editingHabitId = null;
}

function addOrEditHabit(event) {
  event.preventDefault();

  const name = habitNameInput.value.trim();
  const category = habitCategoryInput.value;
  const targetMinutes = Number(habitTargetInput.value);

  if (!name) {
    showToast("Please enter a habit name.");
    return;
  }

  if (!Number.isFinite(targetMinutes) || targetMinutes < 1 || targetMinutes > 1440) {
    showToast("Target must be between 1 and 1440 minutes.");
    return;
  }

  if (editingHabitId !== null) {
    const habit = habits.find(item => item.id === editingHabitId);
    if (!habit) return;

    habit.name = name;
    habit.category = category;
    habit.targetMinutes = targetMinutes;
    showToast("Habit updated successfully.");
  } else {
    habits.push({
      id: makeId(),
      name,
      category,
      targetMinutes,
      createdAt: todayKey(),
      completions: {}
    });
    showToast("New habit added. Keep going!");
  }

  if (!saveHabits()) return;

  closeModal();
  renderAll();
}

function deleteHabit(id) {
  const habit = habits.find(item => item.id === id);
  if (!habit) return;

  const confirmed = window.confirm(
    `Delete "${habit.name}" and its saved completion history?`
  );

  if (!confirmed) return;

  habits = habits.filter(item => item.id !== id);

  if (saveHabits()) {
    renderAll();
    showToast("Habit deleted.");
  }
}

function handleHabitAction(event) {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const control = target.closest("[data-action]");
  if (!control) return;

  const id = control.dataset.id;
 const action = control.dataset.action;

// Checkbox changes should be handled only once.
if (action === "toggle" && event.type !== "change") return;

if (action === "toggle") {
    const date = control.dataset.date;
    const habit = habits.find(item => String(item.id) === String(id));
    if (!habit || !date || date > todayKey()) return;

    const previous = habit.completions[date] === true;
    if (previous) {
      delete habit.completions[date];
    } else {
      habit.completions[date] = true;
    }

    if (saveHabits()) {
      renderAll();
      showToast(previous ? "Completion unchecked." : "Great job! Habit completed.");
    } else {
      if (previous) habit.completions[date] = true;
      else delete habit.completions[date];
    }

    return;
  }

  if (action === "edit") {
    const habit = habits.find(item => String(item.id) === String(id));
    if (habit) openModal(habit);
  }

  if (action === "delete") deleteHabit(id);
}

function navigateTo(page) {
  const allowed = ["dashboard", "habits", "analytics", "calendar"];
  if (!allowed.includes(page)) page = "dashboard";

  activePage = page;

  document.querySelectorAll(".page").forEach(section => {
    section.classList.toggle("active", section.id === `page-${page}`);
  });

  document.querySelectorAll("[data-page]").forEach(button => {
    button.classList.toggle("active", button.dataset.page === page);
  });

  $("sidebar").classList.remove("open");

  if (page === "analytics") {
    renderAnalytics();
  }

  if (page === "calendar") {
    renderCalendar();
  }

  if (page === "dashboard") {
    renderMonthlyChart();
    weeklyChart = renderWeeklyChart("weeklyChart", weeklyChart);
  }
}

function applyTheme(theme) {
  document.body.classList.toggle("light-theme", theme === "light");
  document.documentElement.style.colorScheme = theme === "light" ? "light" : "dark";
  $("themeToggle").textContent = theme === "light" ? "☾" : "☼";
}

function toggleTheme() {
  const nextTheme = document.body.classList.contains("light-theme")
    ? "dark"
    : "light";

  localStorage.setItem(THEME_KEY, nextTheme);
  applyTheme(nextTheme);
}

function attachEvents() {
  document.querySelectorAll("[data-page]").forEach(button => {
    button.addEventListener("click", event => {
      event.preventDefault();
      navigateTo(button.dataset.page);
    });
  });

  $("quickAdd").addEventListener("click", () => openModal());
  $("emptyAdd").addEventListener("click", () => openModal());
  $("habitsAdd").addEventListener("click", () => openModal());

  $("closeModal").addEventListener("click", closeModal);
  $("cancelModal").addEventListener("click", closeModal);
  habitForm.addEventListener("submit", addOrEditHabit);

  habitModal.addEventListener("click", event => {
    if (event.target === habitModal) closeModal();
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      closeModal();
      $("sidebar").classList.remove("open");
    }
  });

  habitList.addEventListener("change", handleHabitAction);
  habitList.addEventListener("click", handleHabitAction);
  allHabitsList.addEventListener("change", handleHabitAction);
  allHabitsList.addEventListener("click", handleHabitAction);

  selectedDateInput.addEventListener("change", () => {
    if (!selectedDateInput.value) return;

    if (selectedDateInput.value > todayKey()) {
      selectedDateInput.value = todayKey();
      showToast("Future dates cannot be completed yet.");
    }

    selectedDate = selectedDateInput.value;
    renderDailyHabits();
  });

  $("prevMonth").addEventListener("click", () => {
    calendarDate.setMonth(calendarDate.getMonth() - 1);
    renderCalendar();
  });

  $("nextMonth").addEventListener("click", () => {
    const candidate = new Date(calendarDate);
    candidate.setMonth(candidate.getMonth() + 1);

    if (candidate.getFullYear() > new Date().getFullYear() ||
        (candidate.getFullYear() === new Date().getFullYear() &&
         candidate.getMonth() > new Date().getMonth())) {
      showToast("Future months are not available yet.");
      return;
    }

    calendarDate = candidate;
    renderCalendar();
  });

  $("heatmapGrid").addEventListener("click", event => {
    const button = event.target.closest("[data-calendar-date]");
    if (!button || button.disabled) return;

    selectedDate = button.dataset.calendarDate;
    selectedDateInput.value = selectedDate;
    renderDailyHabits();
    renderCalendar();
  });

  $("themeToggle").addEventListener("click", toggleTheme);

  $("menuToggle").addEventListener("click", () => {
    $("sidebar").classList.toggle("open");
  });

  document.addEventListener("click", event => {
    if (window.innerWidth > 700) return;

    const sidebar = $("sidebar");
    const toggle = $("menuToggle");

    if (!sidebar.contains(event.target) && !toggle.contains(event.target)) {
      sidebar.classList.remove("open");
    }
  });
}

function startApp() {
  selectedDate = todayKey();

  // Preserve the user's previous light/dark preference.
  const savedTheme = localStorage.getItem(THEME_KEY) || "dark";
  applyTheme(savedTheme);

  attachEvents();
  renderAll();

  weeklyChart = renderWeeklyChart("weeklyChart", weeklyChart);

  if (typeof Chart === "undefined") {
    showToast("Charts need an internet connection to load.");
  }
}

startApp();
