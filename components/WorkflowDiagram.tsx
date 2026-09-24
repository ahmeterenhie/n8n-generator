"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { NODE_H, NODE_W, layoutWorkflow, portY, shortType, type LaidOutNode } from "@/lib/workflowLayout";

type Category = "trigger" | "logic" | "data" | "http" | "app" | "db" | "other";

const CATEGORY_COLOR: Record<Category, string> = {
  trigger: "#28c840",
  logic: "#febc2e",
  data: "#5b9dff",
  http: "#ff6b35",
  app: "#b48cff",
  db: "#3dd6d0",
  other: "#8b8b9b",
};

const CATEGORY_OF: Record<string, Category> = {
  webhook: "trigger",
  scheduleTrigger: "trigger",
  manualTrigger: "trigger",
  cron: "trigger",
  if: "logic",
  switch: "logic",
  merge: "logic",
  splitInBatches: "logic",
  wait: "logic",
  noOp: "logic",
  set: "data",
  code: "data",
  function: "data",
  httpRequest: "http",
  respondToWebhook: "http",
  googleSheets: "app",
  gmail: "app",
  googleDrive: "app",
  slack: "app",
  emailSend: "app",
  airtable: "app",
  postgres: "db",
  mySql: "db",
  redis: "db",
};

const ABBR: Record<string, string> = {
  webhook: "WH",
  scheduleTrigger: "⏱",
  manualTrigger: "▶",
  if: "IF",
  merge: "⑂",
  splitInBatches: "SB",
  wait: "⏸",
  noOp: "—",
  set: "SET",
  code: "{}",
  httpRequest: "API",
  respondToWebhook: "↩",
  googleSheets: "GS",
  gmail: "GM",
  googleDrive: "GD",
  slack: "SL",
  emailSend: "@",
  airtable: "AT",
  postgres: "PG",
  mySql: "MY",
  redis: "RD",
};

function categoryOf(type: string): Category {
  const t = shortType(type);
  return CATEGORY_OF[t] ?? (/trigger$/i.test(t) ? "trigger" : "other");
}

const MIN_ZOOM = 0.4;
// Fitting never shrinks below this; wider workflows scroll horizontally instead
const FIT_FLOOR = 0.7;
const MAX_ZOOM = 1.5;

