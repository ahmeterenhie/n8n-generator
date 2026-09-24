# n8n Forge — Prompt-to-Workflow Generator

Convert natural language descriptions (Turkish or English) into fully importable n8n workflow JSON files using Claude (Anthropic), OpenAI (including Codex models) or Google Gemini (free tier). A demo mode works with no API key.

---

## Pages

| Route        | Access    | Description                                                   |
|--------------|-----------|---------------------------------------------------------------|
| `/`          | Public    | Landing page: what the app does and how it works              |
| `/login`     | Public    | Sign-in screen                                                |
| `/generator` | Signed in | Describe → answer questions → review the plan → generate → refine; or upload an existing workflow |
| `/projects`  | Signed in | Saved projects: open to continue, or delete                   |
| `/settings`  | Signed in | AI provider (Claude, OpenAI, Gemini or Demo) and the n8n connection |

The interface is in **Turkish** by default; every page has a **TR / EN** switch, remembered in a cookie. Generated node names follow the selected language.

---

## Folder Structure

```
n8n-generator/
├── app/
│   ├── api/
│   │   ├── clarify/route.ts          # POST: next round of clarifying questions (or done)
│   │   ├── plan/route.ts             # POST: plan for review; revise with feedback
│   │   ├── generate/route.ts         # POST: approved plan → validated workflows (streamed)
│   │   ├── refine/route.ts           # POST: change a workflow by instruction (streamed)
│   │   ├── validate/route.ts         # POST: check an uploaded workflow (no AI)
│   │   ├── n8n/[action]/route.ts     # POST: test / push / executions / retry (proxy to n8n)
│   │   └── projects/                 # GET/POST list+save, GET/DELETE one project
│   │   ├── test-connection/route.ts  # POST: checks the API key can access the chosen model
│   │   ├── login/route.ts            # POST: checks credentials, sets session cookie
│   │   └── logout/route.ts           # POST: clears session cookie
│   ├── generator/page.tsx            # Generator UI
│   ├── settings/page.tsx             # API connection screen
│   ├── login/                        # Sign-in screen
│   ├── page.tsx                      # Landing page
│   ├── layout.tsx                    # Root layout: font, language detection
│   └── globals.css
├── components/
│   ├── Shell.tsx                     # Shared header, navigation, language switch
│   ├── QuestionsPanel.tsx            # Clarifying questions (rounds)
│   ├── PlanPanel.tsx                 # Plan review and editing
│   ├── ProgressPanel.tsx             # Live generation steps
│   ├── ProjectResult.tsx             # Tabs for all workflows of a system
│   ├── WorkflowCard.tsx              # One workflow: diagram, check, download, refine
│   ├── SetupGuide.tsx                # Setup prompt with copy / download
│   └── WorkflowDiagram.tsx           # Visual node diagram of a workflow
├── lib/
│   ├── dictionaries.ts               # Turkish/English texts
│   ├── i18n.tsx                      # Language context and switch
│   ├── auth.ts                       # Signed session cookie helpers
│   ├── apiConfig.ts                  # Browser storage for provider, keys and models
│   ├── n8n/
│   │   ├── catalog.ts                # Official node catalog: search, overviews, specs
│   │   ├── validate.ts               # Checks workflows against the catalog
│   │   └── prompts.ts                # Plan / generate / repair instructions
│   ├── n8n/remote.ts                 # n8n Public API: push + linking, executions, retry
│   ├── projects.ts                   # Project history (JSON files on this machine)
│   ├── pipeline.ts                   # Plan → generate → validate → repair; refine
│   ├── plan.ts                       # Plan structure and checks
│   ├── stream.ts / apiClient.ts      # Streamed progress (server / browser)
│   ├── llm.ts                        # Claude, OpenAI and Gemini calls, error mapping
│   ├── clarify.ts                    # Clarifying-question prompt, parsing, demo questions
│   ├── demoWorkflows.ts              # Sample workflows for demo mode
│   ├── setupPrompt.ts                # Builds the ready-to-paste setup prompt
│   ├── requestUtils.ts               # Shared request helpers
│   └── workflowLayout.ts             # Node diagram layout
├── data/n8n-catalog.json.gz          # Node catalog built from n8n-nodes-base
├── scripts/
│   ├── update-n8n-catalog.mjs        # Rebuilds the catalog
│   ├── eval.ts                       # Quality check against a real model
│   └── eval-cases.json               # Benchmark requests
├── tests/                            # Unit tests (npm test)
├── middleware.ts                     # Protects /generator, /settings and the APIs
└── .env.example
```

---

## Quick Start

```bash
npm install
npx next dev -p 3005
```

