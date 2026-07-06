const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const http = require("http");

const CONFIG_PATH = path.join(__dirname, "config.json");
const PUBLIC_PATH = path.join(__dirname, "public");

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
function log(level, tag, message, data) {
  const cfg = global.__BRIDGE_CFG__ || { logLevel: "info" };
  if ((LEVELS[level] ?? 2) > (LEVELS[cfg.logLevel] ?? 2)) return;
  const ts = new Date().toISOString();
  const prefix = `[${ts}] [${level.toUpperCase()}] [${tag}]`;
  if (data !== undefined) console.log(prefix, message, data);
  else console.log(prefix, message);
}

function loadConfig() {
  const defaults = {
    apiKey: "",
    allowedIPs: ["*"],
    maxConnections: 5,
    bridgePort: 3456,
    opencodeBaseUrl: "http://127.0.0.1:8765",
    opencodeUsername: "",
    opencodePassword: "",
    autoStartBridge: true,
    logLevel: "info",
  };
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      const saved = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
      return { ...defaults, ...saved };
    } catch (e) {
      console.error("Failed to parse config.json, using defaults:", e.message);
    }
  }
  return defaults;
}

function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2) + "\n");
}

function ensureApiKey(cfg) {
  if (!cfg.apiKey) {
    cfg.apiKey = "oc-mobile-" + crypto.randomBytes(16).toString("hex");
    saveConfig(cfg);
    console.log("");
    console.log("=".repeat(60));
    console.log("  GENERATED NEW API KEY");
    console.log("  Enter this key in your mobile app:");
    console.log("");
    console.log("  " + cfg.apiKey);
    console.log("=".repeat(60));
    console.log("");
  }
  return cfg;
}

