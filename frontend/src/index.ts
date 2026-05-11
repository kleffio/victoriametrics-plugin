import { definePlugin } from "@kleffio/sdk";
import { WorkloadDualSection, ContainerHostDualSection, AdminMonitoringSection } from "./MonitoringCharts";

const victoriametricsPlugin = definePlugin({
  manifest: {
    id: "kleff.victoriametrics",
    name: "VictoriaMetrics Charts",
    version: "0.1.0",
    description: "Time-series charts powered by VictoriaMetrics.",
    slots: [
      {
        slot: "monitoring.charts",
        component: WorkloadDualSection,
        priority: 50,
        provides: ["workload.cpu", "workload.memory", "workload.network", "workload.disk", "workload.total.cpu", "workload.total.memory", "workload.total.network", "workload.total.disk"],
      },
      {
        slot: "monitoring.charts",
        component: ContainerHostDualSection,
        priority: 51,
        provides: ["container.cpu", "container.memory", "container.network", "container.disk", "host.cpu", "host.memory", "host.network", "host.disk"],
      },
      {
        slot: "admin.monitoring",
        component: AdminMonitoringSection,
        priority: 50,
        provides: ["admin.monitoring.charts"],
      },
    ],
  },
});

if (typeof window !== "undefined" && (window as any).__kleff__?.registry) {
  (window as any).__kleff__.registry.register(victoriametricsPlugin);
}
