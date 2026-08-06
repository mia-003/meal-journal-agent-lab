import { readFile, access } from "node:fs/promises";

const required = [
  "index.html",
  "styles.css",
  "app.js",
  "supabase/migrations/202608060001_agent_lab.sql",
  "supabase/functions/agent-weekly-report/index.ts",
  "supabase/functions/agent-chat/index.ts",
];

await Promise.all(required.map((file) => access(new URL(`../${file}`, import.meta.url))));
const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const app = await readFile(new URL("../app.js", import.meta.url), "utf8");

for (const id of ["overview", "history", "chat", "authDialog", "generateButton"]) {
  if (!html.includes(`id="${id}"`)) throw new Error(`Missing UI element: ${id}`);
}
for (const functionName of ["agent-weekly-report", "agent-chat"]) {
  if (!app.includes(functionName)) throw new Error(`Missing function integration: ${functionName}`);
}
if (/from\(["']meals["']\)\s*\.(insert|update|upsert|delete)/.test(app)) {
  throw new Error("The Agent frontend must not mutate public.meals");
}

console.log("Agent Lab project checks passed.");