async function proxyRequest(req, res, opencodeUrl, targetPath, opencodeAuth) {
  const proxyStart = Date.now();
  try {
    const url = new URL(targetPath, opencodeUrl);
    log("debug", "proxy", `${req.method} ${targetPath} -> OpenCode ${url.toString()}`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const headers = { ...req.headers, host: undefined };
    if (opencodeAuth) {
      headers["authorization"] = "Basic " + Buffer.from(opencodeAuth).toString("base64");
    }

    const fetchOptions = {
      method: req.method,
      headers: headers,
      signal: controller.signal,
    };

    if (req.method !== "GET" && req.method !== "HEAD") {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      fetchOptions.body = Buffer.concat(chunks);
      if (!fetchOptions.headers["content-type"]) {
        fetchOptions.headers["content-type"] = "application/json";
      }
    }

    const response = await fetch(url.toString(), fetchOptions);
    clearTimeout(timeout);
    log("info", "proxy", `${req.method} ${targetPath} -> ${response.status} (${Date.now() - proxyStart}ms)`);

    res.status(response.status);
    response.headers.forEach((val, key) => {
      if (
        key.toLowerCase() !== "transfer-encoding" &&
        key.toLowerCase() !== "connection"
      ) {
        res.setHeader(key, val);
      }
    });

    if (
      response.headers.get("content-type")?.includes("text/event-stream") ||
      response.headers.get("content-type")?.includes("application/stream+json")
    ) {
      return response;
    }

    const body = await response.arrayBuffer();
    res.send(Buffer.from(body));
    return null;
  } catch (err) {
    log("error", "proxy", `${req.method} ${targetPath} failed (${Date.now() - proxyStart}ms)`, { error: err.message });
    if (!res.headersSent) {
      res.status(502).json({ error: "Failed to reach OpenCode server", details: err.message });
    }
    return null;
  }
}

async function startServer() {
  let config = loadConfig();
  config = ensureApiKey(config);
  global.__BRIDGE_CFG__ = config;
  log("info", "bridge", "Config loaded", { bridgePort: config.bridgePort, opencodeBaseUrl: config.opencodeBaseUrl, logLevel: config.logLevel });

  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
      log("info", "http", `${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - start}ms)`, { ip: req.ip });
    });
    next();
  });
  app.use(express.static(PUBLIC_PATH));

  const state = {
    bridgeEnabled: config.autoStartBridge,
    connectedClients: new Map(),
    eventSubscriptions: [],
  };

  function authenticate(req, res, next) {
    const authHeader = req.headers["authorization"];
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : req.query?.token;

    if (!token || token !== config.apiKey) {
      log("warn", "auth", `Rejected ${req.method} ${req.path}`, { ip: req.ip, hasToken: !!token });
      return res.status(401).json({ error: "Unauthorized. Provide a valid API key via Authorization: Bearer <token>" });
    }
    log("debug", "auth", `Accepted ${req.method} ${req.path}`, { ip: req.ip });
    next();
  }

  function checkIP(req, res, next) {
    const clientIP = req.ip || req.connection.remoteAddress;
    if (config.allowedIPs.includes("*")) return next();

    const allowed = config.allowedIPs.some((pattern) => {
      if (pattern.includes("*")) {
        const regex = new RegExp("^" + pattern.replace(/\./g, "\\.").replace(/\*/g, ".*") + "$");
        return regex.test(clientIP);
      }
      return pattern === clientIP;
    });

    if (!allowed) {
      return res.status(403).json({ error: "IP address not allowed" });
    }
    next();
  }

  function checkConnectionLimit(req, res, next) {
    if (state.connectedClients.size >= config.maxConnections) {
      return res.status(429).json({ error: "Maximum connections reached" });
    }
    next();
  }

  function checkBridgeEnabled(req, res, next) {
    if (!state.bridgeEnabled) {
      return res.status(503).json({ error: "Mobile bridge is currently disabled. Toggle it ON from the control panel." });
    }
    next();
  }

  app.get("/api/health", authenticate, async (req, res) => {
    let ocHealthy = false;
    let ocVersion = undefined;
    try {
      const ocHeaders = { Accept: "application/json" };
      if (config.opencodePassword) {
        ocHeaders["Authorization"] = "Basic " + Buffer.from(`${config.opencodeUsername}:${config.opencodePassword}`).toString("base64");
      }
      const ocRes = await fetch(new URL("/global/health", config.opencodeBaseUrl), {
        headers: ocHeaders,
        signal: AbortSignal.timeout(3000),
      });
      if (ocRes.ok) {
        const ocData = await ocRes.json();
        ocHealthy = ocData.healthy === true;
        ocVersion = ocData.version;
      }
    } catch (_) {}
    res.json({
      healthy: ocHealthy,
      version: ocVersion,
      status: "ok",
      bridgeEnabled: state.bridgeEnabled,
      connectedClients: state.connectedClients.size,
      opencodeUrl: config.opencodeBaseUrl,
    });
  });

  app.post("/api/bridge/toggle", authenticate, (req, res) => {
    state.bridgeEnabled = !state.bridgeEnabled;
    res.json({ bridgeEnabled: state.bridgeEnabled });
  });

  app.get("/api/bridge/status", authenticate, (req, res) => {
    res.json({
      bridgeEnabled: state.bridgeEnabled,
      connectedClients: state.connectedClients.size,
      clients: Array.from(state.connectedClients.entries()).map(([id, info]) => ({
        id,
        ip: info.ip,
        connectedAt: info.connectedAt,
      })),
      opencodeUrl: config.opencodeBaseUrl,
      apiKey: config.apiKey,
    });
  });

  app.get("/api/config", authenticate, (req, res) => {
    res.json(config);
  });

  app.put("/api/config", authenticate, (req, res) => {
    const allowed = ["allowedIPs", "maxConnections", "opencodeBaseUrl", "logLevel"];
    allowed.forEach((key) => {
      if (req.body[key] !== undefined) {
        config[key] = req.body[key];
      }
    });
    saveConfig(config);
    res.json(config);
  });

  app.all("/api/opencode/*", authenticate, checkIP, checkBridgeEnabled, checkConnectionLimit, async (req, res) => {
    const targetPath = "/" + req.params[0];
    const ocAuth = config.opencodePassword ? `${config.opencodeUsername}:${config.opencodePassword}` : null;
    await proxyRequest(req, res, config.opencodeBaseUrl, targetPath, ocAuth);
  });

  app.get("/api/events", authenticate, checkIP, checkBridgeEnabled, (req, res) => {
    const clientId = crypto.randomBytes(8).toString("hex");
    state.connectedClients.set(clientId, {
      ip: req.ip || req.connection.remoteAddress,
      connectedAt: new Date().toISOString(),
    });
    log("info", "sse", `Client connected: ${clientId} from ${req.ip} (total: ${state.connectedClients.size})`);

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write(`event: connected\ndata: ${JSON.stringify({ clientId })}\n\n`);

    const controller = new AbortController();
    const ocAuthHeaders = config.opencodePassword
      ? { Accept: "text/event-stream", Authorization: "Basic " + Buffer.from(`${config.opencodeUsername}:${config.opencodePassword}`).toString("base64") }
      : { Accept: "text/event-stream" };

    (async () => {
      try {
        const eventUrl = new URL("/global/event", config.opencodeBaseUrl);
        const response = await fetch(eventUrl.toString(), {
          headers: ocAuthHeaders,
          signal: controller.signal,
        });

        if (!response.ok) {
          res.write(`event: error\ndata: ${JSON.stringify({ message: "Failed to connect to OpenCode event stream" })}\n\n`);
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            res.write(line + "\n");
          }
        }
      } catch (err) {
        if (err.name !== "AbortError") {
          res.write(`event: error\ndata: ${JSON.stringify({ message: err.message })}\n\n`);
        }
      }
    })();

    req.on("close", () => {
      controller.abort();
      state.connectedClients.delete(clientId);
      log("info", "sse", `Client disconnected: ${clientId} (total: ${state.connectedClients.size})`);
    });
  });

  app.get("/api/sync-events", authenticate, checkIP, checkBridgeEnabled, (req, res) => {
    const clientId = crypto.randomBytes(8).toString("hex");
    log("info", "sse-sync", `Client connected: ${clientId} from ${req.ip}`);

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write(`event: connected\ndata: ${JSON.stringify({ clientId })}\n\n`);

    const controller = new AbortController();
    const ocSyncHeaders = config.opencodePassword
      ? { Accept: "text/event-stream", Authorization: "Basic " + Buffer.from(`${config.opencodeUsername}:${config.opencodePassword}`).toString("base64") }
      : { Accept: "text/event-stream" };

    (async () => {
      try {
        const eventUrl = new URL("/global/sync-event", config.opencodeBaseUrl);
        const response = await fetch(eventUrl.toString(), {
          headers: ocSyncHeaders,
          signal: controller.signal,
        });

        if (!response.ok) {
          res.write(`event: error\ndata: ${JSON.stringify({ message: "Failed to connect to OpenCode sync stream" })}\n\n`);
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            res.write(line + "\n");
          }
        }
      } catch (err) {
        if (err.name !== "AbortError") {
          res.write(`event: error\ndata: ${JSON.stringify({ message: err.message })}\n\n`);
        }
      }
    })();

    req.on("close", () => {
      controller.abort();
      log("info", "sse-sync", `Client disconnected: ${clientId}`);
    });
  });

  const server = app.listen(config.bridgePort, "0.0.0.0", () => {
    const nets = [];
    const ifaces = require("os").networkInterfaces();
    Object.keys(ifaces).forEach((ifname) => {
      ifaces[ifname].forEach((iface) => {
        if (iface.family === "IPv4" && !iface.internal) {
          nets.push(iface.address);
        }
      });
    });

    console.log("");
    console.log("=".repeat(60));
    console.log("  OpenCode Mobile Bridge");
    console.log("=".repeat(60));
    console.log("");
    console.log("  Control Panel:  http://localhost:" + config.bridgePort);
    console.log("  API Endpoint:   http://localhost:" + config.bridgePort + "/api/opencode/");
    console.log("  SSE Events:     http://localhost:" + config.bridgePort + "/api/events");
    console.log("");
    if (nets.length > 0) {
      console.log("  Mobile Access (use one of these IPs in your app):");
      nets.forEach((ip) => {
        console.log("    http://" + ip + ":" + config.bridgePort);
      });
    }
    console.log("");
    console.log("  API Key:        " + config.apiKey);
    console.log("");
    console.log("  OpenCode URL:   " + config.opencodeBaseUrl);
    console.log("  Bridge Status:  " + (state.bridgeEnabled ? "ON" : "OFF"));
    console.log("");
    console.log("=".repeat(60));
  });

  process.on("SIGINT", () => {
    console.log("\nShutting down bridge...");
    server.close(() => process.exit(0));
  });
}

startServer().catch((err) => {
  console.error("Failed to start bridge:", err);
  process.exit(1);
});