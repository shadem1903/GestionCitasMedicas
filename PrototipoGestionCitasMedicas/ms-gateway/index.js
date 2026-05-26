const express = require("express");
const cors    = require("cors");
const http    = require("http");
const { createProxyMiddleware } = require("http-proxy-middleware");

const app = express();
app.use(cors());

const SERVICIO = "ms-gateway";
const PORT = process.env.PORT || 8080;

function log(nivel, mensaje) {
  console.log(`[${new Date().toISOString()}] [${SERVICIO}] [${nivel}] ${mensaje}`);
}
const MS_USUARIOS_URL       = process.env.MS_USUARIOS_URL       || "http://ms-usuarios:3001";
const MS_DISPONIBILIDAD_URL = process.env.MS_DISPONIBILIDAD_URL || "http://ms-disponibilidad:3003";
const MS_CITAS_URL          = process.env.MS_CITAS_URL          || "http://ms-citas:3004";
const MS_HISTORIAL_URL      = process.env.MS_HISTORIAL_URL      || "http://ms-historial:3005";
const MS_ESPECIALIDADES_URL = process.env.MS_ESPECIALIDADES_URL || "http://ms-especialidades:3007";
const MS_AUTH_URL           = process.env.MS_AUTH_URL           || "http://ms-auth:3006";

// ── Contadores acumulados por servicio ───────────────────────
const contadores = {
  "ms-usuarios":       { errores: 0, exitosos: 0 },
  "ms-especialidades": { errores: 0, exitosos: 0 },
  "ms-disponibilidad": { errores: 0, exitosos: 0 },
  "ms-citas":          { errores: 0, exitosos: 0 },
  "ms-historial":      { errores: 0, exitosos: 0 },
  "ms-auth":           { errores: 0, exitosos: 0 },
};

// ── Ping a un /health con timeout de 3 s ─────────────────────
function pingServicio(nombre, url) {
  return new Promise((resolve) => {
    const inicio = Date.now();
    const req = http.get(`${url}/health`, { timeout: 3000 }, (res) => {
      let body = "";
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => {
        const latencia = Date.now() - inicio;
        try {
          const json = JSON.parse(body);
          contadores[nombre].exitosos++;
          resolve({
            errores:  contadores[nombre].errores,
            exitosos: contadores[nombre].exitosos,
            health:   { ...json, latencia_ms: latencia },
          });
        } catch {
          contadores[nombre].exitosos++;
          resolve({
            errores:  contadores[nombre].errores,
            exitosos: contadores[nombre].exitosos,
            health:   { estado: "ok", latencia_ms: latencia },
          });
        }
      });
    });
    req.on("timeout", () => {
      req.destroy();
      contadores[nombre].errores++;
      resolve({
        errores:  contadores[nombre].errores,
        exitosos: contadores[nombre].exitosos,
        health:   { estado: "timeout", latencia_ms: 3000 },
      });
    });
    req.on("error", (err) => {
      contadores[nombre].errores++;
      resolve({
        errores:  contadores[nombre].errores,
        exitosos: contadores[nombre].exitosos,
        health:   { estado: "error", detalle: err.message },
      });
    });
  });
}

function buildProxy(target, routePrefix) {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    pathRewrite: { [`^${routePrefix}`]: "" },
  });
}

app.get("/", (req, res) => {
  res.json({
    servicio: "ms-gateway",
    version: "1.2.0",
    endpoints: [
      "GET  /health",
      "GET  /api/status",
      "ALL  /api/usuarios/*",
      "ALL  /api/disponibilidad/*",
      "ALL  /api/citas/*",
      "ALL  /api/historial/*",
      "ALL  /api/especialidades/*",
      "ALL  /api/auth/*",
    ],
  });
});

app.get("/health", (req, res) => {
  res.json({ servicio: "ms-gateway", estado: "ok", timestamp: new Date() });
});

// ── GET /api/status — monitoreo de todos los microservicios ──
app.get("/api/status", async (req, res) => {
  const [usuarios, especialidades, disponibilidad, citas, historial, auth] = await Promise.all([
    pingServicio("ms-usuarios",       MS_USUARIOS_URL),
    pingServicio("ms-especialidades", MS_ESPECIALIDADES_URL),
    pingServicio("ms-disponibilidad", MS_DISPONIBILIDAD_URL),
    pingServicio("ms-citas",          MS_CITAS_URL),
    pingServicio("ms-historial",      MS_HISTORIAL_URL),
    pingServicio("ms-auth",           MS_AUTH_URL),
  ]);

  const servicios = {
    "ms-usuarios":       usuarios,
    "ms-especialidades": especialidades,
    "ms-disponibilidad": disponibilidad,
    "ms-citas":          citas,
    "ms-historial":      historial,
    "ms-auth":           auth,
  };

  // Recopilar circuit breakers de los servicios que los exponen
  const circuit_breakers = {};
  if (disponibilidad.health.circuit_breakers) {
    for (const [k, v] of Object.entries(disponibilidad.health.circuit_breakers)) {
      circuit_breakers[`disponibilidad→${k}`] = v;
    }
  }
  if (citas.health.circuit_breakers) {
    for (const [k, v] of Object.entries(citas.health.circuit_breakers)) {
      circuit_breakers[`citas→${k}`] = v;
    }
  }

  const todoOk = Object.values(servicios).every((s) => s.health.estado === "ok");

  res.status(todoOk ? 200 : 207).json({
    gateway:          "ok",
    timestamp:        new Date(),
    sistema:          todoOk ? "operativo" : "degradado",
    circuit_breakers,
    servicios,
  });
});

app.use("/api/usuarios",       buildProxy(MS_USUARIOS_URL,       "/api/usuarios"));
app.use("/api/disponibilidad", buildProxy(MS_DISPONIBILIDAD_URL, "/api/disponibilidad"));
app.use("/api/citas",          buildProxy(MS_CITAS_URL,          "/api/citas"));
app.use("/api/historial",      buildProxy(MS_HISTORIAL_URL,      "/api/historial"));
app.use("/api/especialidades", buildProxy(MS_ESPECIALIDADES_URL, "/api/especialidades"));
app.use("/api/auth",           buildProxy(MS_AUTH_URL,           "/api/auth"));

app.use((req, res) => {
  log("WARN", `Ruta no encontrada: ${req.method} ${req.path}`);
  res.status(404).json({ error: "Ruta no encontrada en API Gateway" });
});

app.use((err, req, res, next) => {
  log("ERROR", `Error no capturado en ${req.method} ${req.path}: ${err.message}`);
  res.status(500).json({ error: "Error interno del gateway" });
});

app.listen(PORT, () => {
  log("INFO", `Corriendo en puerto ${PORT}`);
  log("INFO", `usuarios       -> ${MS_USUARIOS_URL}`);
  log("INFO", `especialidades -> ${MS_ESPECIALIDADES_URL}`);
  log("INFO", `disponibilidad -> ${MS_DISPONIBILIDAD_URL}`);
  log("INFO", `citas          -> ${MS_CITAS_URL}`);
  log("INFO", `historial      -> ${MS_HISTORIAL_URL}`);
  log("INFO", `auth           -> ${MS_AUTH_URL}`);
});
