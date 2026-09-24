// Computes a left-to-right layered layout for an n8n workflow.
// Positions from the model are ignored: they often overlap or ignore branches.

export interface WfNode {
  id?: string;
  name: string;
  type: string;
  typeVersion?: number;
  parameters?: Record<string, unknown>;
}

export interface LaidOutNode {
  node: WfNode;
  x: number;
  y: number;
  outputs: number;
}

export interface LaidOutEdge {
  from: string;
  to: string;
  output: number;
  back: boolean; // points to an earlier column (loops, e.g. Split In Batches)
}

export interface Layout {
  nodes: LaidOutNode[];
  edges: LaidOutEdge[];
  width: number;
  height: number;
  missing: string[]; // connection targets/sources that are not in `nodes`
}

export const NODE_W = 190;
export const NODE_H = 64;
const GAP_X = 70;
const GAP_Y = 40;
const PAD = 24;

type Connections = Record<string, { main?: ({ node: string }[] | null)[] }>;

export function layoutWorkflow(workflow: { nodes?: unknown; connections?: unknown }): Layout {
  const nodes = (Array.isArray(workflow.nodes) ? workflow.nodes : []).filter(
    (n): n is WfNode => typeof n === "object" && n !== null && typeof (n as WfNode).name === "string"
  );
  const byName = new Map(nodes.map((n) => [n.name, n]));
  const connections = (workflow.connections ?? {}) as Connections;

  const edges: LaidOutEdge[] = [];
  const missing = new Set<string>();
  for (const [from, conn] of Object.entries(connections)) {
    if (!byName.has(from)) missing.add(from);
    (conn?.main ?? []).forEach((targets, output) => {
      for (const t of targets ?? []) {
        if (!t || typeof t.node !== "string") continue;
        if (!byName.has(t.node)) {
          missing.add(t.node);
          continue;
        }
        if (byName.has(from)) edges.push({ from, to: t.node, output, back: false });
      }
    });
  }

  const outgoing = new Map<string, LaidOutEdge[]>(nodes.map((n) => [n.name, []]));
  const incoming = new Map<string, number>(nodes.map((n) => [n.name, 0]));
  for (const e of edges) {
    outgoing.get(e.from)!.push(e);
    incoming.set(e.to, (incoming.get(e.to) ?? 0) + 1);
  }

  // Mark back edges with a DFS so cycles don't break the layering
  const state = new Map<string, 1 | 2>(); // 1 = on stack, 2 = done
  const visit = (name: string) => {
    state.set(name, 1);
    for (const e of outgoing.get(name) ?? []) {
      const s = state.get(e.to);
      if (s === 1) e.back = true;
      else if (!s) visit(e.to);
    }
    state.set(name, 2);
  };
  const roots = nodes.filter((n) => incoming.get(n.name) === 0);
  for (const r of roots.length ? roots : nodes.slice(0, 1)) visit(r.name);
  for (const n of nodes) if (!state.has(n.name)) visit(n.name);

  // Column = longest forward path from a root (topological order over forward edges)
  const column = new Map<string, number>(nodes.map((n) => [n.name, 0]));
  const indeg = new Map<string, number>(nodes.map((n) => [n.name, 0]));
  for (const e of edges) if (!e.back) indeg.set(e.to, indeg.get(e.to)! + 1);
  const queue = nodes.filter((n) => indeg.get(n.name) === 0).map((n) => n.name);
  const order: string[] = [];
  while (queue.length) {
    const name = queue.shift()!;
    order.push(name);
    for (const e of outgoing.get(name)!) {
      if (e.back) continue;
      column.set(e.to, Math.max(column.get(e.to)!, column.get(name)! + 1));
      indeg.set(e.to, indeg.get(e.to)! - 1);
      if (indeg.get(e.to) === 0) queue.push(e.to);
    }
  }

  // Row order inside a column: follow the parent's row and output index (true above false)
  const columns: string[][] = [];
  const rank = new Map<string, number>();
  for (const name of order) {
    const c = column.get(name)!;
    (columns[c] ??= []).push(name);
  }
  columns.forEach((col, c) => {
    if (c > 0) {
      const key = (name: string) => {
        const parents = edges.filter((e) => e.to === name && !e.back && rank.has(e.from));
        if (!parents.length) return Number.MAX_SAFE_INTEGER;
        return Math.min(...parents.map((e) => rank.get(e.from)! * 10 + e.output));
      };
      col.sort((a, b) => key(a) - key(b));
    }
    col.forEach((name, i) => rank.set(name, i));
  });

  const tallest = Math.max(1, ...columns.map((c) => c.length));
  const contentH = tallest * NODE_H + (tallest - 1) * GAP_Y;
  const hasBackEdges = edges.some((e) => e.back);

  const laidOut: LaidOutNode[] = [];
  columns.forEach((col, c) => {
    const colH = col.length * NODE_H + (col.length - 1) * GAP_Y;
    const top = PAD + (contentH - colH) / 2;
    col.forEach((name, i) => {
      const node = byName.get(name)!;
      const conn = connections[name]?.main?.length ?? 0;
      laidOut.push({
        node,
        x: PAD + c * (NODE_W + GAP_X),
        y: top + i * (NODE_H + GAP_Y),
        outputs: Math.max(1, conn, defaultOutputs(node.type)),
      });
    });
  });

  return {
    nodes: laidOut,
    edges,
    // Extra room on the right for loop-back curves leaving the last column
    width: PAD * 2 + columns.length * NODE_W + Math.max(0, columns.length - 1) * GAP_X + (hasBackEdges ? 60 : 0),
    // Extra room below for loop-back curves
    height: PAD * 2 + contentH + (hasBackEdges ? 50 : 0),
    missing: Array.from(missing),
  };
}

function defaultOutputs(type: string): number {
  const t = shortType(type);
  return t === "if" || t === "splitInBatches" ? 2 : 1;
}

/** "n8n-nodes-base.googleSheets" → "googleSheets" */
export function shortType(type: string): string {
  return type.split(".").pop() ?? type;
}

/** y offset of an output port, spread evenly over the node's height */
export function portY(outputs: number, index: number): number {
  return (NODE_H * (index + 1)) / (outputs + 1);
}
