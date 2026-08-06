# Mia's Eating Life · Agent Lab

这是一个与原网站完全分开的实验版本。它读取同一 Supabase 账户下的饮食记录，自动生成周报，并允许基于证据追问。它没有新增、编辑或删除原始饮食记录的功能。

## 已实现

- 每周首次打开时检查并自动生成周报，也可以手动重新生成。
- 程序直接计算热量、花费、记录天数和每日趋势，避免让模型“猜数字”。
- DeepSeek 根据文字描述保守估算蛋白质、碳水、纤维、脂肪和维生素/食物多样性。
- Agent 根据本周周报和相关饮食记录回答追问。
- 周报、营养分析、对话和运行状态分别保存到新的 Agent 表。
- 所有新表都使用 `user_id` 和 RLS，用户只能访问自己的数据。
- 原始 `public.meals` 表、照片和原来的 `estimate-calories` 函数均不改变。

## 项目结构

```text
index.html / styles.css / app.js       静态网站，可部署到 GitHub Pages
supabase/migrations/                   新的 Agent 数据表和 RLS
supabase/functions/agent-weekly-report 周报生成函数
supabase/functions/agent-chat          只读问答函数
supabase/functions/_shared             登录、CORS、DeepSeek 公共代码
```

## 部署顺序

1. 在现有 Supabase 项目的 SQL Editor 运行：
   `supabase/migrations/202608060001_agent_lab.sql`
2. 确认 Supabase Edge Function Secrets 已有 `DEEPSEEK_API_KEY`。可选设置 `DEEPSEEK_MODEL=deepseek-v4-flash`。
3. 使用 Supabase CLI 连接项目并部署两个函数：

   ```bash
   supabase link --project-ref wuvxguynyashxnwtcakr
   supabase functions deploy agent-weekly-report
   supabase functions deploy agent-chat
   ```

4. 在 Supabase → Authentication → URL Configuration 中添加跳转网址：
   `https://mia-003.github.io/meal-journal-agent-lab/`
5. 新建独立 GitHub 仓库 `meal-journal-agent-lab`，上传本项目根目录文件，并启用 GitHub Pages 的 `main / root`。

## 本地检查

```bash
npm run check
npm run serve
```

打开 `http://localhost:4173/`。本地邮箱登录需要把这个地址临时加入 Supabase Redirect URLs；仅检查界面时不需要登录。

## 权限边界

“只读”由两层保证：实验版前端没有任何修改 `meals` 的代码；两个 Edge Function 对 `meals` 也只执行 `select`。它们只向 `agent_*` 派生数据表写入结果。原版记录网站仍可以正常管理饮食记录。

营养分析只依据文字记录，不能得到准确的营养素克数或维生素摄入量，因此界面只显示方向性等级和可信度，不用于医疗建议。
