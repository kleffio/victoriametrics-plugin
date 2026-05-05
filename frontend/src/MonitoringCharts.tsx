import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { usePluginContext } from "@kleffio/sdk";

interface Props {
  projectId?: string;
  refreshKey?: number;
  showHost?: boolean;
}

interface PromResult {
  metric: Record<string, string>;
  values: [number, string][];
}

interface PromResponse {
  status: string;
  data: {
    resultType: string;
    result: PromResult[];
  };
}

interface DataPoint {
  time: string;
  [workload: string]: string | number;
}

function toLabel(metric: Record<string, string>) {
  return (
    metric.workload_name ||
    metric.workload_id ||
    metric.name ||
    metric.instance?.split(":")[0] ||
    "host"
  );
}

const COLORS = ["#6366f1", "#22d3ee", "#f59e0b", "#34d399", "#f87171", "#a78bfa"];
const TOTAL_COLOR = "#818cf8";
const HOST_COLOR = "#f59e0b";

function useQueryRange(
  api: ReturnType<typeof usePluginContext>["api"],
  query: string,
  rangeSeconds: number,
  step: number,
  refreshKey?: number,
) {
  const [data, setData] = useState<DataPoint[]>([]);

  const fetch = useCallback(async () => {
    const now = Math.floor(Date.now() / 1000);
    const start = now - rangeSeconds;
    const params = new URLSearchParams({
      query,
      start: String(start),
      end: String(now),
      step: String(step),
    });
    try {
      const resp = await api.get<PromResponse>(
        `/api/v1/metrics/query_range?${params}`
      );
      if (resp.status !== "success") return;

      const timeMap = new Map<number, DataPoint>();
      for (const series of resp.data.result) {
        const label = toLabel(series.metric);
        for (const [ts, val] of series.values) {
          if (!timeMap.has(ts)) {
            timeMap.set(ts, {
              time: new Date(ts * 1000).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              }),
            });
          }
          timeMap.get(ts)![label] = parseFloat(parseFloat(val).toFixed(2));
        }
      }
      setData(Array.from(timeMap.values()).sort((a, b) => a.time < b.time ? -1 : 1));
    } catch {
      // silently ignore — the monitoring plugin may not be installed
    }
  }, [api, query, rangeSeconds, step, refreshKey]);

  useEffect(() => {
    fetch();
    const id = setInterval(fetch, 60_000);
    return () => clearInterval(id);
  }, [fetch]);

  return data;
}

function allKeys(data: DataPoint[]) {
  const keys = new Set<string>();
  for (const point of data) {
    for (const k of Object.keys(point)) {
      if (k !== "time") keys.add(k);
    }
  }
  return [...keys];
}

function toTotalData(data: DataPoint[]): DataPoint[] {
  return data.map((point) => {
    let sum = 0;
    for (const [k, v] of Object.entries(point)) {
      if (k !== "time" && typeof v === "number") sum += v;
    }
    return { time: point.time, Total: parseFloat(sum.toFixed(2)) };
  });
}

function toFilteredData(data: DataPoint[], selected: Set<string>): DataPoint[] {
  return data.map((point) => {
    const out: DataPoint = { time: point.time };
    for (const [k, v] of Object.entries(point)) {
      if (k !== "time" && selected.has(k)) out[k] = v;
    }
    return out;
  });
}

// ── Dropdown ──────────────────────────────────────────────────────────────────

