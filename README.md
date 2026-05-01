# n8n Forge — Prompt-to-Workflow Generator

Convert natural language descriptions into fully importable n8n workflow JSON files using OpenAI.

---

## Folder Structure

```
prompt-to-n8n/
├── app/
│   ├── api/
│   │   └── generate/
│   │       └── route.ts        # POST /api/generate — calls OpenAI, returns n8n JSON
│   ├── globals.css             # Tailwind base + custom scrollbar styles
│   ├── layout.tsx              # Root layout: font, metadata
│   └── page.tsx                # Main UI: textarea, submit, result viewer
├── .env.example                # Template for environment variables
├── .gitignore
├── next.config.ts
├── package.json
├── postcss.config.js
├── tailwind.config.ts
└── tsconfig.json
```

---

## Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Set up environment
```bash
cp .env.example .env.local
# Then edit .env.local and add your OpenAI API key
```

### 3. Run development server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Environment Variables

| Variable         | Required | Description                  |
|-----------------|----------|------------------------------|
| `OPENAI_API_KEY` | ✅ Yes   | Your OpenAI API key (sk-...) |

---

## How It Works

1. **User** enters a plain-English description of their automation.
2. **Frontend** (`page.tsx`) sends a `POST` to `/api/generate` with `{ prompt }`.
3. **API Route** (`route.ts`) validates input, then calls `gpt-4o` with:
   - A detailed **system prompt** that defines the full n8n JSON schema, node catalog (21 node types), connection syntax, expression syntax, and layout rules.
   - `response_format: { type: "json_object" }` (JSON mode) to guarantee valid JSON output.
   - `temperature: 0.2` for deterministic, schema-faithful output.
4. The route **validates** the returned JSON (required keys, node array, connections object) before returning it.
5. **Frontend** displays the JSON with line count stats, and offers **Copy** and **Download** actions.

---

## Importing into n8n

1. Download the generated `.json` file.
2. Open your n8n instance → **Workflows** → **Import from File**.
3. Select the downloaded file.
4. Configure credentials for any nodes that require them (Google Sheets, Gmail, Slack, etc.).
5. Activate and test.

---

## Deploying to Vercel

```bash
npm i -g vercel
vercel
```

Set `OPENAI_API_KEY` in your Vercel project's Environment Variables dashboard.

---

## Extending

- **Add more node types**: Extend the `NODE CATALOG` section in the system prompt in `route.ts`.
- **Streaming**: Replace `openai.chat.completions.create` with the streaming variant and use a `ReadableStream` response for real-time output.
- **Workflow history**: Add a `localStorage`-backed sidebar to browse previously generated workflows.
- **Rate limiting**: Add `@upstash/ratelimit` with a Redis backend before the OpenAI call.
- **Auth**: Wrap the API route with NextAuth.js session checks.
