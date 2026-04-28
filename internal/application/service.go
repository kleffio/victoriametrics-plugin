// Package application holds the core business logic for the metrics-victoriametrics plugin.
package application

import (
	"context"

	pluginsv1 "github.com/kleffio/plugin-sdk-go/v1"
)

// MetricsStore is implemented by the VictoriaMetrics adapter.
type MetricsStore interface {
	Ingest(ctx context.Context, sample *pluginsv1.MetricSample) error
}

// Service orchestrates metric ingestion.
type Service struct {
	store MetricsStore
}

// New creates a Service backed by the given MetricsStore.
func New(store MetricsStore) *Service {
	return &Service{store: store}
}

// IngestMetrics forwards a metric sample to the backing store.
func (s *Service) IngestMetrics(ctx context.Context, sample *pluginsv1.MetricSample) error {
	if sample == nil {
		return nil
	}
	return s.store.Ingest(ctx, sample)
}