interface DropdownProps {
  allWorkloads: string[];
  colorMap: Map<string, string>;
  selected: Set<string>;
  onToggle: (wl: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
}

function WorkloadDropdown({
  allWorkloads,
  colorMap,
  selected,
  onToggle,
  onSelectAll,
  onClearAll,
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const label =
    selected.size === allWorkloads.length
      ? `All workloads (${allWorkloads.length})`
      : selected.size === 0
      ? "None selected"
      : selected.size === 1
      ? [...selected][0]
      : `${selected.size} of ${allWorkloads.length} workloads`;

  return (
    <div ref={ref} style={{ position: "relative", userSelect: "none" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "5px 10px",
          borderRadius: 8,
          fontSize: 11,
          cursor: "pointer",
          border: "1px solid rgba(255,255,255,0.1)",
          background: "rgba(255,255,255,0.04)",
          color: "rgba(255,255,255,0.6)",
          whiteSpace: "nowrap",
        }}
      >
        <span>Filter: {label}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ opacity: 0.5, transform: open ? "rotate(180deg)" : undefined, transition: "transform 0.15s" }}>
          <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            zIndex: 50,
            minWidth: 220,
            maxHeight: 320,
            overflowY: "auto",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.09)",
            background: "var(--popover)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.7)",
            padding: "6px 0",
          }}
        >
          <div style={{ display: "flex", gap: 6, padding: "4px 10px 6px" }}>
            <button onClick={onSelectAll} style={actionBtn}>Select all</button>
            <button onClick={onClearAll} style={{ ...actionBtn, color: "rgba(255,100,100,0.5)" }}>Clear all</button>
          </div>

          <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "4px 0" }} />

          {allWorkloads.map((wl) => {
            const color = colorMap.get(wl) ?? COLORS[0];
            const checked = selected.has(wl);
            return (
              <label key={wl} style={rowStyle}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(wl)}
                  style={{ accentColor: color }}
                />
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
                <span
                  style={{
                    color: checked ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.3)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={wl}
                >
                  {wl}
                </span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "5px 12px",
  fontSize: 11,
  cursor: "pointer",
  width: "100%",
};

const actionBtn: React.CSSProperties = {
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 5,
  padding: "2px 8px",
  fontSize: 10,
  color: "rgba(255,255,255,0.4)",
  cursor: "pointer",
};

// ── Chart ─────────────────────────────────────────────────────────────────────

function Chart({
  title,
  unit,
  data,
  colorMap,
  showTotal,
}: {
  title: string;
  unit: string;
  data: DataPoint[];
  colorMap: Map<string, string>;
  showTotal: boolean;
}) {
  const workloads = useMemo(() => allKeys(data), [data]);

  return (
    <div
      style={{
        borderRadius: 12,
        border: "1px solid rgba(255,255,255,0.07)",
        background: "var(--card)",
        padding: "20px 24px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
      }}
    >
      <p style={{ margin: "0 0 16px", fontSize: 13, fontWeight: 600 }}>
        {title}
        <span style={{ fontWeight: 400, fontSize: 11, opacity: 0.4, marginLeft: 6 }}>({unit})</span>
      </p>
      {data.length === 0 ? (
        <div
          style={{
            height: 140,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            color: "rgba(255,255,255,0.25)",
          }}
        >
          No data
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey="time"
              tick={{ fontSize: 10, fill: "rgba(255,255,255,0.3)" }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 10, fill: "rgba(255,255,255,0.3)" }}
              tickLine={false}
              axisLine={false}
              width={45}
            />
            <Tooltip
              contentStyle={{
                background: "var(--card)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 8,
                fontSize: 11,
              }}
              labelStyle={{ color: "rgba(255,255,255,0.5)", marginBottom: 4 }}
              formatter={(v: number, name: string) => [`${v} ${unit}`, name]}
            />
            {workloads.map((wl) => (
              <Line
                key={wl}
                type="monotone"
                dataKey={wl}
                stroke={showTotal ? TOTAL_COLOR : (colorMap.get(wl) ?? COLORS[0])}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ── Container metrics section (cAdvisor) ──────────────────────────────────────

function ContainerSection({
  api,
  projectId,
  refreshKey,
}: {
  api: ReturnType<typeof usePluginContext>["api"];
  projectId?: string;
  refreshKey?: number;
}) {
  // image!="" filters to real containers only (excludes host/cgroup entries).
  // kleff.io/project_id is set by the daemon on all workload containers; cAdvisor
  // exposes it as container_label_kleff_io_project_id in Prometheus metrics.
  const baseFilter = `image!=""`;
  const projectFilter = projectId ? `,container_label_kleff_io_project_id="${projectId}"` : "";
  const labelFilter = `{${baseFilter}${projectFilter}}`;

  const cpuData = useQueryRange(
    api,
    `sum by (name) (rate(container_cpu_usage_seconds_total${labelFilter}[5m])) * 1000`,
    3600, 60, refreshKey,
  );
  const memData = useQueryRange(
    api,
    `sum by (name) (container_memory_usage_bytes${labelFilter}) / 1024 / 1024`,
    3600, 60, refreshKey,
  );
  const netData = useQueryRange(
    api,
    `sum by (name) (rate(container_network_receive_bytes_total${labelFilter}[5m])) / 1024 / 1024`,
    3600, 60, refreshKey,
  );
  const diskData = useQueryRange(
    api,
    `sum by (name) (rate(container_fs_reads_bytes_total${labelFilter}[5m])) / 1024 / 1024`,
    3600, 60, refreshKey,
  );

  const colorMap = useMemo(() => {
    const keys = new Set([...allKeys(cpuData), ...allKeys(memData), ...allKeys(netData), ...allKeys(diskData)]);
    const m = new Map<string, string>();
    [...keys].sort().forEach((k, i) => m.set(k, COLORS[i % COLORS.length]));
    return m;
  }, [cpuData, memData, netData, diskData]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.05)" }} />
        <p style={{ margin: 0, fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.25)", textTransform: "uppercase", letterSpacing: "0.08em", whiteSpace: "nowrap" }}>
          Containers (cAdvisor)
        </p>
        <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.05)" }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Chart title="CPU Usage"    unit="millicores" data={cpuData}  colorMap={colorMap} showTotal={false} />
        <Chart title="Memory Usage" unit="MB"         data={memData}  colorMap={colorMap} showTotal={false} />
        <Chart title="Network Rx"   unit="MB/s"       data={netData}  colorMap={colorMap} showTotal={false} />
        <Chart title="Disk I/O"     unit="MB/s"       data={diskData} colorMap={colorMap} showTotal={false} />
      </div>
    </div>
  );
}

// ── Host metrics section (node exporter) ──────────────────────────────────────

function HostSection({
  api,
  refreshKey,
}: {
  api: ReturnType<typeof usePluginContext>["api"];
  refreshKey?: number;
}) {
  const cpuData = useQueryRange(
    api,
    `avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100`,
    3600, 60, refreshKey,
  );
  const memData = useQueryRange(
    api,
    `node_memory_MemAvailable_bytes / 1024 / 1024`,
    3600, 60, refreshKey,
  );
  const netData = useQueryRange(
    api,
    `sum by (instance) (rate(node_network_receive_bytes_total[5m])) / 1024 / 1024`,
    3600, 60, refreshKey,
  );
  const diskData = useQueryRange(
    api,
    `sum by (instance) (rate(node_disk_read_bytes_total[5m])) / 1024 / 1024`,
    3600, 60, refreshKey,
  );

  const hostColorMap = new Map<string, string>();
  for (const d of [cpuData, memData, netData, diskData]) {
    for (const k of allKeys(d)) hostColorMap.set(k, HOST_COLOR);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.05)" }} />
        <p style={{ margin: 0, fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.25)", textTransform: "uppercase", letterSpacing: "0.08em", whiteSpace: "nowrap" }}>
          Host (Node Exporter)
        </p>
        <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.05)" }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Chart title="CPU Available" unit="%" data={cpuData} colorMap={hostColorMap} showTotal={false} />
        <Chart title="Memory Available" unit="MB" data={memData} colorMap={hostColorMap} showTotal={false} />
        <Chart title="Network Rx" unit="MB/s" data={netData} colorMap={hostColorMap} showTotal={false} />
        <Chart title="Disk Read" unit="MB/s" data={diskData} colorMap={hostColorMap} showTotal={false} />
      </div>
    </div>
  );
}

// ── Workload charts slot component ────────────────────────────────────────────

export function WorkloadCharts({ projectId, refreshKey }: Props) {
  const { api } = usePluginContext();

  const filter = projectId ? `{project_id="${projectId}"}` : "";

  const cpuMillicores = useQueryRange(api, `sum by (workload_name, workload_id) (kleff_workload_cpu_millicores${filter})`, 3600, 60, refreshKey);
  const memData      = useQueryRange(api, `sum by (workload_name, workload_id) (kleff_workload_memory_mb${filter})`,      3600, 60, refreshKey);
  const netRxData    = useQueryRange(api, `sum by (workload_name, workload_id) (kleff_workload_network_rx_mb${filter})`,  3600, 60, refreshKey);
  const diskData     = useQueryRange(api, `sum by (workload_name, workload_id) (kleff_workload_disk_read_mb${filter})`,   3600, 60, refreshKey);

  const cpuData = useMemo(() => cpuMillicores.map((point) => {
    const converted: DataPoint = { time: point.time };
    for (const [k, v] of Object.entries(point)) {
      if (k === "time") continue;
      converted[k] = typeof v === "number" ? parseFloat((v / 1000).toFixed(3)) : v;
    }
    return converted;
  }), [cpuMillicores]);

  const allWorkloads = useMemo(() => {
    const keys = new Set([...allKeys(cpuData), ...allKeys(memData), ...allKeys(netRxData), ...allKeys(diskData)]);
    return [...keys].sort();
  }, [cpuData, memData, netRxData, diskData]);

  const colorMap = useMemo(() => {
    const m = new Map<string, string>();
    allWorkloads.forEach((wl, i) => m.set(wl, COLORS[i % COLORS.length]));
    return m;
  }, [allWorkloads]);

  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    setSelected((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const wl of allWorkloads) {
        if (!next.has(wl)) { next.add(wl); changed = true; }
      }
      return changed ? next : prev;
    });
  }, [allWorkloads]);

  const toggle = (wl: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(wl) ? next.delete(wl) : next.add(wl);
      return next;
    });

  const filteredCpu  = toFilteredData(cpuData, selected);
  const filteredMem  = toFilteredData(memData, selected);
  const filteredNet  = toFilteredData(netRxData, selected);
  const filteredDisk = toFilteredData(diskData, selected);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.05)" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.25)", textTransform: "uppercase", letterSpacing: "0.08em", whiteSpace: "nowrap" }}>
            Per Workload
          </p>
          {allWorkloads.length > 0 && (
            <WorkloadDropdown
              allWorkloads={allWorkloads}
              colorMap={colorMap}
              selected={selected}
              onToggle={toggle}
              onSelectAll={() => setSelected(new Set(allWorkloads))}
              onClearAll={() => setSelected(new Set())}
            />
          )}
        </div>
        <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.05)" }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Chart title="CPU Usage"    unit="cores" data={filteredCpu}  colorMap={colorMap} showTotal={false} />
        <Chart title="Memory Usage" unit="MB"    data={filteredMem}  colorMap={colorMap} showTotal={false} />
        <Chart title="Network In"   unit="MB"    data={filteredNet}  colorMap={colorMap} showTotal={false} />
        <Chart title="Disk Read"    unit="MB"    data={filteredDisk} colorMap={colorMap} showTotal={false} />
      </div>
    </div>
  );
}

