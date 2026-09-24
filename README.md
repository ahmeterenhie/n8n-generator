# n8n Forge — Prompt-to-Workflow Generator

Convert natural language descriptions (Turkish or English) into fully importable n8n workflow JSON files using OpenAI, including Codex models.

---

## Pages

| Route        | Access    | Description                                                   |
|--------------|-----------|---------------------------------------------------------------|
| `/`          | Public    | Landing page: what the app does and how it works              |
| `/login`     | Public    | Sign-in screen                                                |
| `/generator` | Signed in | Describe a workflow, generate, copy or download the JSON      |
| `/settings`  | Signed in | Connect an OpenAI API key, pick a model, test the connection  |

Every page has a **TR / EN** language switch. The choice is remembered in a cookie; on first visit the browser language is used.

---

## Folder Structure

```
n8n-generator/
├── app/
│   ├── api/
│   │   ├── generate/route.ts         # POST: prompt → n8n workflow JSON (OpenAI Responses API)
│   │   ├── test-connection/route.ts  # POST: checks the API key can access the chosen model
│   │   ├── login/route.ts            # POST: checks credentials, sets session cookie
│   │   └── logout/route.ts           # POST: clears session cookie
│   ├── generator/page.tsx            # Generator UI
│   ├── settings/page.tsx             # API connection screen
│   ├── login/                        # Sign-in screen
│   ├── page.tsx                      # Landing page
│   ├── layout.tsx                    # Root layout: font, language detection
│   └── globals.css
├── components/Shell.tsx              # Shared header, navigation, language switch
├── lib/
│   ├── i18n.tsx                      # Turkish/English texts and language context
│   ├── auth.ts                       # Signed session cookie helpers
│   ├── apiConfig.ts                  # Browser storage for API key + model
│   └── openaiServer.ts               # OpenAI client + error mapping
├── middleware.ts                     # Protects /generator, /settings and the APIs
└── .env.example
```

---

## Quick Start

```bash
npm install
npx next dev -p 3005
```

Open [http://localhost:3005](http://localhost:3005), sign in with **admin / admin**, go to **API** and paste your OpenAI key.

---

## Environment Variables

All optional. Copy `.env.example` to `.env.local` to set them.

| Variable         | Default          | Description                                                        |
|------------------|------------------|--------------------------------------------------------------------|
| `AUTH_USERNAME`  | `admin`          | Sign-in username                                                   |
| `AUTH_PASSWORD`  | `admin`          | Sign-in password                                                   |
| `AUTH_SECRET`    | built-in dev key | Signs session cookies. **Set a long random value in production.**  |
| `OPENAI_API_KEY` | —                | Fallback key used when the browser has not saved one               |
| `OPENAI_MODEL`   | `gpt-5-codex`    | Fallback model used when the browser has not chosen one            |

---

## How It Works

1. The user saves an OpenAI API key and model on the **API** page. They are stored only in that browser (`localStorage`).
2. On **Generate**, the browser sends `{ prompt, apiKey, model }` to `/api/generate`. The server uses the key for that one request and never stores it.
3. The route calls the OpenAI **Responses API** (which serves Codex models as well as GPT models) with a detailed system prompt describing the n8n JSON schema, a 21-node catalog, connection syntax and layout rules.
4. The JSON object is extracted from the response and validated (required keys, node array, connections object).
5. The UI shows the JSON with stats and offers **Copy** and **Download**.

Errors come back as `{ code, error }`, so the UI can show them in the selected language.

---

## Importing into n8n

1. Download the generated `.json` file.
2. Open your n8n instance → **Workflows** → **Import from File**.
3. Select the downloaded file.
4. Configure credentials for any nodes that require them (Google Sheets, Gmail, Slack, etc.).
5. Activate and test.
