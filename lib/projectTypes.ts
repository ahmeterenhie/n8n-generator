import type { BuiltWorkflow } from "@/lib/pipeline";

// Shapes shared by the generator, the result view and project history (browser side).

export interface RemoteInfo {
  id: string;
  url: string;
  pushedAt: string;
  /** The workflow changed here after it was last sent to n8n */
  outdated?: boolean;
}

export interface ProjectWorkflow extends BuiltWorkflow {
  remote?: RemoteInfo;
}

export interface ExecutionSummary {
  id: string;
  status: string;
  mode?: string;
  startedAt?: string;
  stoppedAt?: string;
  error?: { message: string; description?: string; node?: string };
}