Open [http://localhost:3005](http://localhost:3005), sign in with **admin / admin** and try it right away in demo mode. For real generation go to **API**, choose Claude, OpenAI or Gemini (free key at [aistudio.google.com](https://aistudio.google.com)) and paste your key.

---

## Environment Variables

All optional. Copy `.env.example` to `.env.local` to set them.

| Variable         | Default          | Description                                                        |
|------------------|------------------|--------------------------------------------------------------------|
| `AUTH_USERNAME`  | `admin`          | Sign-in username                                                   |
| `AUTH_PASSWORD`  | `admin`          | Sign-in password                                                   |
| `AUTH_SECRET`    | built-in dev key | Signs session cookies. **Set a long random value in production.**  |
| `ANTHROPIC_API_KEY` | —             | Fallback Claude key used when the browser has not saved one        |
| `ANTHROPIC_MODEL`   | `claude-opus-5` | Fallback Claude model                                            |
| `GEMINI_API_KEY` | —                | Fallback Gemini key used when the browser has not saved one        |
| `GEMINI_MODEL`   | `gemini-2.5-flash` | Fallback Gemini model                                            |
| `OPENAI_API_KEY` | —                | Fallback OpenAI key used when the browser has not saved one        |
| `OPENAI_MODEL`   | `gpt-5-codex`    | Fallback OpenAI model                                              |
| `PROJECTS_DIR`   | `.data/projects` | Where project history is saved                                     |

---

## How It Works

1. On the **API** page the user picks a provider (Claude, OpenAI, Gemini or Demo) and saves a key and model for it. Keys are stored only in that browser (`localStorage`); each provider keeps its own. New users start in demo mode. The server uses a key only for the request it came with and never stores it.
2. **Questions** — `/api/clarify` asks up to 5 questions per round, for up to 3 rounds. Each round sees every earlier question and answer (skipped ones included) and follows up on them; the model says when it has enough. The user can also stop early ("that's enough, make the plan").
3. **Plan** — `/api/plan` returns a plan the user reviews before anything is built: the workflows, their triggers and ordered steps (each with its n8n node, resource and operation), the accounts to connect, and the assumptions made. The model gets short overviews of candidate nodes (core nodes plus services the request mentions, found by keyword with Turkish synonyms). Large systems can be split into:
   - several **main** workflows (one per independent trigger),
   - **sub-workflows** for reusable or self-contained parts (Execute Workflow Trigger, called with Execute Sub-workflow),
   - an **error workflow** (Error Trigger) for alerts about failures anywhere.

   The user can rename workflows, edit, delete or add steps (a new step without a node gets one picked during generation), or describe changes for the model to revise the plan.
4. **Generate** — `/api/generate` builds each planned workflow in turn (`lib/pipeline.ts`) and streams progress (NDJSON, `lib/stream.ts`):
   1. **Write** with the exact spec of each planned operation from the **official n8n node catalog** (type, `typeVersion`, parameter names, allowed values, n8n's own builder hints), plus the nodes that link workflows together.
   2. **Validate** with `lib/n8n/validate.ts`: n8n's own parameter logic (`n8n-workflow`) plus unknown node types, unsupported versions, parameters n8n would silently drop, invalid option values, broken connections, triggers with inputs and the Respond-to-Webhook mode.
   3. **Repair** — errors go back to the model with the matching specs, up to two rounds. A repair is only kept if it does not make things worse.

   "Generate directly" skips questions and review (plan and build in one go).
5. **Result** — one tab per workflow with a node diagram (JSON on a second tab), the check result (clean, fields left for the user, or unresolved issues), and download buttons (one file per workflow, or all at once).
6. **Refine** — `/api/refine` changes any workflow from a text instruction and checks and repairs it again. An existing workflow can also be uploaded (`/api/validate` checks it without an AI call) and then refined.
7. **n8n** — with an n8n connection (address + API key, stored in the browser), **Send to n8n** creates the workflows through n8n's Public API, error and sub-workflows first. It then links them: Execute Sub-workflow nodes get the real sub-workflow ids, and main/sub workflows get the error workflow in their settings. Later sends update the same workflows; ones that were already published are published again, because n8n 2.x runs the published version. Recent runs of each workflow are listed with the failing node and message. **Fix the error** turns a failed run into a change request, applies it, updates n8n, and offers **Retry**, which reruns that execution with the fixed version. n8n's API cannot start a workflow from scratch, so the first run happens in n8n.
8. **History** — every result is saved as a project (`.data/projects/`, or `PROJECTS_DIR`) after each build, change or send, and can be reopened from **Projects**. API keys are never saved.
9. **Setup prompt** — built from all workflows (nodes, `YOUR_…` placeholders, request and answers, unresolved issues, and for several workflows the import order and how to link sub-workflows and the error workflow). The user uploads the JSON files to any AI assistant with this prompt and gets step-by-step setup help.

Providers: the **Anthropic Messages API** (streamed; `fallbacks: "default"` on Claude Opus 5 re-runs a declined request on Anthropic's recommended model), the **OpenAI Responses API** (serves Codex and GPT models), or the **Gemini API** (retries temporary 5xx errors).

Errors come back as `{ code, error }`, so the UI can show them in the selected language.

---

## n8n Node Catalog

`data/n8n-catalog.json.gz` holds every node of `n8n-nodes-base` at its default (newest) version, taken from the package's own `dist/types/nodes.json`. `n8n-workflow` (same release line) provides the parameter logic used by the validator.

Generated workflows use the catalog's node versions, so **build the catalog for the n8n version you import into**. Older n8n releases may not know the newest node versions. Check your version in n8n under *Help → About n8n*, then:

```bash
npm run catalog:update -- 1.95.0   # n8n-nodes-base version matching your n8n
npm install n8n-workflow@1.95.0 --save-exact
```

---

## Tests and Quality Check

```bash
npm test          # unit tests: validator, catalog search, pipeline (scripted model), helpers
```

`npm run eval` runs the 24 benchmark requests in `scripts/eval-cases.json` through a real model and reports how many produce a workflow with no validation errors that uses the expected nodes. Run it before and after changing prompts, the catalog or the validator:

```bash
EVAL_PROVIDER=gemini EVAL_API_KEY=AIza... EVAL_DELAY_MS=20000 npm run eval
# optional: EVAL_MODEL=gemini-2.5-pro  EVAL_ONLY=slack-webhook,uptime-monitor
```

Results are saved in `eval-results/` (not committed).

---

## Importing into n8n

1. Download the generated `.json` file.
2. Open your n8n instance → **Workflows** → **Import from File**.
3. Select the downloaded file.
4. Configure credentials for any nodes that require them (Google Sheets, Gmail, Slack, etc.).
5. Activate and test.