export function WorkflowDiagram({ workflow }: { workflow: Record<string, unknown> }) {
  const { t } = useI18n();
  const d = t.diagram;
  const layout = useMemo(() => layoutWorkflow(workflow), [workflow]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [fitZoom, setFitZoom] = useState(1);
  const [zoom, setZoom] = useState<number | null>(null); // null = follow fit
  const [selected, setSelected] = useState<string | null>(null);

  // Fit the diagram to the available width, and keep it fitted on resize
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const available = el.clientWidth - 2;
      setFitZoom(Math.max(FIT_FLOOR, Math.min(1, available / layout.width)));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [layout.width]);

  useEffect(() => {
    setSelected(null);
    setZoom(null);
  }, [workflow]);

  const scale = zoom ?? fitZoom;
  const posByName = new Map(layout.nodes.map((n) => [n.node.name, n]));
  const selectedNode = selected ? posByName.get(selected)?.node : undefined;

  const outputLabel = (n: LaidOutNode, index: number): string | null => {
    if (n.outputs < 2) return null;
    const type = shortType(n.node.type);
    if (type === "if") return index === 0 ? d.true : d.false;
    if (type === "splitInBatches") return index === 0 ? d.done : d.loop;
    return String(index);
  };

  const edgePath = (fromNode: LaidOutNode, output: number, toNode: LaidOutNode, back: boolean) => {
    const sx = fromNode.x + NODE_W;
    const sy = fromNode.y + portY(fromNode.outputs, output);
    const tx = toNode.x;
    const ty = toNode.y + NODE_H / 2;
    if (back) {
      const bottom = layout.height - 18;
      return `M ${sx} ${sy} C ${sx + 50} ${sy}, ${sx + 50} ${bottom}, ${sx} ${bottom} L ${tx} ${bottom} C ${tx - 50} ${bottom}, ${tx - 50} ${ty}, ${tx - 6} ${ty}`;
    }
    const dx = Math.max(40, (tx - sx) / 2);
    return `M ${sx} ${sy} C ${sx + dx} ${sy}, ${tx - dx} ${ty}, ${tx - 6} ${ty}`;
  };

  if (!layout.nodes.length) {
    return <p className="px-5 py-6 text-xs text-[#6b6b7b]">{d.empty}</p>;
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-b border-[#1e1e2e]">
        <Legend />
        <div className="flex items-center gap-1">
          <ToolButton label={d.zoomOut} onClick={() => setZoom(Math.max(MIN_ZOOM, +(scale - 0.1).toFixed(2)))}>
            −
          </ToolButton>
          <span className="w-12 text-center text-[11px] tabular-nums text-[#6b6b7b]">{Math.round(scale * 100)}%</span>
          <ToolButton label={d.zoomIn} onClick={() => setZoom(Math.min(MAX_ZOOM, +(scale + 0.1).toFixed(2)))}>
            +
          </ToolButton>
          <ToolButton label={d.fit} onClick={() => setZoom(null)}>
            ⤢
          </ToolButton>
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        className="overflow-auto scrollbar-thin max-h-[560px]"
        style={{
          backgroundImage: "radial-gradient(#23232f 1px, transparent 1px)",
          backgroundSize: `${20 * scale}px ${20 * scale}px`,
        }}
        onClick={() => setSelected(null)}
      >
        <div style={{ width: layout.width * scale, height: layout.height * scale }}>
          <div
            className="relative origin-top-left"
            style={{ width: layout.width, height: layout.height, transform: `scale(${scale})` }}
          >
            <svg className="absolute inset-0 overflow-visible" width={layout.width} height={layout.height} aria-hidden>
              <defs>
                <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#4a4a5a" />
                </marker>
                <marker id="arrow-active" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#ff6b35" />
                </marker>
              </defs>
              {layout.edges.map((e, i) => {
                const from = posByName.get(e.from);
                const to = posByName.get(e.to);
                if (!from || !to) return null;
                const active = selected === e.from || selected === e.to;
                return (
                  <path
                    key={i}
                    d={edgePath(from, e.output, to, e.back)}
                    fill="none"
                    stroke={active ? "#ff6b35" : "#3a3a4a"}
                    strokeWidth={active ? 2 : 1.5}
                    strokeDasharray={e.back ? "5 4" : undefined}
                    markerEnd={`url(#${active ? "arrow-active" : "arrow"})`}
                  />
                );
              })}
            </svg>

            {layout.nodes.map((n) => {
              const category = categoryOf(n.node.type);
              const color = CATEGORY_COLOR[category];
              const type = shortType(n.node.type);
              const isSelected = selected === n.node.name;
              return (
                <div key={n.node.name} className="absolute" style={{ left: n.x, top: n.y, width: NODE_W, height: NODE_H }}>
                  <button
                    type="button"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      setSelected(isSelected ? null : n.node.name);
                    }}
                    title={n.node.name}
                    className={`w-full h-full flex items-center gap-2.5 pl-2.5 pr-3 text-left bg-[#12121c] border transition-colors ${
                      category === "trigger" ? "rounded-l-[28px] rounded-r-md" : "rounded-md"
                    } ${isSelected ? "border-[#ff6b35] shadow-[0_0_0_3px_rgba(255,107,53,0.2)]" : "border-[#2a2a3a] hover:border-[#4a4a5a]"}`}
                  >
                    <span
                      className="shrink-0 w-9 h-9 grid place-items-center rounded text-[11px] font-bold"
                      style={{ color, backgroundColor: `${color}1a`, border: `1px solid ${color}55` }}
                    >
                      {ABBR[type] ?? type.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="min-w-0">
                      <span className="line-clamp-2 break-words text-xs leading-tight font-bold text-[#e8e6e0]">{n.node.name}</span>
                      <span className="block truncate text-[10px] text-[#6b6b7b]">{type}</span>
                    </span>
                  </button>

                  {/* Input port */}
                  {category !== "trigger" && (
                    <span className="absolute -left-[5px] w-2.5 h-2.5 rounded-full bg-[#2a2a3a] border border-[#4a4a5a]" style={{ top: NODE_H / 2 - 5 }} />
                  )}
                  {/* Output ports */}
                  {Array.from({ length: n.outputs }, (_, i) => {
                    const label = outputLabel(n, i);
                    return (
                      <span key={i} className="absolute left-full" style={{ top: portY(n.outputs, i) - 5 }}>
                        <span className="block -ml-[5px] w-2.5 h-2.5 rounded-full border" style={{ backgroundColor: "#2a2a3a", borderColor: color }} />
                        {label && (
                          <span className="absolute left-1.5 -top-3 text-[9px] leading-none text-[#8b8b9b] whitespace-nowrap">{label}</span>
                        )}
                      </span>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {layout.missing.length > 0 && (
        <p className="px-4 py-2 border-t border-[#1e1e2e] text-[11px] text-[#febc2e]">
          ⚠ {d.missing} {layout.missing.join(", ")}
        </p>
      )}

      {/* Selected node details */}
      <div className="border-t border-[#1e1e2e] bg-[#0a0a12] px-4 py-3">
        {selectedNode ? (
          <div>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-xs font-bold text-[#f0ede6]">{selectedNode.name}</span>
              <span className="text-[11px] text-[#6b6b7b]">
                {selectedNode.type}
                {selectedNode.typeVersion !== undefined && ` · v${selectedNode.typeVersion}`}
              </span>
            </div>
            <p className="mt-2 mb-1 text-[10px] tracking-widest uppercase text-[#4a4a5a]">{d.parameters}</p>
            {selectedNode.parameters && Object.keys(selectedNode.parameters).length > 0 ? (
              <pre className="max-h-48 overflow-auto scrollbar-thin text-[11px] leading-relaxed text-[#a8a59e]">
                {JSON.stringify(selectedNode.parameters, null, 2)}
              </pre>
            ) : (
              <p className="text-[11px] text-[#4a4a5a]">{d.noParams}</p>
            )}
          </div>
        ) : (
          <p className="text-[11px] text-[#4a4a5a]">{d.clickHint}</p>
        )}
      </div>
    </div>
  );
}

function Legend() {
  const { t } = useI18n();
  const items: Category[] = ["trigger", "logic", "data", "http", "app", "db"];
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {items.map((c) => (
        <span key={c} className="flex items-center gap-1.5 text-[10px] text-[#6b6b7b]">
          <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: CATEGORY_COLOR[c] }} />
          {t.diagram.categories[c]}
        </span>
      ))}
    </div>
  );
}

function ToolButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="w-7 h-7 grid place-items-center text-sm text-[#8b8b9b] hover:text-[#e8e6e0] border border-[#1e1e2e] hover:border-[#3a3a4a] rounded-sm transition-colors"
    >
      {children}
    </button>
  );
}
