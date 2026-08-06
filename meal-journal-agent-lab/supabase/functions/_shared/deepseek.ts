export async function deepSeekJson(system: string, user: string) {
  const apiKey = Deno.env.get("DEEPSEEK_API_KEY");
  if (!apiKey) throw new Error("DEEPSEEK_NOT_CONFIGURED");
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: Deno.env.get("DEEPSEEK_MODEL") || "deepseek-v4-flash",
      thinking: { type: "disabled" },
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 2000,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
    }),
  });
  if (!response.ok) {
    const reason = await response.text();
    console.error("DeepSeek error", response.status, reason.slice(0, 500));
    throw new Error(`DEEPSEEK_${response.status}`);
  }
  const body = await response.json();
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error("DEEPSEEK_EMPTY");
  try { return JSON.parse(content); } catch { throw new Error("DEEPSEEK_INVALID_JSON"); }
}

export async function deepSeekText(system: string, user: string) {
  const apiKey = Deno.env.get("DEEPSEEK_API_KEY");
  if (!apiKey) throw new Error("DEEPSEEK_NOT_CONFIGURED");
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: Deno.env.get("DEEPSEEK_MODEL") || "deepseek-v4-flash",
      thinking: { type: "disabled" },
      temperature: 0.25,
      max_tokens: 800,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
    }),
  });
  if (!response.ok) {
    console.error("DeepSeek error", response.status, (await response.text()).slice(0, 500));
    throw new Error(`DEEPSEEK_${response.status}`);
  }
  const body = await response.json();
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error("DEEPSEEK_EMPTY");
  return String(content).trim();
}
