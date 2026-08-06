const SUPABASE_URL = "https://wuvxguynyashxnwtcakr.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_FFSmPYwNjc0CKQz4fRplWQ_r0pAylSi";
const PRODUCTION_URL = "https://mia-003.github.io/meal-journal-agent-lab/";

const client = window.supabase?.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

const state = { session: null, report: null, history: [], busy: false };
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const nutrientMeta = {
  protein: ["蛋白质", "#214b39"],
  carbohydrates: ["碳水", "#4c7880"],
  fiber: ["膳食纤维", "#7da04e"],
  fat: ["脂肪", "#b77949"],
  vitamins: ["维生素/多样性", "#8a7351"],
};

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[char]);
}

function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove("show"), 2600);
}

function mondayFor(date = new Date()) {
  const local = new Date(date);
  local.setHours(12, 0, 0, 0);
  const day = local.getDay() || 7;
  local.setDate(local.getDate() - day + 1);
  return local.toISOString().slice(0, 10);
}

function addDays(isoDate, days) {
  const value = new Date(`${isoDate}T12:00:00`);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

function displayDate(isoDate) {
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" })
    .format(new Date(`${isoDate}T12:00:00`));
}

function weekLabel(weekStart) {
  return `${displayDate(weekStart)} — ${displayDate(addDays(weekStart, 6))}`;
}

function formatTime(iso) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));
}

