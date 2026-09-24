import { NextRequest, NextResponse } from "next/server";
import { errorResponse, resolveProvider, testConnection } from "@/lib/llm";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  try {
    const model = await testConnection({
      provider: resolveProvider(body?.provider),
      apiKey: body?.apiKey,
      model: body?.model,
    });
    return NextResponse.json({ ok: true, model });
  } catch (err: unknown) {
    return errorResponse(err);
  }
}
