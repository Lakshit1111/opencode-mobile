const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
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

function genServerId() {
  return "srv-" + crypto.randomBytes(4).toString("hex");
}

function normalizeProfile(p) {
  return {
    id: p.id || genServerId(),
    name: p.name || "OpenCode server",
    url: (p.url || "").replace(/\/+$/, ""),
    username: p.username && p.username.length ? p.username : "opencode",
    password: p.password || "",
    autoDiscover: p.autoDiscover === true,
  };
}

function loadConfig() {
  const defaults = {
    apiKey: "",
    allowedIPs: ["*"],
    maxConnections: 5,
    bridgePort: 3456,
    servers: [],
    activeServerId: "",
    autoStartBridge: true,
    logLevel: "info",
  };
  if (fs.existsSync(CONFIG_PATH)) {
    let saved;
    try {
      saved = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    } catch (e) {
      console.error("Failed to parse config.json, using defaults:", e.message);
      return defaults;
    }
    let cfg = { ...defaults, ...saved };

    // Migrate legacy single-server config into the servers array.
    const hasServers = Array.isArray(cfg.servers) && cfg.servers.length > 0;
    const legacyUrl = cfg.opencodeBaseUrl;
    if (!hasServers && legacyUrl && typeof legacyUrl === "string") {
      const profile = normalizeProfile({
        id: "srv-migrated",
        name: "Migrated server",
        url: legacyUrl,
        username: cfg.opencodeUsername || "opencode",
        password: cfg.opencodePassword || "",
        autoDiscover: cfg.autoDiscover === true,
      });
      cfg.servers = [profile];
      cfg.activeServerId = profile.id;
      // Keep legacy keys around for reference but they are no longer authoritative.
      log("info", "config", "Migrated legacy opencodeBaseUrl into servers array", { url: profile.url });
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2) + "\n");
    }
    cfg.servers = (cfg.servers || []).map(normalizeProfile);
    if (!cfg.activeServerId && cfg.servers.length > 0) {
      cfg.activeServerId = cfg.servers[0].id;
    }
    return cfg;
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

function activeServer(cfg) {
  if (!cfg.servers || cfg.servers.length === 0) return null;
  return cfg.servers.find((s) => s.id === cfg.activeServerId) || cfg.servers[0];
}

function basicAuthHeader(username, password) {
  if (!password) return undefined;
  const pair = `${username || "opencode"}:${password}`;
  return "Basic " + Buffer.from(pair).toString("base64");
}

async function tryServer(url, authHeader) {
  try {
    const headers = { Accept: "application/json", "Accept-Encoding": "identity" };
    if (authHeader) headers["Authorization"] = authHeader;
    const healthRes = await fetch(url + "/global/health", { headers, signal: AbortSignal.timeout(2000) });
    if (!healthRes.ok) {
      log("debug", "discovery", `tryServer health failed`, { url, status: healthRes.status, auth: !!authHeader });
      return null;
    }
    const health = await healthRes.json();
    if (!health.healthy) return null;
    const sessRes = await fetch(url + "/session", { headers, signal: AbortSignal.timeout(2000) });
    if (!sessRes.ok) return null;
    const sessions = await sessRes.json();
    return { url, sessionCount: Array.isArray(sessions) ? sessions.length : 0, version: health.version };
  } catch (e) {
    log("debug", "discovery", `tryServer error`, { url, error: e.message, auth: !!authHeader });
    return null;
  }
}