function setView(id) {
  $$(".view").forEach((view) => view.classList.toggle("active", view.id === id));
  $$(".nav-item").forEach((button) => {
    const active = button.dataset.view === id;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function updateWeekHeading() {
  const weekStart = mondayFor();
  const start = new Date(`${weekStart}T12:00:00`);
  const weekNumber = Math.ceil((((start - new Date(start.getFullYear(), 0, 1)) / 86400000) + new Date(start.getFullYear(), 0, 1).getDay() + 1) / 7);
  $("#weekCode").textContent = `${start.getFullYear()} · W${String(weekNumber).padStart(2, "0")}`;
  $("#weekRange").textContent = `${weekLabel(weekStart)} · 周报会在每周首次打开时自动检查更新`;
}

function updateAuthUi(session) {
  state.session = session;
  const permanent = Boolean(session?.user?.email && !session.user.is_anonymous);
  $("#profileButton").classList.toggle("logged-in", permanent);
  $("#profileLabel").textContent = permanent ? session.user.email : "未登录";
  $("#authNotice").hidden = permanent;
  $("#generateButton").disabled = !permanent || state.busy;
  $("#signOutButton").hidden = !permanent;
  if (permanent) $("#authStatus").textContent = `已登录：${session.user.email}`;
  return permanent;
}

function setBusy(busy, detail = "汇总热量与花费…") {
  state.busy = busy;
  $("#reportStatus").hidden = !busy;
  $("#statusDetail").textContent = detail;
  $("#generateButton").disabled = busy || !state.session?.user?.email;
  $("#generateButton span:last-child").textContent = busy ? "分析中…" : "重新生成本周报告";
}

function percentDelta(current, previous, suffix = "%") {
  if (!previous && !current) return "与上周持平";
  if (!previous) return "本周开始形成可对比数据";
  const delta = Math.round(((current - previous) / previous) * 100);
  if (!delta) return "与上周基本持平";
  return `较上周${delta > 0 ? "增加" : "减少"} ${Math.abs(delta)}${suffix}`;
}

function normalizeReport(rowOrReport) {
  if (!rowOrReport) return null;
  return rowOrReport.report_data ? { ...rowOrReport.report_data, id: rowOrReport.id } : rowOrReport;
}

function renderReport(input) {
  const report = normalizeReport(input);
  if (!report?.metrics) return;
  state.report = report;
  const metrics = report.metrics;
  const previous = report.previous_metrics || {};
  const daily = Array.isArray(report.daily) ? report.daily : [];
  const nutrition = report.nutrition || {};

  $("#emptyReport").hidden = true;
  $("#reportContent").hidden = false;
  $("#totalKcal").textContent = Number(metrics.total_kcal || 0).toLocaleString("zh-CN");
  $("#totalCost").textContent = Number(metrics.total_cost || 0).toFixed(2);
  $("#loggedDays").textContent = metrics.logged_days || 0;
  $("#recordCount").textContent = `${metrics.meal_count || 0} 餐记录`;
  $("#kcalDelta").textContent = percentDelta(metrics.total_kcal || 0, previous.total_kcal || 0);
  $("#costDelta").textContent = percentDelta(metrics.total_cost || 0, previous.total_cost || 0);
  $("#costAverage").textContent = metrics.meal_count ? `餐均 ¥${(metrics.total_cost / metrics.meal_count).toFixed(1)}` : "暂无餐均数据";

  const maxKcal = Math.max(1, ...daily.map((day) => Number(day.kcal || 0)));
  $("#calorieBars").innerHTML = daily.map((day) => `<i style="height:${Math.max(7, (day.kcal / maxKcal) * 100)}%"></i>`).join("");
  $("#dayDots").innerHTML = daily.map((day) => `<i class="${day.meals ? "on" : ""}" title="${escapeHtml(day.label)}：${day.meals || 0} 餐"></i>`).join("");

  const levels = nutrition.levels || {};
  $("#nutritionConfidence").textContent = `估算可信度 ${nutrition.confidence === "high" ? "较高" : nutrition.confidence === "medium" ? "中等" : "较低"}`;
  $("#nutrientList").innerHTML = Object.entries(nutrientMeta).map(([key, [label, color]]) => {
    const item = levels[key] || { score: 0, label: "待分析" };
    const score = Math.min(100, Math.max(0, Number(item.score || 0)));
    return `<div class="nutrient-row"><b>${label}</b><div class="nutrient-track"><i style="--score:${score}%;--bar-color:${color}"></i></div><span>${escapeHtml(item.label || "待分析")}</span></div>`;
  }).join("");

  const insights = Array.isArray(report.insights) ? report.insights : [];
  $("#briefing").innerHTML = insights.length
    ? insights.slice(0, 3).map((item, index) => `<div class="brief-item"><span>0${index + 1}</span><div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.detail)}</p></div></div>`).join("")
    : `<div class="brief-item"><span>01</span><div><strong>还需要更多记录</strong><p>至少记录 3 餐后，Agent 才能给出更有依据的观察。</p></div></div>`;

  const maxCost = Math.max(1, ...daily.map((day) => Number(day.cost || 0)));
  $("#trendChart").innerHTML = daily.map((day) => `<div class="trend-day"><i class="kcal" style="--kcal:${Math.max(day.kcal ? 3 : 0, (day.kcal / maxKcal) * 100)}%" title="${day.kcal} kcal"></i><i class="cost" style="--cost:${Math.max(day.cost ? 3 : 0, (day.cost / maxCost) * 100)}%" title="¥${Number(day.cost).toFixed(2)}"></i><b>${escapeHtml(day.label)}</b></div>`).join("");
  $("#generatedNote").textContent = `报告生成于 ${formatTime(report.generated_at)} · 原始记录只读`;
}

function renderHistory(rows) {
  state.history = rows || [];
  if (!rows?.length) {
    $("#historyList").innerHTML = `<div class="empty-list">还没有历史周报。生成本周报告后会自动保存在这里。</div>`;
    return;
  }
  $("#historyList").innerHTML = rows.map((row, index) => {
    const report = normalizeReport(row);
    const summary = report.summary || report.insights?.[0]?.title || "这一周的饮食观察";
    return `<article class="history-item" tabindex="0" data-history-index="${index}"><time>${weekLabel(row.week_start)}</time><div><strong>${escapeHtml(summary)}</strong><p>${row.source_record_count || report.metrics?.meal_count || 0} 餐记录 · 生成于 ${formatTime(row.generated_at)}</p></div><div class="history-stats"><span><b>${Number(report.metrics?.total_kcal || 0).toLocaleString("zh-CN")}</b><small>KCAL</small></span><span><b>¥${Number(report.metrics?.total_cost || 0).toFixed(0)}</b><small>SPEND</small></span></div></article>`;
  }).join("");
}

async function loadHistory() {
  if (!state.session) return;
  const { data, error } = await client.from("agent_weekly_reports")
    .select("id,week_start,report_data,source_record_count,generated_at")
    .order("week_start", { ascending: false }).limit(20);
  if (error) throw error;
  renderHistory(data || []);
  const current = data?.find((row) => row.week_start === mondayFor());
  if (current) renderReport(current);
  return current;
}

async function generateReport(force = false) {
  if (!state.session || state.busy) return;
  setBusy(true, "读取本周与上周饮食记录…");
  try {
    window.setTimeout(() => state.busy && $("#statusDetail") && ($("#statusDetail").textContent = "分析营养结构并形成建议…"), 900);
    const { data, error } = await client.functions.invoke("agent-weekly-report", {
      body: { week_start: mondayFor(), timezone_offset_minutes: -new Date().getTimezoneOffset(), force },
    });
    if (error) throw error;
    if (!data?.report) throw new Error(data?.message || "报告内容为空");
    renderReport(data.report);
    await loadHistory();
    toast(data.cached ? "已读取本周报告" : "本周报告已生成");
  } catch (error) {
    console.error(error);
    toast("报告生成失败。请确认新的数据库脚本与 Edge Function 已部署。 ");
  } finally {
    setBusy(false);
  }
}

async function sendLoginLink(event) {
  event.preventDefault();
  const email = $("#emailInput").value.trim();
  const status = $("#authStatus");
  status.classList.remove("error");
  status.textContent = "正在发送…";
  const redirectTo = location.protocol.startsWith("http") ? `${location.origin}${location.pathname}` : PRODUCTION_URL;
  const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo, shouldCreateUser: true } });
  if (error) {
    status.classList.add("error");
    status.textContent = error.status === 429 ? "发送次数过多，请稍后再试；已登录的设备不会因此退出。" : `发送失败：${error.message}`;
    return;
  }
  status.textContent = "登录邮件已发送。请在同一浏览器打开邮件中的链接。";
}

