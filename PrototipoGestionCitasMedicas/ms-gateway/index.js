const express = require("express");
const cors = require("cors");
const { createProxyMiddleware } = require("http-proxy-middleware");
const http = require("http");

const app = express();
app.use(cors());

const PORT = process.env.PORT || 8080;

// URLs de los microservicios
const MS_USUARIOS_URL = process.env.MS_USUARIOS_URL || "http://ms-usuarios:3001";
const MS_DISPONIBILIDAD_URL = process.env.MS_DISPONIBILIDAD_URL || "http://ms-disponibilidad:3003";
const MS_CITAS_URL = process.env.MS_CITAS_URL || "http://ms-citas:3004";
const MS_HISTORIAL_URL = process.env.MS_HISTORIAL_URL || "http://ms-historial:3005";
const MS_ESPECIALIDADES_URL = process.env.MS_ESPECIALIDADES_URL || "http://ms-especialidades:3007";
const MS_AUTH_URL = process.env.MS_AUTH_URL || "http://ms-auth:3006";

// Circuit breaker config
const CIRCUIT_TIMEOUT = 20000;
const MAX_FAILURES = 3;

const services = {
  usuarios:       { url: MS_USUARIOS_URL,       prefix: "/api/usuarios",       healthPath: "/health" },
  disponibilidad: { url: MS_DISPONIBILIDAD_URL, prefix: "/api/disponibilidad", healthPath: "/health" },
  citas:          { url: MS_CITAS_URL,          prefix: "/api/citas",          healthPath: "/health" },
  historial:      { url: MS_HISTORIAL_URL,      prefix: "/api/historial",      healthPath: "/health" },
  especialidades: { url: MS_ESPECIALIDADES_URL, prefix: "/api/especialidades", healthPath: "/health" },
  auth:           { url: MS_AUTH_URL,           prefix: "/api/auth",           healthPath: "/health" },
};

// Estado del circuit breaker
const circuitStates = {};
for (const [name] of Object.entries(services)) {
  circuitStates[name] = {
    fallos: 0,
    abierto: false,
    halfOpen: false,
    ultimo_fallo_tiempo: 0,
    latencia: 0,
  };
}

// Log helper
function log(tag, msg) {
  console.log(`[${tag}] ${msg}`);
}

