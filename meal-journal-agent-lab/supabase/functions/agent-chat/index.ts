import { corsHeaders, isAllowedOrigin, json, requestOrigin } from "../_shared/http.ts";
import { requirePermanentUser, userClient } from "../_shared/auth.ts";
import { deepSeekText } from "../_shared/deepseek.ts";

function validDate(value: unknown) {
  const text = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error("INVALID_WEEK_START");
  return text;
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

Deno.serve(async (request) => {
  const started = Date.now();
  const origin = requestOrigin(request);
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  if (request.method !== "POST") return json({ message: "Method not allowed" }, 405, origin);
  if (!isAllowedOrigin(origin)) return json({ message: "Origin not allowed" }, 403, origin);

  let client: ReturnType<typeof userClient> | null = null;
  let runId: string | undefined;
  try {
    client = userClient(request);
    const user = await requirePermanentUser(client);
    const body = await request.json();
    const question = String(body?.question || "").trim();
    if (!question || question.length > 800) throw new Error("INVALID_QUESTION");
    const weekStart = validDate(body?.week_start);

    const { data: run } = await client.from("agent_runs").insert({
      user_id: user.id, run_type: "chat", status: "running", week_start: weekStart,
    }).select("id").single();
    runId = run?.id;

    const [{ data: reportRow }, { data: meals, error: mealError }] = await Promise.all([
      client.from("agent_weekly_reports").select("report_data").eq("user_id", user.id).eq("week_start", weekStart).maybeSingle(),
      client.from("meals").select("meal_type,description,estimated_kcal,cost,eaten_at")
        .gte("eaten_at", `${addDays(weekStart, -7)}T00:00:00+08:00`)
        .lt("eaten_at", `${addDays(weekStart, 7)}T00:00:00+08:00`)
        .order("eaten_at", { ascending: true }).limit(120),
    ]);
    if (mealError) throw mealError;
    const evidence = (meals || []).map((meal) => ({
      date: meal.eaten_at, meal_type: meal.meal_type,
      description: String(meal.description || "").slice(0, 400),
      kcal: meal.estimated_kcal, cost: Number(meal.cost) || 0,
    }));
    const answer = await deepSeekText(
      `你是 Mia's Eating Life 的只读饮食分析 Agent。你只能基于提供的周报和饮食记录回答，不能声称已新增、编辑或删除记录，也不能编造未提供的数据。先直接回答问题，再用具体记录或统计作为依据，最后给一条容易执行的建议。若证据不足，要明确说“现有记录不足以判断”。中文回答，150到350字，不使用 Markdown 表格，不作疾病诊断或医疗建议。`,
      JSON.stringify({ question, selected_week: weekStart, weekly_report: reportRow?.report_data || null, relevant_meals: evidence }),
    );
    await client.from("agent_conversations").insert({ user_id: user.id, week_start: weekStart, question, answer });
    if (runId) await client.from("agent_runs").update({ status: "complete", duration_ms: Date.now() - started, finished_at: new Date().toISOString() }).eq("id", runId);
    return json({ answer, evidence_count: evidence.length }, 200, origin);
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    console.error("Agent chat failed", code);
    if (runId && client) await client.from("agent_runs").update({ status: "failed", error_code: code.slice(0, 80), duration_ms: Date.now() - started, finished_at: new Date().toISOString() }).eq("id", runId);
    if (code === "AUTH_REQUIRED" || code === "AUTH_CONFIGURATION_MISSING") return json({ message: "请先登录" }, 401, origin);
    if (code === "INVALID_QUESTION") return json({ message: "问题不能为空且不能超过 800 字" }, 400, origin);
    return json({ message: "Agent 暂时无法回答", code }, 500, origin);
  }
});
