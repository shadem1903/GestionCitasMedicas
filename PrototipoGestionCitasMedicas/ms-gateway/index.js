const express = require("express");
const cors = require("cors");
const { createProxyMiddleware } = require("http-proxy-middleware");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8080;
const MS_USUARIOS_URL = process.env.MS_USUARIOS_URL || "http://ms-usuarios:3001";
const MS_DISPONIBILIDAD_URL =
  process.env.MS_DISPONIBILIDAD_URL || "http://ms-disponibilidad:3003";
const MS_CITAS_URL = process.env.MS_CITAS_URL || "http://ms-citas:3004";
const MS_ESPECIALIDADES_URL =
  process.env.MS_ESPECIALIDADES_URL || "http://ms-especialidades:3007";

function buildProxy(target, routePrefix) {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    pathRewrite: {
      [`^${routePrefix}`]: "",
    },
  });
}

app.get("/", (req, res) => {
  res.json({
    servicio: "ms-gateway",
    version: "1.0.0",
    endpoints: [
      "GET  /health",
      "ALL  /api/usuarios/*",
      "ALL  /api/disponibilidad/*",
      "ALL  /api/citas/*",
      "ALL  /api/especialidades/*",
    ],
  });
});

app.get("/health", (req, res) => {
  res.json({ servicio: "ms-gateway", estado: "ok", timestamp: new Date() });
});

app.use("/api/usuarios", buildProxy(MS_USUARIOS_URL, "/api/usuarios"));
app.use(
  "/api/disponibilidad",
  buildProxy(MS_DISPONIBILIDAD_URL, "/api/disponibilidad")
);
app.use("/api/citas", buildProxy(MS_CITAS_URL, "/api/citas"));
app.use(
  "/api/especialidades",
  buildProxy(MS_ESPECIALIDADES_URL, "/api/especialidades")
);

app.use((req, res) => {
  res.status(404).json({ error: "Ruta no encontrada en API Gateway" });
});

app.listen(PORT, () => {
  console.log(`[ms-gateway] Corriendo en puerto ${PORT}`);
  console.log(`[ms-gateway] usuarios -> ${MS_USUARIOS_URL}`);
  console.log(`[ms-gateway] disponibilidad -> ${MS_DISPONIBILIDAD_URL}`);
  console.log(`[ms-gateway] citas -> ${MS_CITAS_URL}`);
  console.log(`[ms-gateway] especialidades -> ${MS_ESPECIALIDADES_URL}`);
});
