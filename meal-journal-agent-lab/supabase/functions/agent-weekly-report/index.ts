import { corsHeaders, isAllowedOrigin, json, requestOrigin } from "../_shared/http.ts";
import { requirePermanentUser, userClient } from "../_shared/auth.ts";
import { deepSeekJson } from "../_shared/deepseek.ts";

type Meal = {
  meal_type: string;
  description: string;
  estimated_kcal: number;
  cost: number | string;
  eaten_at: string;
  updated_at: string;
};

const dayNames = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

function validWeekStart(value: unknown) {
  const text = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error("INVALID_WEEK_START");
  return text;
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function boundary(date: string, offsetMinutes: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) - offsetMinutes * 60000).toISOString();
}

function localDate(iso: string, offsetMinutes: number) {
  return new Date(new Date(iso).getTime() + offsetMinutes * 60000).toISOString().slice(0, 10);
}

function metricsFor(meals: Meal[], weekStart: string, offsetMinutes: number) {
  const daily = Array.from({ length: 7 }, (_, index) => ({
    date: addDays(weekStart, index), label: dayNames[index], kcal: 0, cost: 0, meals: 0,
  }));
  const byDate = new Map(daily.map((day) => [day.date, day]));
  for (const meal of meals) {
    const day = byDate.get(localDate(meal.eaten_at, offsetMinutes));
    if (!day) continue;
    day.kcal += Math.max(0, Number(meal.estimated_kcal) || 0);
    day.cost += Math.max(0, Number(meal.cost) || 0);
    day.meals += 1;
  }
  daily.forEach((day) => { day.cost = Number(day.cost.toFixed(2)); });
  const totalKcal = daily.reduce((sum, day) => sum + day.kcal, 0);
  const totalCost = daily.reduce((sum, day) => sum + day.cost, 0);
  const loggedDays = daily.filter((day) => day.meals > 0).length;
  return {
    daily,
    metrics: {
      total_kcal: Math.round(totalKcal),
      total_cost: Number(totalCost.toFixed(2)),
      meal_count: meals.length,
      logged_days: loggedDays,
      average_kcal_per_logged_day: loggedDays ? Math.round(totalKcal / loggedDays) : 0,
      average_cost_per_meal: meals.length ? Number((totalCost / meals.length).toFixed(2)) : 0,
    },
  };
}

function safeNutrition(value: Record<string, unknown>, mealCount: number) {
  const source = (value?.levels || {}) as Record<string, Record<string, unknown>>;
  const levels: Record<string, { score: number; label: string }> = {};
  for (const key of ["protein", "carbohydrates", "fiber", "fat", "vitamins"]) {
    const item = source[key] || {};
    levels[key] = {
      score: Math.min(100, Math.max(0, Math.round(Number(item.score) || 0))),
      label: String(item.label || "信息不足").slice(0, 12),
    };
  }
  return {
    confidence: ["low", "medium", "high"].includes(String(value?.confidence)) ? value.confidence : mealCount >= 10 ? "medium" : "low",
    levels,
    caveat: String(value?.caveat || "仅依据文字描述进行方向性估算。").slice(0, 240),
  };
}

function emptyAnalysis() {
  return {
    nutrition: safeNutrition({}, 0),
    summary: "本周记录还不足以形成稳定判断",
    insights: [{
      title: "先补足记录密度",
      detail: "本周至少记录 3 餐后，Agent 才能比较饮食结构、热量与花费的变化。",
    }],
  };
}

async function analyzeMeals(current: Meal[], metrics: Record<string, number>, previous: Record<string, number>) {
  if (!current.length) return emptyAnalysis();
  const compactMeals = current.slice(0, 80).map((meal) => ({
    date: meal.eaten_at.slice(0, 10),
    meal_type: meal.meal_type,
    description: String(meal.description || "").slice(0, 500),
    kcal: meal.estimated_kcal,
    cost: Number(meal.cost) || 0,
  }));
  const result = await deepSeekJson(
    `你是个人饮食观察 Agent。确定性热量与金额已经由程序计算，你不得重新计算或篡改这些数字。你的任务是根据中文餐食文字记录，做保守、可解释的营养结构方向性判断，并提出可执行但非医疗性质的建议。不能假装知道精确克数、维生素含量或人体需求满足率。记录不完整时必须降低 confidence。只返回 JSON：\n{
      "confidence":"low|medium|high",
      "levels":{
        "protein":{"score":0到100整数,"label":"偏低|一般|较好|偏高|信息不足"},
        "carbohydrates":{"score":0到100整数,"label":"..."},
        "fiber":{"score":0到100整数,"label":"..."},
        "fat":{"score":0到100整数,"label":"..."},
        "vitamins":{"score":0到100整数,"label":"..."}
      },
      "summary":"不超过32字的一句话",
      "insights":[{"title":"不超过16字","detail":"指出证据、原因或下一步，不超过80字"}],
      "caveat":"估算局限"
    }。insights 返回 2 到 3 条，至少一条同时考虑热量或花费，避免道德评判。`,
    JSON.stringify({ deterministic_metrics: metrics, previous_week_metrics: previous, meal_descriptions: compactMeals }),
  );
  const insights = Array.isArray(result.insights) ? result.insights.slice(0, 3).map((item: Record<string, unknown>) => ({
    title: String(item?.title || "观察").slice(0, 32),
    detail: String(item?.detail || "").slice(0, 180),
  })).filter((item: { detail: string }) => item.detail) : [];
  return {
    nutrition: safeNutrition(result, current.length),
    summary: String(result.summary || "本周饮食观察已生成").slice(0, 80),
    insights: insights.length ? insights : emptyAnalysis().insights,
  };
}

