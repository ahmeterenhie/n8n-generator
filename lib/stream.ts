import { errorInfo } from "@/lib/llm";
import type { Progress } from "@/lib/pipeline";

// Long operations (several model calls) report progress as newline-delimited
// JSON: {"type":"progress",...} lines, then one {"type":"result",...} or
// {"type":"error","code","error","status"} line.

export function streamResponse(run: (progress: (p: Progress) => void) => Promise<Record<string, unknown>>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: Record<string, unknown>) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      try {
        const result = await run((p) => send({ type: "progress", ...p }));
        send({ type: "result", ...result });
      } catch (err) {
        send({ type: "error", ...errorInfo(err) });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
