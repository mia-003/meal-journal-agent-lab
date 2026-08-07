# Mia's Eating Life · Agent Lab

[中文](README.md) | [English](README.en.md)

An independent experimental version of Mia's Eating Life that turns existing meal records into weekly reports, nutrition-oriented observations, spending trends, and evidence-based follow-up answers.

**Live experiment:** [https://mia-003.github.io/meal-journal-agent-lab/](https://mia-003.github.io/meal-journal-agent-lab/)

The Agent Lab is isolated from the original meal journal and does not create, edit, or delete source meal records.

## What It Does

- Checks for and generates a weekly report when the selected week is first opened.
- Allows the user to manually regenerate a report when needed.
- Calculates calories, spending, logged days, meal count, and daily trends deterministically in code.
- Uses DeepSeek to make conservative, text-based assessments of protein, carbohydrates, fiber, fat, and vitamin or food diversity.
- Answers follow-up questions using the selected weekly report and relevant meal records as evidence.
- Stores reports, nutrition estimates, conversations, and run status in dedicated `agent_*` tables.
- Protects all derived data with `user_id` and Row Level Security.
- Leaves the original `public.meals` table, meal photos, and `estimate-calories` function unchanged.

## Why This Is an Agent Experiment

The project goes beyond a single model response by combining several steps:

1. It retrieves the user's records for a defined period.
2. It calculates reliable numeric metrics in application code.
3. It decides whether an existing report can be reused or should be regenerated.
4. It asks the model only for qualitative interpretation that cannot be calculated directly.
5. It saves the derived result and execution status.
6. It supports follow-up questions grounded in the generated report and source evidence.

The model does not receive permission to mutate meal records. The Agent's action boundary is limited to analysis, report generation, and conversation history.

## Architecture

```text
GitHub Pages frontend
  → Supabase Auth session
  → agent-weekly-report / agent-chat Edge Functions
  → read-only access to public.meals
  → deterministic calorie and spending calculations
  → DeepSeek qualitative analysis
  → agent_* derived-data tables
```

## Tech Stack

- **Frontend:** HTML, CSS, and vanilla JavaScript
- **Static hosting:** GitHub Pages
- **Authentication:** Supabase Auth with email Magic Links
- **Database:** Supabase Postgres with Row Level Security
- **Server-side orchestration:** Supabase Edge Functions
- **AI model:** DeepSeek API
- **Source meal data:** the existing `public.meals` table

## Project Structure

```text
.
├── index.html
├── styles.css
├── app.js
├── README.md
├── README.en.md
├── scripts
│   └── check-project.mjs
└── supabase
    ├── config.toml
    ├── migrations
    │   └── 202608060001_agent_lab.sql
    └── functions
        ├── _shared
        │   ├── auth.ts
        │   ├── deepseek.ts
        │   └── http.ts
        ├── agent-weekly-report
        │   └── index.ts
        └── agent-chat
            └── index.ts
```

## Data Responsibilities

### Deterministic application logic

The weekly report function calculates the metrics that should not be guessed by a language model:

- total and daily calories;
- total spending and average cost per meal;
- number of meals and logged days;
- average calories per logged day;
- previous-week comparison inputs.

### DeepSeek analysis

DeepSeek receives compact text descriptions plus deterministic metrics. It produces:

- directional nutrition scores and labels;
- a confidence level;
- a short weekly summary;
- two or three evidence-aware observations or suggestions;
- an explicit caveat when the source records are incomplete.

These outputs are estimates based on written descriptions. They do not represent measured nutrient quantities or medical advice.

## Database Tables

The migration creates separate derived-data tables:

- `agent_weekly_reports` stores generated weekly reports and cache metadata.
- `agent_nutrition_estimates` stores directional nutrition assessments.
- `agent_conversations` stores questions and Agent answers.
- `agent_runs` records execution type, status, duration, and error codes.

All tables use `user_id` and RLS so users can access only their own results.

## Deployment

### 1. Apply the database migration

Run this file in Supabase SQL Editor:

```text
supabase/migrations/202608060001_agent_lab.sql
```

### 2. Configure server-side secrets

Confirm that the Supabase project contains:

```bash
supabase secrets set DEEPSEEK_API_KEY=your_key
```

Optionally set the model:

```bash
supabase secrets set DEEPSEEK_MODEL=deepseek-v4-flash
```

Never expose the DeepSeek key in frontend code or GitHub.

### 3. Deploy both Edge Functions

```bash
supabase functions deploy agent-weekly-report --project-ref wuvxguynyashxnwtcakr
supabase functions deploy agent-chat --project-ref wuvxguynyashxnwtcakr
```

Both functions use JWT verification and require a permanent email-authenticated session.

### 4. Configure the authentication redirect

Add the following address to Supabase Authentication → URL Configuration → Redirect URLs:

```text
https://mia-003.github.io/meal-journal-agent-lab/
```

### 5. Publish the frontend

Upload the project root to the independent `meal-journal-agent-lab` repository. In GitHub Pages settings, publish from `main / (root)`.

## Local Development

Run the project checks:

```bash
npm run check
```

Start the local static server:

```bash
npm run serve
```

Then open:

```text
http://localhost:4173/
```

To test email authentication locally, add the local address to Supabase Redirect URLs temporarily.

## Read-Only Safety Boundary

The experiment enforces read-only access to source meals in two layers:

1. The frontend contains no interface or request for mutating `meals`.
2. Both Edge Functions query `meals` with `select` only.

The functions write exclusively to the `agent_*` derived-data tables. The original website remains responsible for creating, editing, or deleting meal records.

## Current Limitations

- Nutrition quality is inferred only from written meal descriptions.
- Exact grams, vitamin intake, and nutrient requirement coverage cannot be determined.
- Missing or inconsistent meal logging reduces confidence.
- Weekly reports depend on the availability of Supabase and DeepSeek.
- The current version is designed for personal use, although the database policies already isolate data by user.

## Relationship to the Original Project

- Original journal: [https://mia-003.github.io/meal-journal/](https://mia-003.github.io/meal-journal/)
- Agent experiment: [https://mia-003.github.io/meal-journal-agent-lab/](https://mia-003.github.io/meal-journal-agent-lab/)

The two sites are deployed independently so experiments can continue without interrupting the stable meal-recording experience.
