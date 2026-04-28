// Command plugin is the entrypoint for the metrics-victoriametrics Kleff plugin.
// It receives workload metric samples via gRPC and writes them to VictoriaMetrics.
// It also serves the embedded frontend JS bundle on port 3001.
package main

import (
	"embed"
	"io/fs"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	pluginsv1 "github.com/kleffio/plugin-sdk-go/v1"
	grpcadapter "github.com/kleffio/victoriametrics-plugin/internal/adapters/grpc"
	"github.com/kleffio/victoriametrics-plugin/internal/adapters/victoriametrics"
	"github.com/kleffio/victoriametrics-plugin/internal/application"
	"google.golang.org/grpc"
)

//go:embed dist/index.js
var distFS embed.FS

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))

	vmURL := env("VICTORIA_METRICS_URL", "http://victoriametrics:8428")
	vmClient := victoriametrics.New(vmURL)
	logger.Info("victoriametrics backend", "url", vmURL)

	svc := application.New(vmClient)
	srv := grpcadapter.New(svc)

	gs := grpc.NewServer()
	pluginsv1.RegisterPluginHealthServer(gs, srv)
	pluginsv1.RegisterMonitoringFrameworkServer(gs, srv)

	port := env("PLUGIN_PORT", "50051")
	lis, err := net.Listen("tcp", ":"+port)
	if err != nil {
		logger.Error("listen failed", "error", err)
		os.Exit(1)
	}

	go func() {
		logger.Info("plugin gRPC listening", "port", port)
		if err := gs.Serve(lis); err != nil {
			logger.Error("gRPC server error", "error", err)
			os.Exit(1)
		}
	}()

	go func() {
		sub, _ := fs.Sub(distFS, "dist")
		mux := http.NewServeMux()
		mux.HandleFunc("/plugin.js", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/javascript")
			http.ServeFileFS(w, r, sub, "index.js")
		})
		logger.Info("plugin JS server listening", "port", "3001")
		if err := http.ListenAndServe(":3001", mux); err != nil {
			logger.Error("JS server error", "error", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGTERM, syscall.SIGINT)
	<-stop
	logger.Info("shutting down")
	gs.GracefulStop()
}

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
