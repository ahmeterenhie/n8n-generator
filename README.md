# n8n Forge — Prompt-to-Workflow Generator

Convert natural language descriptions (Turkish or English) into fully importable n8n workflow JSON files using Claude (Anthropic) or OpenAI (including Codex models).

---

## Pages

| Route        | Access    | Description                                                   |
|--------------|-----------|---------------------------------------------------------------|
| `/`          | Public    | Landing page: what the app does and how it works              |
| `/login`     | Public    | Sign-in screen                                                |
| `/generator` | Signed in | Describe a workflow, generate, copy or download the JSON      |
| `/settings`  | Signed in | Pick Claude or OpenAI, add the API key, pick a model, test it |

The interface is in **Turkish** by default; every page has a **TR / EN** switch, remembered in a cookie. Generated node names follow the selected language.

---

## Folder Structure

```
n8n-generator/
├── app/
│   ├── api/
│   │   ├── generate/route.ts         # POST: prompt → n8n workflow JSON (Claude or OpenAI)
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
│   └── WorkflowDiagram.tsx           # Visual node diagram of a workflow
├── lib/
│   ├── dictionaries.ts               # Turkish/English texts
│   ├── i18n.tsx                      # Language context and switch
│   ├── auth.ts                       # Signed session cookie helpers
│   ├── apiConfig.ts                  # Browser storage for provider, keys and models
│   ├── llm.ts                        # Claude + OpenAI calls and error mapping
│   └── workflowLayout.ts             # Node diagram layout
├── middleware.ts                     # Protects /generator, /settings and the APIs
└── .env.example
```

---

## Quick Start

```bash
npm install
npx next dev -p 3005
```

Open [http://localhost:3005](http://localhost:3005), sign in with **admin / admin**, go to **API**, choose Claude or OpenAI and paste your key.

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
| `OPENAI_API_KEY` | —                | Fallback OpenAI key used when the browser has not saved one        |
| `OPENAI_MODEL`   | `gpt-5-codex`    | Fallback OpenAI model                                              |

---

## How It Works

1. On the **API** page the user picks a provider (Claude or OpenAI) and saves a key and model for it. Keys are stored only in that browser (`localStorage`); each provider keeps its own.
2. On **Generate**, the browser sends `{ prompt, provider, apiKey, model, lang }` to `/api/generate`. The server uses the key for that one request and never stores it.
3. The route sends a detailed system prompt (n8n JSON schema, a 21-node catalog, connection syntax, layout rules) to the chosen provider: the **Anthropic Messages API** (streamed; `fallbacks: "default"` on Claude Opus 5 re-runs a declined request on Anthropic's recommended model) or the **OpenAI Responses API** (serves Codex and GPT models).
4. The JSON object is extracted from the response and validated (required keys, node array, connections object).
5. The UI draws the workflow as a node diagram (JSON on a second tab) and offers **Copy** and **Download**.

Errors come back as `{ code, error }`, so the UI can show them in the selected language.

---

## Importing into n8n

1. Download the generated `.json` file.
2. Open your n8n instance → **Workflows** → **Import from File**.
3. Select the downloaded file.
4. Configure credentials for any nodes that require them (Google Sheets, Gmail, Slack, etc.).
5. Activate and test.
