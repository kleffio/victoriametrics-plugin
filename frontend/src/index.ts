import { definePlugin } from "@kleffio/sdk";
import { WorkloadCharts, WorkloadTotalCharts, ContainerCharts, HostCharts } from "./MonitoringCharts";

const victoriametricsPlugin = definePlugin({
  manifest: {
    id: "kleff.victoriametrics",
    name: "VictoriaMetrics Charts",
    version: "0.1.0",
    description: "Time-series charts powered by VictoriaMetrics.",
    slots: [
      {
        slot: "monitoring.charts",
        component: WorkloadCharts,
        priority: 50,
        provides: ["workload.cpu", "workload.memory", "workload.network", "workload.disk"],
      },
      {
        slot: "monitoring.charts",
        component: WorkloadTotalCharts,
        priority: 51,
        provides: ["workload.total.cpu", "workload.total.memory", "workload.total.network", "workload.total.disk"],
      },
      {
        slot: "monitoring.charts",
        component: ContainerCharts,
        priority: 50,
        provides: ["container.cpu", "container.memory", "container.network", "container.disk"],
      },
      {
        slot: "monitoring.charts",
        component: HostCharts,
        priority: 50,
        provides: ["host.cpu", "host.memory", "host.network", "host.disk"],
      },
    ],
  },
});

if (typeof window !== "undefined" && (window as any).__kleff__?.registry) {
  (window as any).__kleff__.registry.register(victoriametricsPlugin);
}
