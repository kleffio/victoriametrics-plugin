# Build context is the plugins/ directory so we can access the local SDK.

# ── Frontend build ────────────────────────────────────────────────────────────
FROM node:22-alpine AS frontend

RUN apk add --no-cache git
WORKDIR /app
COPY victoriametrics-plugin/frontend/package.json ./
RUN npm install
COPY victoriametrics-plugin/frontend/ ./
RUN npm run build

# ── Go build ──────────────────────────────────────────────────────────────────
FROM golang:1.25-alpine AS builder

WORKDIR /src

COPY plugin-sdk-go /plugin-sdk-go
COPY victoriametrics-plugin/go.mod victoriametrics-plugin/go.sum ./
RUN go mod download

COPY victoriametrics-plugin/ .
COPY --from=frontend /app/dist ./cmd/plugin/dist

RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o /plugin ./cmd/plugin

# ── Runtime ───────────────────────────────────────────────────────────────────
FROM alpine:3.20

RUN apk add --no-cache ca-certificates
COPY --from=builder /plugin /plugin

EXPOSE 50051 3001
ENTRYPOINT ["/plugin"]
