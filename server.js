import express from "express";
import cors from "cors";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3001;

// ── CORS: allow your frontend domain (update before deploying) ──
const ALLOWED_ORIGINS = [apex-proxy-production-3908.up.railway.app
  "http://localhost:3000",
  "http://localhost:5173",
  "https://your-app-domain.com", // ← replace with your real domain
];

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) cb(null, true);
    else cb(new Error("Not allowed by CORS"));
  },
}));
app.use(express.json());

// ── HEALTH CHECK ──────────────────────────────────────────────
app.get("/health", (_, res) => res.json({ status: "ok" }));

// ── PROXY HANDLER ─────────────────────────────────────────────
// Forwards: POST /proxy  { target, path, method, body }
// target: "broker" | "data"
//   broker → https://paper-api.alpaca.markets  or  https://api.alpaca.markets
//   data   → https://data.alpaca.markets
//
// Headers: x-apca-api-key-id, x-apca-api-secret-key, x-alpaca-mode (paper|live)

app.post("/proxy", async (req, res) => {
  const { path: urlPath, method = "GET", body } = req.body;
  const apiKey    = req.headers["x-apca-api-key-id"];
  const secretKey = req.headers["x-apca-api-secret-key"];
  const mode      = req.headers["x-alpaca-mode"] || "paper"; // "paper" | "live"
  const target    = req.body.target || "broker"; // "broker" | "data"

  if (!apiKey || !secretKey)
    return res.status(401).json({ error: "Missing Alpaca credentials" });
  if (!urlPath)
    return res.status(400).json({ error: "Missing path" });

  const BASE = {
    broker: mode === "live"
      ? "https://api.alpaca.markets"
      : "https://paper-api.alpaca.markets",
    data: "https://data.alpaca.markets",
  };

  const url = `${BASE[target]}${urlPath}`;

  try {
    const upstream = await fetch(url, {
      method,
      headers: {
        "APCA-API-KEY-ID":     apiKey,
        "APCA-API-SECRET-KEY": secretKey,
        "Content-Type":        "application/json",
      },
      ...(body && method !== "GET" ? { body: JSON.stringify(body) } : {}),
    });

    const data = await upstream.json().catch(() => ({ error: "Non-JSON response" }));

    if (!upstream.ok) {
      return res.status(upstream.status).json(data);
    }

    res.json(data);
  } catch (err) {
    console.error("Proxy error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`Apex proxy running on :${PORT}`));