// ── Workload total charts slot component ──────────────────────────────────────

export function WorkloadTotalCharts({ projectId, refreshKey }: Props) {
  const { api } = usePluginContext();

  const filter = projectId ? `{project_id="${projectId}"}` : "";

  const cpuMillicores = useQueryRange(api, `sum by (workload_name, workload_id) (kleff_workload_cpu_millicores${filter})`, 3600, 60, refreshKey);
  const memData       = useQueryRange(api, `sum by (workload_name, workload_id) (kleff_workload_memory_mb${filter})`,      3600, 60, refreshKey);
  const netRxData     = useQueryRange(api, `sum by (workload_name, workload_id) (kleff_workload_network_rx_mb${filter})`,  3600, 60, refreshKey);
  const diskData      = useQueryRange(api, `sum by (workload_name, workload_id) (kleff_workload_disk_read_mb${filter})`,   3600, 60, refreshKey);

  const cpuData = useMemo(() => cpuMillicores.map((point) => {
    const converted: DataPoint = { time: point.time };
    for (const [k, v] of Object.entries(point)) {
      if (k === "time") continue;
      converted[k] = typeof v === "number" ? parseFloat((v / 1000).toFixed(3)) : v;
    }
    return converted;
  }), [cpuMillicores]);

  const totalCpu  = useMemo(() => toTotalData(cpuData),   [cpuData]);
  const totalMem  = useMemo(() => toTotalData(memData),   [memData]);
  const totalNet  = useMemo(() => toTotalData(netRxData), [netRxData]);
  const totalDisk = useMemo(() => toTotalData(diskData),  [diskData]);

  const totalColorMap = new Map([["Total", TOTAL_COLOR]]);

  const hasData = totalCpu.length > 0 || totalMem.length > 0 || totalNet.length > 0 || totalDisk.length > 0;
  if (!hasData) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.05)" }} />
        <p style={{ margin: 0, fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.25)", textTransform: "uppercase", letterSpacing: "0.08em", whiteSpace: "nowrap" }}>
          Total
        </p>
        <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.05)" }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Chart title="CPU Usage"    unit="cores" data={totalCpu}  colorMap={totalColorMap} showTotal={true} />
        <Chart title="Memory Usage" unit="MB"    data={totalMem}  colorMap={totalColorMap} showTotal={true} />
        <Chart title="Network In"   unit="MB"    data={totalNet}  colorMap={totalColorMap} showTotal={true} />
        <Chart title="Disk Read"    unit="MB"    data={totalDisk} colorMap={totalColorMap} showTotal={true} />
      </div>
    </div>
  );
}