function appendMessage(role, text, pending = false) {
  const message = document.createElement("div");
  message.className = `message ${role}`;
  message.innerHTML = `<span class="message-author">${role === "agent" ? "MIA AGENT" : "YOU"}</span><p>${escapeHtml(text)}</p>`;
  if (pending) message.dataset.pending = "true";
  $("#messages").append(message);
  $("#messages").scrollTop = $("#messages").scrollHeight;
  return message;
}

async function askAgent(event) {
  event.preventDefault();
  const input = $("#chatInput");
  const question = input.value.trim();
  if (!question) return;
  if (!state.session) return toast("请先登录饮食记录账户");
  appendMessage("user", question);
  input.value = "";
  const pending = appendMessage("agent", "正在核对周报和相关记录…", true);
  try {
    const { data, error } = await client.functions.invoke("agent-chat", {
      body: { question, week_start: state.report?.week_start || mondayFor() },
    });
    if (error) throw error;
    pending.querySelector("p").textContent = data?.answer || "暂时没有得到有效回答。";
  } catch (error) {
    console.error(error);
    pending.querySelector("p").textContent = "这次回答失败了。请确认 agent-chat 已部署，或稍后再试。";
  } finally {
    delete pending.dataset.pending;
  }
}

async function initialize() {
  updateWeekHeading();
  if (!client) return toast("Supabase 客户端加载失败，请刷新页面");
  const { data: { session } } = await client.auth.getSession();
  const loggedIn = updateAuthUi(session);
  if (loggedIn) {
    try {
      const current = await loadHistory();
      if (!current) await generateReport(false);
    } catch (error) {
      console.error(error);
      toast("暂时无法读取 Agent 周报，请检查数据库配置");
    }
  }
  client.auth.onAuthStateChange(async (event, nextSession) => {
    const permanent = updateAuthUi(nextSession);
    if (event === "SIGNED_IN" && permanent) {
      $("#authDialog").close();
      try {
        const current = await loadHistory();
        if (!current) await generateReport(false);
      } catch (error) {
        console.error(error);
      }
    }
    if (event === "SIGNED_OUT") {
      state.report = null;
      $("#reportContent").hidden = true;
      $("#emptyReport").hidden = false;
      renderHistory([]);
    }
  });
}

$$(".nav-item").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
$$("[data-view-jump]").forEach((button) => button.addEventListener("click", () => setView(button.dataset.viewJump)));
$$("[data-open-auth]").forEach((button) => button.addEventListener("click", () => $("#authDialog").showModal()));
$("#profileButton").addEventListener("click", () => $("#authDialog").showModal());
$("#generateButton").addEventListener("click", () => generateReport(true));
$("#authForm").addEventListener("submit", sendLoginLink);
$("#signOutButton").addEventListener("click", async () => { await client.auth.signOut(); $("#authDialog").close(); });
$("#chatForm").addEventListener("submit", askAgent);
$("#promptChips").addEventListener("click", (event) => {
  if (event.target.matches("button")) { $("#chatInput").value = event.target.textContent; $("#chatInput").focus(); }
});
$("#historyList").addEventListener("click", (event) => {
  const item = event.target.closest("[data-history-index]");
  if (!item) return;
  renderReport(state.history[Number(item.dataset.historyIndex)]);
  setView("overview");
});
$("#historyList").addEventListener("keydown", (event) => {
  if ((event.key === "Enter" || event.key === " ") && event.target.matches("[data-history-index]")) event.target.click();
});

initialize();
