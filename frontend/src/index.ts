import { definePlugin } from "@kleffio/sdk";
import { MonitoringCharts } from "./MonitoringCharts";

const victoriametricsPlugin = definePlugin({
  manifest: {
    id: "kleff.victoriametrics",
    name: "VictoriaMetrics Charts",
    version: "0.1.0",
    description: "Time-series charts powered by VictoriaMetrics.",
    slots: [
      {
        slot: "monitoring.charts",
        component: MonitoringCharts,
      },
    ],
  },
});

if (typeof window !== "undefined" && (window as any).__kleff__?.registry) {
  (window as any).__kleff__.registry.register(victoriametricsPlugin);
}