// ── Container charts slot component ──────────────────────────────────────────

export function ContainerCharts({ projectId, refreshKey }: Props) {
  const { api } = usePluginContext();
  const [hasSource, setHasSource] = useState<boolean>(false);

  useEffect(() => {
    api.get<{ data: { plugins: unknown[] } }>("/api/v1/plugins/by-capability?capability=monitoring.source.containers")
      .then((r) => setHasSource((r?.data?.plugins?.length ?? 0) > 0))
      .catch(() => setHasSource(false));
  }, [api]);

  if (!hasSource) return null;
  return <ContainerSection api={api} projectId={projectId} refreshKey={refreshKey} />;
}

// ── Host charts slot component ────────────────────────────────────────────────

export function HostCharts({ refreshKey, showHost }: Props) {
  const { api } = usePluginContext();
  const [hasSource, setHasSource] = useState<boolean>(false);

  useEffect(() => {
    if (!showHost) return;
    const now = Math.floor(Date.now() / 1000);
    api.get<PromResponse>(
      `/api/v1/metrics/query_range?query=node_uname_info&start=${now - 120}&end=${now}&step=60`
    )
      .then((r) => setHasSource(r?.status === "success" && (r?.data?.result?.length ?? 0) > 0))
      .catch(() => setHasSource(false));
  }, [api, showHost, refreshKey]);

  if (!showHost || !hasSource) return null;
  return <HostSection api={api} refreshKey={refreshKey} />;
}

// ── Legacy export (workload + containers + host in one component) ──────────────

export function MonitoringCharts({ projectId, refreshKey, showHost }: Props) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <WorkloadCharts projectId={projectId} refreshKey={refreshKey} />
      <ContainerCharts projectId={projectId} refreshKey={refreshKey} />
      {showHost && <HostCharts refreshKey={refreshKey} showHost={showHost} />}
    </div>
  );
}