// Revisa si un servicio responde (health check rapido)
function checkHealth(serviceUrl, healthPath, timeout = 1500) {
  return new Promise((resolve) => {
    const url = new URL(healthPath, serviceUrl);
    const req = http.get(url.toString(), { timeout }, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

// Revisa estado del circuit breaker
function getCircuitStatus(name) {
  const state = circuitStates[name];
  const ahora = Date.now();

  if (!state.abierto) return "CLOSED";

  const tiempoTranscurrido = ahora - state.ultimo_fallo_tiempo;

  if (tiempoTranscurrido > CIRCUIT_TIMEOUT) {
    if (!state.halfOpen) {
      state.halfOpen = true;
      log(name.toUpperCase(), "Recuperando servicio (HALF-OPEN)");
    }
    return "HALF-OPEN";
  }

  return "OPEN";
}

// Registra exito - reset completo
function registerSuccess(name) {
  const state = circuitStates[name];
  state.fallos = 0;
  state.abierto = false;
  state.halfOpen = false;
  state.ultimo_fallo_tiempo = 0;
}

// Registra fallo
function registerFailure(name) {
  const state = circuitStates[name];
  const ahora = Date.now();

  state.fallos += 1;
  state.ultimo_fallo_tiempo = ahora;

  if (state.fallos >= MAX_FAILURES) {
    state.abierto = true;
    state.halfOpen = false;
    log("CIRCUIT BREAKER", `Circuito de ${name} ABIERTO`);
  }
}

// Proxy con circuit breaker + health check previo
function buildProxy(name, target, routePrefix) {
  const state = circuitStates[name];

  // Crear el proxy una sola vez
  const proxy = createProxyMiddleware({
    target,
    changeOrigin: true,
    pathRewrite: {
      [`^${routePrefix}`]: "",
    },
    timeout: 2000,
    proxyTimeout: 3000,
    
    onProxyReq: (proxyReq, req, res) => {
      log("GATEWAY", `Llamando servicio ${name}...`);
      req._circuitStart = Date.now();
    },
    
    onProxyRes: (proxyRes, req, res) => {
      const inicio = req._circuitStart || Date.now();
      const fin = Date.now();
      const latencia = fin - inicio;

      state.latencia = latencia;

      if (proxyRes.statusCode >= 200 && proxyRes.statusCode < 300) {
        if (state.abierto || state.halfOpen) {
          log(name.toUpperCase(), "Servicio recuperado, circuito CERRADO");
        }
        registerSuccess(name);
        log("GATEWAY", `Servicio ${name} respondio correctamente`);
      } else {
        log("ERROR", `${name} respondio con status ${proxyRes.statusCode}`);
        if (proxyRes.statusCode >= 500) {
          registerFailure(name);
        }
      }

      log("INFO", `Tiempo de respuesta ${name}: ${latencia} ms`);
    },
    
    onError: (err, req, res) => {
      const inicio = req._circuitStart || Date.now();
      const fin = Date.now();
      const latencia = fin - inicio;

      state.latencia = latencia;

      if (err.code === "ECONNREFUSED") {
        log("ERROR", `No se pudo conectar con ${name}`);
      } else if (err.code === "ETIMEDOUT" || err.code === "ECONNRESET") {
        log("ERROR", `Timeout en servicio ${name}`);
      } else {
        log("ERROR", `Servicio ${name}: ${err.message}`);
      }

      registerFailure(name);

      if (!res.headersSent) {
        res.status(503).json({
          error: `Servicio ${name} no disponible`
        });
      }

      log("INFO", `Tiempo de respuesta ${name}: ${latencia} ms`);
    },
  });

  // Wrapper con health check previo y circuit breaker
  return async (req, res, next) => {
    // 1. Verificar circuit breaker
    const circuitStatus = getCircuitStatus(name);

    if (circuitStatus === "OPEN") {
      log(name.toUpperCase(), "Circuito abierto - bloqueando peticion");
      registerFailure(name);
      return res.status(503).json({
        error: `Circuito abierto: servicio ${name} bloqueado`
      });
    }

    if (circuitStatus === "HALF-OPEN") {
      log(name.toUpperCase(), "Peticion en HALF-OPEN (prueba de recuperacion)");
      
      // En HALF-OPEN: hacer health check primero para saber si esta disponible
      const isHealthy = await checkHealth(target, "/health", 2000);
      
      if (!isHealthy) {
        log("ERROR", `Health check en HALF-OPEN fallo para ${name}`);
        registerFailure(name);
        return res.status(503).json({
          error: `Servicio ${name} no disponible (half-open)`
        });
      }
      
      // Si health check pasa, resetear y dejar pasar
      log(name.toUpperCase(), "Health check en HALF-OPEN exitoso - cerrando circuito");
      registerSuccess(name);
    }

    // 2. Health check rapido antes de reenviar (solo en CLOSED)
    if (circuitStatus === "CLOSED") {
      const isHealthy = await checkHealth(target, "/health", 1500);
      if (!isHealthy) {
        log("ERROR", `Health check previo fallo para ${name}`);
        registerFailure(name);
        return res.status(503).json({
          error: `Servicio ${name} no disponible`
        });
      }
    }

    // 3. Si todo bien, reenviar al proxy
    proxy(req, res, next);
  };
}

// Log de peticiones entrantes
app.use((req, res, next) => {
  log("GATEWAY", `${req.method} ${req.url}`);
  next();
});

// Raiz
app.get("/", (req, res) => {
  res.json({
    servicio: "ms-gateway",
    version: "1.2.0",
    endpoints: [
      "GET  /health",
      "GET  /health/:servicio",
      "GET  /monitoreo",
      "ALL  /api/usuarios/*",
      "ALL  /api/disponibilidad/*",
      "ALL  /api/citas/*",
      "ALL  /api/historial/*",
      "ALL  /api/especialidades/*",
      "ALL  /api/auth/*",
    ],
  });
});

// Health del gateway
app.get("/health", (req, res) => {
  res.json({
    servicio: "ms-gateway",
    estado: "ok",
    timestamp: new Date(),
  });
});

// Health de cada servicio
app.get("/health/:servicio", async (req, res) => {
  const nombre = req.params.servicio;

  if (!services[nombre]) {
    return res.status(404).json({ error: `Servicio ${nombre} no encontrado` });
  }

  const cfg = services[nombre];
  const isHealthy = await checkHealth(cfg.url, cfg.healthPath);

  if (isHealthy) {
    log(`HEALTH_${nombre.toUpperCase()}`, "Respuesta health [OK]");
    res.json({ servicio: nombre, status: "up" });
  } else {
    log(`HEALTH_${nombre.toUpperCase()}`, "Respuesta health [ERROR]");
    res.status(503).json({ servicio: nombre, status: "down" });
  }
});

// Monitoreo
app.get("/monitoreo", async (req, res) => {
  const servicios = [];

  for (const [nombre, cfg] of Object.entries(services)) {
    const inicio = Date.now();

    let disponibilidad;
    try {
      const isHealthy = await checkHealth(cfg.url, cfg.healthPath);
      const fin = Date.now();
      const latencia = fin - inicio;

      circuitStates[nombre].latencia = latencia;
      disponibilidad = isHealthy ? "Disponible" : "No disponible";
    } catch (err) {
      const fin = Date.now();
      const latencia = fin - inicio;
      circuitStates[nombre].latencia = latencia;
      disponibilidad = "No disponible";
    }

    const estadoCircuito = getCircuitStatus(nombre);

    servicios.push({
      servicio: nombre,
      disponibilidad,
      errores: circuitStates[nombre].fallos,
      latencia_ms: circuitStates[nombre].latencia,
      estado_circuito: estadoCircuito,
    });
  }

  res.json({
    gateway: "activo",
    total_servicios: servicios.length,
    servicios,
  });
});

// Proxies
app.use("/api/usuarios",       buildProxy("usuarios",       MS_USUARIOS_URL,       "/api/usuarios"));
app.use("/api/disponibilidad", buildProxy("disponibilidad", MS_DISPONIBILIDAD_URL, "/api/disponibilidad"));
app.use("/api/citas",          buildProxy("citas",          MS_CITAS_URL,          "/api/citas"));
app.use("/api/historial",      buildProxy("historial",      MS_HISTORIAL_URL,      "/api/historial"));
app.use("/api/especialidades", buildProxy("especialidades", MS_ESPECIALIDADES_URL, "/api/especialidades"));
app.use("/api/auth",           buildProxy("auth",           MS_AUTH_URL,           "/api/auth"));

// Ruta no encontrada
app.use((req, res) => {
  res.status(404).json({ error: "Ruta no encontrada en API Gateway" });
});

// Inicio
app.listen(PORT, () => {
  log("ms-gateway", `Corriendo en puerto ${PORT}`);
  for (const [name, cfg] of Object.entries(services)) {
    log("ms-gateway", `${name} -> ${cfg.url}`);
  }
});