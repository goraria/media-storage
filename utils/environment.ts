import dotenv from "dotenv";

dotenv.config({
  path: ".env.local",
  override: false,
  debug: false,
  quiet: true,
});

export const nodeEnv = process.env.NODE_ENV;
export const isProduction = nodeEnv === "production";
export const port = process.env.NITRO_PUBLIC_PORT;

export const authUrl = process.env.NITRO_PUBLIC_AUTH_URL;
export const databaseUrl = process.env.DATABASE_URL;
export const pgPoolMax = process.env.PG_POOL_MAX;
export const ffmpegPath = process.env.NITRO_FFMPEG_PATH;
export const ffprobePath = process.env.NITRO_FFPROBE_PATH;
export const oauthClientId = process.env.NITRO_OAUTH_CLIENT_ID;
export const oauthClientSecret = process.env.NITRO_OAUTH_CLIENT_SECRET;


// Telemetry is Vercel-only; do not opt into a separately configured collector.
export const vercelTelemetryEnabled = process.env.VERCEL === "1" &&
  ![process.env.OTEL_EXPORTER_OTLP_ENDPOINT, process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
    process.env.OTEL_EXPORTER_OTLP_HEADERS, process.env.OTEL_EXPORTER_OTLP_TRACES_HEADERS].some(Boolean)
export const vercelDeployment = process.env.VERCEL === "1"
export const cronSecret = process.env.CRON_SECRET ?? ""

// Optional operator-owned OAuth client aliases; validated against existing namespaces.
