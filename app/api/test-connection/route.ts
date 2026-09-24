import { NextRequest, NextResponse } from "next/server";
import { createClient, missingKeyResponse, openAIErrorResponse, resolveModel } from "@/lib/openaiServer";

// Checks the key and model access with a cheap metadata call (no tokens spent).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const client = createClient(body?.apiKey);
  if (!client) return missingKeyResponse();

  const model = resolveModel(body?.model);
  try {
    const info = await client.models.retrieve(model);
    return NextResponse.json({ ok: true, model: info.id });
  } catch (err: unknown) {
    return openAIErrorResponse(err);
  }
}