Deno.serve(async (request) => {
  const started = Date.now();
  const origin = requestOrigin(request);
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  if (request.method !== "POST") return json({ message: "Method not allowed" }, 405, origin);
  if (!isAllowedOrigin(origin)) return json({ message: "Origin not allowed" }, 403, origin);

  let client: ReturnType<typeof userClient> | null = null;
  let userId = "";
  let weekStart = "";
  let runId: string | undefined;
  try {
    client = userClient(request);
    const user = await requirePermanentUser(client);
    userId = user.id;
    const body = await request.json();
    weekStart = validWeekStart(body?.week_start);
    const offsetMinutes = Math.min(840, Math.max(-720, Number(body?.timezone_offset_minutes) || 480));
    const force = body?.force === true;

    const { data: run } = await client.from("agent_runs").insert({
      user_id: userId, run_type: "weekly_report", status: "running", week_start: weekStart,
    }).select("id").single();
    runId = run?.id;

    const priorStart = addDays(weekStart, -7);
    const nextStart = addDays(weekStart, 7);
    const { data, error } = await client.from("meals")
      .select("meal_type,description,estimated_kcal,cost,eaten_at,updated_at")
      .gte("eaten_at", boundary(priorStart, offsetMinutes))
      .lt("eaten_at", boundary(nextStart, offsetMinutes))
      .order("eaten_at", { ascending: true });
    if (error) throw error;
    const allMeals = (data || []) as Meal[];
    const current = allMeals.filter((meal) => localDate(meal.eaten_at, offsetMinutes) >= weekStart);
    const previousMeals = allMeals.filter((meal) => localDate(meal.eaten_at, offsetMinutes) < weekStart);
    const currentMetrics = metricsFor(current, weekStart, offsetMinutes);
    const previousMetrics = metricsFor(previousMeals, priorStart, offsetMinutes).metrics;
    const sourceLatestAt = current.reduce((latest, meal) => meal.updated_at > latest ? meal.updated_at : latest, "");

    if (!force) {
      const { data: cached } = await client.from("agent_weekly_reports")
        .select("report_data,source_record_count,source_latest_at")
        .eq("user_id", userId).eq("week_start", weekStart).maybeSingle();
      if (cached && cached.source_record_count === current.length && (cached.source_latest_at || "") === sourceLatestAt) {
        if (runId) await client.from("agent_runs").update({ status: "complete", duration_ms: Date.now() - started, finished_at: new Date().toISOString() }).eq("id", runId);
        return json({ report: cached.report_data, cached: true }, 200, origin);
      }
    }

    let analysis;
    let status = "complete";
    try {
      analysis = await analyzeMeals(current, currentMetrics.metrics, previousMetrics);
    } catch (error) {
      console.error("Nutrition analysis failed", error);
      analysis = emptyAnalysis();
      analysis.summary = current.length ? "数据汇总完成，营养分析暂时不可用" : analysis.summary;
      analysis.insights = current.length ? [{ title: "热量与花费已完成汇总", detail: "DeepSeek 暂时未返回营养分析；原始记录与确定性统计不受影响。" }] : analysis.insights;
      status = "partial";
    }

    const report = {
      week_start: weekStart,
      week_end: addDays(weekStart, 6),
      timezone_offset_minutes: offsetMinutes,
      metrics: currentMetrics.metrics,
      previous_metrics: previousMetrics,
      daily: currentMetrics.daily,
      nutrition: analysis.nutrition,
      summary: analysis.summary,
      insights: analysis.insights,
      generated_at: new Date().toISOString(),
      status,
    };
    const { error: reportError } = await client.from("agent_weekly_reports").upsert({
      user_id: userId, week_start: weekStart, report_data: report,
      source_record_count: current.length, source_latest_at: sourceLatestAt || null,
      status, generated_at: report.generated_at, updated_at: report.generated_at,
    }, { onConflict: "user_id,week_start" });
    if (reportError) throw reportError;
    await client.from("agent_nutrition_estimates").upsert({
      user_id: userId, week_start: weekStart, estimate_data: analysis.nutrition,
      confidence: analysis.nutrition.confidence, generated_at: report.generated_at,
    }, { onConflict: "user_id,week_start" });
    if (runId) await client.from("agent_runs").update({ status, duration_ms: Date.now() - started, finished_at: new Date().toISOString() }).eq("id", runId);
    return json({ report, cached: false }, 200, origin);
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    console.error("Weekly report failed", code);
    if (runId && client) await client.from("agent_runs").update({ status: "failed", error_code: code.slice(0, 80), duration_ms: Date.now() - started, finished_at: new Date().toISOString() }).eq("id", runId);
    if (code === "AUTH_REQUIRED" || code === "AUTH_CONFIGURATION_MISSING") return json({ message: "请先使用邮箱账户登录" }, 401, origin);
    if (code === "INVALID_WEEK_START") return json({ message: "周起始日期格式不正确" }, 400, origin);
    return json({ message: "周报生成失败", code }, 500, origin);
  }
});