// Discovery operates on a single profile. It scans for local OpenCode processes
// and tries auth using the profile's credentials + any OPENCODE_SERVER_PASSWORD
// env var. On success it mutates the profile (url/username/password) and returns
// { profile, allServers } or null.
async function discoverProfile(profile) {
  log("info", "discovery", "Starting auto-discovery for profile", { id: profile.id, name: profile.name });
  const candidates = new Set();
  if (profile.url) candidates.add(profile.url.replace(/\/+$/, ""));

  try {
    const os = require("os");
    const { execSync } = require("child_process");
    const out = execSync('netstat -ano -p tcp', { encoding: 'utf8', timeout: 5000 });
    const lines = out.split("\n").filter((l) => l.includes("LISTENING"));
    const pidsByPort = new Map();
    for (const line of lines) {
      const m = line.trim().match(/^\S+\s+\S+?:(\d+)\s+\S+\s+LISTENING\s+(\d+)/);
      if (m) pidsByPort.set(parseInt(m[1]), parseInt(m[2]));
    }
    const procOut = execSync('tasklist /fo csv /nh', { encoding: 'utf8', timeout: 5000 });
    const opencodePids = new Set();
    for (const line of procOut.split("\n")) {
      if (/opencode/i.test(line)) {
        const parts = line.match(/"([^"]+)"/g);
        if (parts && parts[1]) opencodePids.add(parseInt(parts[1].replace(/"/g, "")));
      }
    }
    for (const [port, pid] of pidsByPort) {
      if (opencodePids.has(pid) && port > 1024) {
        candidates.add(`http://127.0.0.1:${port}`);
      }
    }
    log("info", "discovery", `Found ${candidates.size} candidate URLs`, { candidates: Array.from(candidates) });
  } catch (e) {
    log("warn", "discovery", "Port scan failed", { error: e.message });
  }

  const envPassword = process.env.OPENCODE_SERVER_PASSWORD;
  const envUser = process.env.OPENCODE_SERVER_USERNAME || "opencode";
  const authHeaders = new Set();
  authHeaders.add(undefined);
  if (profile.password) authHeaders.add(basicAuthHeader(profile.username, profile.password));
  if (envPassword) authHeaders.add(basicAuthHeader(envUser, envPassword));

  let best = null;
  const allWorking = [];
  for (const url of candidates) {
    const noAuthResult = await tryServer(url, undefined);
    let authResult = null;
    for (const auth of authHeaders) {
      if (auth === undefined) continue;
      const r = await tryServer(url, auth);
      if (r) { authResult = { ...r, authHeader: auth }; break; }
    }
    const result = authResult || noAuthResult;
    if (result) {
      const requiresAuth = !noAuthResult && !!authResult;
      const score = result.sessionCount + (requiresAuth ? 10000 : 0);
      const info = {
        url: result.url,
        sessionCount: result.sessionCount,
        username: requiresAuth ? envUser : "",
        password: requiresAuth ? (envPassword || profile.password || "") : "",
        score,
      };
      allWorking.push(info);
      if (!best || score > best.score) best = info;
    }
  }

  if (!best) return null;
  return {
    url: best.url,
    username: best.username || profile.username,
    password: best.password,
    sessionCount: best.sessionCount,
    allServers: allWorking.map((s) => ({ url: s.url, username: s.username, password: s.password })),
  };
}

async function runDiscoveryForActive(cfg, { persist = true } = {}) {
  const profile = activeServer(cfg);
  if (!profile) return null;
  if (!profile.autoDiscover) {
    log("debug", "discovery", `Profile ${profile.id} has autoDiscover=false, skipping`);
    return null;
  }
  const discovered = await discoverProfile(profile);
  if (!discovered) return null;
  profile.url = discovered.url;
  if (discovered.username) profile.username = discovered.username;
  if (discovered.password) profile.password = discovered.password;
  if (persist) saveConfig(cfg);
  log("info", "discovery", `Discovered server for profile ${profile.id}`, { url: discovered.url, sessions: discovered.sessionCount });
  return discovered;
}

async function testProfile(profile) {
  const authHeader = basicAuthHeader(profile.username, profile.password);
  const noAuth = await tryServer(profile.url, undefined);
  const withAuth = authHeader ? await tryServer(profile.url, authHeader) : null;
  if (noAuth) {
    return { healthy: true, requiresAuth: false, version: noAuth.version, sessionCount: noAuth.sessionCount };
  }
  if (withAuth) {
    return { healthy: true, requiresAuth: true, version: withAuth.version, sessionCount: withAuth.sessionCount };
  }
  // If unauth health fails with 401/403, the server is up but needs auth.
  try {
    const r = await fetch(profile.url + "/global/health", { headers: { Accept: "application/json", "Accept-Encoding": "identity" }, signal: AbortSignal.timeout(2000) });
    if (r.status === 401 || r.status === 403) {
      return { healthy: false, requiresAuth: true, error: `HTTP ${r.status}` };
    }
    return { healthy: false, requiresAuth: false, error: `HTTP ${r.status}` };
  } catch (e) {
    return { healthy: false, requiresAuth: false, error: e.message };
  }
}

async function proxyRequest(req, res, opencodeUrl, targetPath, opencodeAuth) {
  const proxyStart = Date.now();
  try {
    const url = new URL(targetPath, opencodeUrl);
    log("debug", "proxy", `${req.method} ${targetPath} -> OpenCode ${url.toString()}`);
    const controller = new AbortController();
    const isSyncPost = req.method === "POST" && targetPath.includes("/message") && !targetPath.includes("/prompt_async");
    const timeoutMs = isSyncPost ? 300000 : 30000;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const headers = { ...req.headers, host: undefined };
    delete headers["content-length"];
    delete headers["transfer-encoding"];
    delete headers["expect"];
    if (opencodeAuth) {
      headers["authorization"] = "Basic " + Buffer.from(opencodeAuth).toString("base64");
    }
    headers["accept-encoding"] = "identity";

    const fetchOptions = {
      method: req.method,
      headers: headers,
      signal: controller.signal,
    };

    if (req.method !== "GET" && req.method !== "HEAD") {
      let bodyBuffer;
      if (req.body !== undefined && Object.keys(req.body).length > 0) {
        bodyBuffer = Buffer.from(JSON.stringify(req.body));
      } else {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        bodyBuffer = Buffer.concat(chunks);
      }
      if (bodyBuffer.length > 0) {
        fetchOptions.body = bodyBuffer;
      }
      if (!fetchOptions.headers["content-type"]) {
        fetchOptions.headers["content-type"] = "application/json";
      }
    }

    const response = await fetch(url.toString(), fetchOptions);
    clearTimeout(timeout);
    log("info", "proxy", `${req.method} ${targetPath} -> ${response.status} (${Date.now() - proxyStart}ms)`);

    if (response.status === 500 && req.method === "POST") {
      log("warn", "proxy", `Got 500 for POST ${targetPath}, returning null for fallback`);
      return null;
    }

    res.status(response.status);
    response.headers.forEach((val, key) => {
      const lk = key.toLowerCase();
      if (
        lk !== "transfer-encoding" &&
        lk !== "connection" &&
        lk !== "content-encoding" &&
        lk !== "content-length"
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
    let bodyBuffer = Buffer.from(body);
    const encoding = (response.headers.get("content-encoding") || "").toLowerCase();
    if (encoding.includes("gzip")) {
      try {
        bodyBuffer = zlib.gunzipSync(bodyBuffer);
        log("debug", "proxy", "Decompressed gzip response", { original: body.length, decompressed: bodyBuffer.length });
      } catch (e) {
        log("error", "proxy", "Failed to decompress gzip", { error: e.message });
      }
    } else if (encoding.includes("deflate")) {
      try {
        bodyBuffer = zlib.inflateSync(bodyBuffer);
      } catch (e) {
        log("error", "proxy", "Failed to decompress deflate", { error: e.message });
      }
    } else if (encoding.includes("br")) {
      try {
        bodyBuffer = zlib.brotliDecompressSync(bodyBuffer);
      } catch (e) {
        log("error", "proxy", "Failed to decompress brotli", { error: e.message });
      }
    }
    res.setHeader("Content-Length", bodyBuffer.length);
    res.end(bodyBuffer);
    return null;
  } catch (err) {
    log("error", "proxy", `${req.method} ${targetPath} failed (${Date.now() - proxyStart}ms)`, { error: err.message, cause: err.cause?.message, code: err.cause?.code });
    if (!res.headersSent) {
      res.status(502).json({ error: "Failed to reach OpenCode server", details: err.message, cause: err.cause?.message });
    }
    return null;
  }
}

function ocAuthPair(profile) {
  return profile && profile.password ? `${profile.username}:${profile.password}` : null;
}

async function startServer() {
  let config = loadConfig();
  config = ensureApiKey(config);
  if (config.servers.length === 0) {
    // No servers at all: seed an empty profile so the app can configure it.
    const seeded = normalizeProfile({ id: "srv-default", name: "Default server", url: "http://127.0.0.1:8765", autoDiscover: false });
    config.servers = [seeded];
    config.activeServerId = seeded.id;
    saveConfig(config);
  }
  global.__BRIDGE_CFG__ = config;
  const cur0 = activeServer(config);
  log("info", "bridge", "Config loaded", { bridgePort: config.bridgePort, servers: config.servers.length, active: cur0 ? cur0.id : null, logLevel: config.logLevel });

  // Run discovery for the active profile on startup if enabled.
  await runDiscoveryForActive(config, { persist: true });
  global.__BRIDGE_CFG__ = config;

  let reDiscovering = false;
  async function checkHealthAndReDiscover() {
    if (reDiscovering) return;
    const profile = activeServer(config);
    if (!profile) return;
    if (!profile.autoDiscover) return; // manual profiles are never auto-changed
    try {
      const authHdr = basicAuthHeader(profile.username, profile.password);
      const headers = { Accept: "application/json", "Accept-Encoding": "identity" };
      if (authHdr) headers["Authorization"] = authHdr;
      const r = await fetch(profile.url + "/global/health", { headers, signal: AbortSignal.timeout(3000) });
      if (r.ok) return;
    } catch {
    }
    log("warn", "bridge", "Active OpenCode server unreachable, re-discovering...", { url: profile.url });
    reDiscovering = true;
    try {
      const discovered = await discoverProfile(profile);
      if (discovered) {
        profile.url = discovered.url;
        if (discovered.username) profile.username = discovered.username;
        if (discovered.password) profile.password = discovered.password;
        saveConfig(config);
        log("info", "bridge", `Re-discovered OpenCode server`, { url: discovered.url, sessions: discovered.sessionCount });
      }
    } catch (e) {
      log("error", "bridge", "Re-discovery failed", { error: e.message });
    } finally {
      reDiscovering = false;
    }
  }
  setInterval(checkHealthAndReDiscover, 30000);

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

    // Allow loopback (local control panel) without a token. Also allow
    // requests from the host machine's own LAN IPs — the control panel
    // may be accessed via http://<lan-ip>:3456 from the same computer.
    const loopbackIPs = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
    const clientIP = (req.ip || "").replace(/^::ffff:/, "");
    if (loopbackIPs.has(req.ip || "") || loopbackIPs.has(clientIP)) {
      log("debug", "auth", `Accepted (loopback) ${req.method} ${req.path}`, { ip: req.ip });
      return next();
    }

    // Also allow requests from the host machine's own network IPs.
    const os = require("os");
    const ifaces = os.networkInterfaces();
    const hostIPs = new Set();
    Object.keys(ifaces).forEach((ifname) => {
      ifaces[ifname].forEach((iface) => {
        if (iface.family === "IPv4" && !iface.internal) {
          hostIPs.add(iface.address);
        }
      });
    });
    if (hostIPs.has(clientIP)) {
      log("debug", "auth", `Accepted (host LAN) ${req.method} ${req.path}`, { ip: req.ip });
      return next();
    }

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
    log("debug", "connlimit", `current=${state.connectedClients.size} max=${config.maxConnections}`);
    if (state.connectedClients.size >= config.maxConnections) {
      log("warn", "connlimit", "REJECTED - limit reached");
      return res.status(429).json({ error: "Maximum connections reached" });
    }
    next();
  }

  function checkBridgeEnabled(req, res, next) {
    log("debug", "bridge", `enabled=${state.bridgeEnabled}`);
    if (!state.bridgeEnabled) {
      return res.status(503).json({ error: "Mobile bridge is currently disabled. Toggle it ON from the control panel." });
    }
    next();
  }

  function activeInfo() {
    const profile = activeServer(config);
    if (!profile) return null;
    return {
      id: profile.id,
      name: profile.name,
      url: profile.url,
      username: profile.username,
      requiresAuth: !!profile.password,
      autoDiscover: profile.autoDiscover,
    };
  }

  app.get("/api/health", authenticate, async (req, res) => {
    const profile = activeServer(config);
    let ocHealthy = false;
    let ocVersion = undefined;
    let requiresAuth = false;
    if (profile) {
      try {
        const ocHeaders = { Accept: "application/json", "Accept-Encoding": "identity" };
        if (profile.password) {
          ocHeaders["Authorization"] = "Basic " + Buffer.from(`${profile.username}:${profile.password}`).toString("base64");
        }
        const ocRes = await fetch(new URL("/global/health", profile.url), {
          headers: ocHeaders,
          signal: AbortSignal.timeout(3000),
        });
        if (ocRes.ok) {
          const ocData = await ocRes.json();
          ocHealthy = ocData.healthy === true;
          ocVersion = ocData.version;
          requiresAuth = !!profile.password;
        } else if (ocRes.status === 401 || ocRes.status === 403) {
          requiresAuth = true;
        }
      } catch (_) {}
    }
    const info = activeInfo();
    res.json({
      healthy: ocHealthy,
      version: ocVersion,
      status: "ok",
      bridgeEnabled: state.bridgeEnabled,
      connectedClients: state.connectedClients.size,
      opencodeUrl: profile ? profile.url : null,
      activeServerId: info ? info.id : null,
      activeServerName: info ? info.name : null,
      requiresAuth,
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
      opencodeUrl: activeServer(config)?.url || null,
      activeServerId: config.activeServerId || null,
      apiKey: config.apiKey,
    });
  });

  app.get("/api/config", authenticate, (req, res) => {
    res.json(config);
  });

  app.put("/api/config", authenticate, (req, res) => {
    const allowed = ["allowedIPs", "maxConnections", "logLevel", "servers", "activeServerId"];
    allowed.forEach((key) => {
      if (req.body[key] !== undefined) {
        if (key === "servers" && Array.isArray(req.body.servers)) {
          config.servers = req.body.servers.map(normalizeProfile);
        } else {
          config[key] = req.body[key];
        }
      }
    });
    saveConfig(config);
    global.__BRIDGE_CFG__ = config;
    res.json(config);
  });

  // --- Server profile management ---
  app.get("/api/servers", authenticate, (req, res) => {
    res.json({
      servers: config.servers,
      activeServerId: config.activeServerId,
    });
  });

  app.post("/api/servers", authenticate, (req, res) => {
    const body = req.body || {};
    if (!body.url || typeof body.url !== "string") {
      return res.status(400).json({ error: "url is required" });
    }
    const profile = normalizeProfile({
      id: genServerId(),
      name: body.name || "OpenCode server",
      url: body.url,
      username: body.username,
      password: body.password,
      autoDiscover: body.autoDiscover === true,
    });
    config.servers.push(profile);
    if (!config.activeServerId) config.activeServerId = profile.id;
    saveConfig(config);
    log("info", "servers", `Added profile ${profile.id}`, { name: profile.name, url: profile.url });
    res.status(201).json(profile);
  });

  app.put("/api/servers/:id", authenticate, (req, res) => {
    const profile = config.servers.find((s) => s.id === req.params.id);
    if (!profile) return res.status(404).json({ error: "Server not found" });
    const body = req.body || {};
    const allowed = ["name", "url", "username", "password", "autoDiscover"];
    allowed.forEach((key) => {
      if (body[key] !== undefined) {
        if (key === "url" && typeof body.url === "string") profile.url = body.url.replace(/\/+$/, "");
        else if (key === "username") profile.username = (body.username || "").length ? body.username : "opencode";
        else if (key === "password") profile.password = body.password || "";
        else if (key === "autoDiscover") profile.autoDiscover = body.autoDiscover === true;
        else profile[key] = body[key];
      }
    });
    saveConfig(config);
    log("info", "servers", `Updated profile ${profile.id}`, { name: profile.name, url: profile.url });
    res.json(profile);
  });

  app.delete("/api/servers/:id", authenticate, (req, res) => {
    const id = req.params.id;
    if (id === config.activeServerId) {
      return res.status(400).json({ error: "Cannot delete the active server. Activate another first." });
    }
    const before = config.servers.length;
    config.servers = config.servers.filter((s) => s.id !== id);
    if (config.servers.length === before) {
      return res.status(404).json({ error: "Server not found" });
    }
    if (config.servers.length === 0) {
      return res.status(400).json({ error: "At least one server is required." });
    }
    saveConfig(config);
    log("info", "servers", `Deleted profile ${id}`);
    res.json({ ok: true });
  });

  app.post("/api/servers/:id/test", authenticate, async (req, res) => {
    const profile = config.servers.find((s) => s.id === req.params.id);
    if (!profile) return res.status(404).json({ error: "Server not found" });
    const result = await testProfile(profile);
    log("info", "servers", `Test profile ${profile.id}`, result);
    res.json(result);
  });

  app.post("/api/servers/:id/activate", authenticate, async (req, res) => {
    const profile = config.servers.find((s) => s.id === req.params.id);
    if (!profile) return res.status(404).json({ error: "Server not found" });
    config.activeServerId = profile.id;
    if (profile.autoDiscover) {
      await runDiscoveryForActive(config, { persist: true });
    } else {
      saveConfig(config);
    }
    global.__BRIDGE_CFG__ = config;
    const test = await testProfile(profile);
    log("info", "servers", `Activated profile ${profile.id}`, { url: profile.url, healthy: test.healthy, requiresAuth: test.requiresAuth });
    res.json({
      activeServerId: profile.id,
      ...test,
    });
  });
  // --- end server profile management ---

  // --- API key management ---
  app.post("/api/apikey/regenerate", authenticate, (req, res) => {
    const newKey = "oc-mobile-" + crypto.randomBytes(16).toString("hex");
    config.apiKey = newKey;
    saveConfig(config);
    global.__BRIDGE_CFG__ = config;
    log("warn", "apikey", "API key regenerated");
    res.json({ apiKey: newKey });
  });

  app.put("/api/apikey", authenticate, (req, res) => {
    const newKey = req.body?.apiKey;
    if (!newKey || typeof newKey !== "string" || newKey.trim().length < 8) {
      return res.status(400).json({ error: "API key must be a non-empty string of at least 8 characters" });
    }
    config.apiKey = newKey.trim();
    saveConfig(config);
    global.__BRIDGE_CFG__ = config;
    log("warn", "apikey", "API key changed manually");
    res.json({ apiKey: config.apiKey });
  });
  // --- end API key management ---

  app.all("/api/opencode/*", authenticate, checkIP, checkBridgeEnabled, async (req, res) => {
    const targetPath = "/" + req.params[0];
    const query = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
    const targetWithPathQuery = targetPath + query;
    log("info", "http", `ENTER /api/opencode${targetWithPathQuery}`, {
      method: req.method,
      ip: req.ip,
      auth: req.headers["authorization"] ? "yes" : "no",
      bridgeEnabled: state.bridgeEnabled,
      connectedClients: state.connectedClients.size,
      maxConnections: config.maxConnections,
    });

    const profile = activeServer(config);
    if (!profile) {
      return res.status(502).json({ error: "No active OpenCode server configured. Add one via /api/servers." });
    }
    const ocAuth = ocAuthPair(profile);
    await proxyRequest(req, res, profile.url, targetWithPathQuery, ocAuth);
  });

  app.get("/api/test/proxy", authenticate, async (req, res) => {
    try {
      const profile = activeServer(config);
      if (!profile) return res.status(400).json({ error: "No active server" });
      const ocAuth = ocAuthPair(profile);
      const headers = { Accept: "application/json", "Accept-Encoding": "identity" };
      if (ocAuth) {
        headers["Authorization"] = "Basic " + Buffer.from(ocAuth).toString("base64");
      }
      const r = await fetch(new URL("/global/health", profile.url), { headers });
      const data = await r.text();
      log("info", "test", "Proxy test", { status: r.status, bodyLen: data.length, body: data.substring(0, 200) });
      res.json({
        bridgeStatus: "ok",
        opencodeStatus: r.status,
        opencodeBody: data,
        contentEncoding: r.headers.get("content-encoding"),
        contentType: r.headers.get("content-type"),
        allHeaders: Object.fromEntries(r.headers.entries()),
      });
    } catch (e) {
      log("error", "test", "Proxy test failed", { error: e.message });
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/test/session-small", authenticate, async (req, res) => {
    try {
      const profile = activeServer(config);
      if (!profile) return res.status(400).json({ error: "No active server" });
      const ocAuth = ocAuthPair(profile);
      const headers = { Accept: "application/json", "Accept-Encoding": "identity" };
      if (ocAuth) {
        headers["Authorization"] = "Basic " + Buffer.from(ocAuth).toString("base64");
      }
      const r = await fetch(new URL("/session?limit=1", profile.url), { headers });
      const data = await r.text();
      log("info", "test", "Session small test", {
        status: r.status,
        bodyLen: data.length,
        contentEncoding: r.headers.get("content-encoding"),
        contentType: r.headers.get("content-type"),
        bodyPreview: data.substring(0, 300),
      });
      res.setHeader("Content-Type", "application/json");
      res.send(data);
    } catch (e) {
      log("error", "test", "Session small test failed", { error: e.message });
      res.status(500).json({ error: e.message });
    }
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
    const profile = activeServer(config);
    const ocAuthHeaders = profile && profile.password
      ? { Accept: "text/event-stream", "Accept-Encoding": "identity", Authorization: "Basic " + Buffer.from(`${profile.username}:${profile.password}`).toString("base64") }
      : { Accept: "text/event-stream", "Accept-Encoding": "identity" };

    (async () => {
      try {
        if (!profile) {
          res.write(`event: error\ndata: ${JSON.stringify({ message: "No active OpenCode server configured" })}\n\n`);
          return;
        }
        const eventUrl = new URL("/global/event", profile.url);
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
    const cur = activeServer(config);
    if (cur) {
      console.log("  Active Server:  " + cur.name + " (" + cur.id + ")");
      console.log("  OpenCode URL:   " + cur.url);
      console.log("  Servers:        " + config.servers.length + " configured");
    } else {
      console.log("  No servers configured. Add one via the mobile app.");
    }
    console.log("  Bridge Status:  " + (state.bridgeEnabled ? "ON" : "OFF"));
    console.log("");
    console.log("=".repeat(60));

    process.on("SIGINT", () => {
      console.log("\nShutting down bridge...");
      server.close(() => process.exit(0));
    });
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      log("error", "bridge", `Port ${config.bridgePort} already in use, retrying in 2s...`);
      console.error(`Port ${config.bridgePort} already in use, retrying in 2s...`);
      setTimeout(() => {
        server.close();
        server.listen(config.bridgePort, "0.0.0.0");
      }, 2000);
    } else {
      log("error", "bridge", "Server error", { error: err.message });
      throw err;
    }
  });
}

startServer().catch((err) => {
  console.error("Failed to start bridge:", err);
  process.exit(1);
});