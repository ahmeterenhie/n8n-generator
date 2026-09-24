# n8n Forge — Prompt-to-Workflow Generator

Convert natural language descriptions (Turkish or English) into fully importable n8n workflow JSON files using Claude (Anthropic), OpenAI (including Codex models) or Google Gemini (free tier). A demo mode works with no API key.

---

## Pages

| Route        | Access    | Description                                                   |
|--------------|-----------|---------------------------------------------------------------|
| `/`          | Public    | Landing page: what the app does and how it works              |
| `/login`     | Public    | Sign-in screen                                                |
| `/generator` | Signed in | Describe a workflow, answer a few questions, generate, get a setup prompt |
| `/settings`  | Signed in | Pick Claude, OpenAI, Gemini or Demo; add the key, pick a model, test it |

The interface is in **Turkish** by default; every page has a **TR / EN** switch, remembered in a cookie. Generated node names follow the selected language.

---

## Folder Structure

```
n8n-generator/
├── app/
│   ├── api/
│   │   ├── clarify/route.ts          # POST: prompt → clarifying questions
│   │   ├── generate/route.ts         # POST: prompt (+ answers) → n8n workflow JSON
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
│   ├── QuestionsPanel.tsx            # Clarifying questions form
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
│   ├── pipeline.ts                   # Plan → generate → validate → repair
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

---

## How It Works

1. On the **API** page the user picks a provider (Claude, OpenAI, Gemini or Demo) and saves a key and model for it. Keys are stored only in that browser (`localStorage`); each provider keeps its own. New users start in demo mode.
2. **Continue** sends the description to `/api/clarify`, which asks the model for 3–6 short questions (trigger and timing, data sources, destinations, edge cases, error handling), each with suggested answers. The user answers what they can, or skips the questions.
3. **Generate** sends `{ prompt, answers, provider, apiKey, model, lang }` to `/api/generate`. The server uses the key for that one request and never stores it; demo mode returns a matching sample workflow instead of calling a model.
4. `lib/pipeline.ts` runs the generation in steps against the **official n8n node catalog** (see below):
   1. **Plan** — the model gets a short overview of candidate nodes (core nodes plus the services the request mentions, found by keyword with Turkish synonyms) and picks node types with their exact resource and operation.
   2. **Generate** — the model gets the exact spec of each chosen operation (type, `typeVersion`, parameter names, allowed values, n8n's own builder hints) and writes the workflow.
   3. **Validate** — `lib/n8n/validate.ts` checks the result with n8n's own parameter logic (`n8n-workflow`) plus extra checks: unknown node types, unsupported versions, parameters n8n would silently drop, invalid option values, broken connections, triggers with inputs, Respond-to-Webhook mode.
   4. **Repair** — errors go back to the model with the matching specs, up to two rounds; a repair is only kept if it does not make things worse.

   Providers: the **Anthropic Messages API** (streamed; `fallbacks: "default"` on Claude Opus 5 re-runs a declined request on Anthropic's recommended model), the **OpenAI Responses API** (serves Codex and GPT models), or the **Gemini API** (retries temporary 5xx errors).
5. The UI shows the check result: a clean pass, fields left for the user (placeholders, pick-from-list fields), or issues that could not be fixed automatically.
6. The UI draws the workflow as a node diagram (JSON on a second tab) and offers **Copy** and **Download**.
7. A **setup prompt** is built from the workflow (nodes, `YOUR_…` placeholders, the request and answers). The user uploads the JSON to any AI assistant with this prompt and gets step-by-step setup help: credentials, placeholder values, webhook URLs and testing.

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
