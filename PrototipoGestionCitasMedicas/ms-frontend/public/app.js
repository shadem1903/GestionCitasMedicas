/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   GestiÃ³n de Citas MÃ©dicas â€” Frontend SPA
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

const API = {
  usuarios: "http://localhost:8080/api/usuarios",
  disponibilidad: "http://localhost:8080/api/disponibilidad",
  citas: "http://localhost:8080/api/citas",
  especialidades: "http://localhost:8080/api/especialidades",
  historial: "http://localhost:8080/api/historial",
  auth: "http://localhost:8080/api/auth",
};

const AUTH_USER_KEY = "gcitas_current_user";
const AUTH_TOKEN_KEY = "gcitas_auth_token";
const ROLE_SECTIONS = {
  admin: ["dashboard", "usuarios", "especialidades", "disponibilidad", "citas", "historial"],
  medico: ["dashboard", "disponibilidad", "citas", "historial"],
  paciente: ["dashboard", "citas", "historial"],
};
const CREATE_SECTIONS_BY_ROLE = {
  admin: ["usuarios", "especialidades", "disponibilidad", "citas"],
  medico: ["disponibilidad"],
  paciente: ["citas"],
};
let currentUser = null;

/* â”€â”€ Utilidades â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

function toast(msg, type = "info") {
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  document.getElementById("toast-container").appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

async function apiFetch(url, opts = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function badge(text, cls) {
  return `<span class="badge badge-${cls}">${text}</span>`;
}
function cleanNota(text) {
  if (!text) return "-";
  const t = String(text).trim();
  if (!t) return "-";
  if (t.includes("ðŸ") || t.includes("�")) return "-";
  return t;
}

function fmtFecha(str) {
  if (!str) return "-";
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("es-CO", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtDate(str) {
  if (!str) return "-";
  const raw = String(str);
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return "-";
}

function openModal(title, bodyHTML) {
  document.getElementById("modal-title").textContent = title;
  document.getElementById("modal-body").innerHTML = bodyHTML;
  document.getElementById("modal-overlay").classList.remove("hidden");
}

function closeModal() {
  document.getElementById("modal-overlay").classList.add("hidden");
}

function tableLoading(cols) {
  return `<tr class="loading-row"><td colspan="${cols}">
    <span class="spinner"></span> Cargandoâ€¦
  </td></tr>`;
}

function tableEmpty(cols, msg = "Sin registros") {
  return `<tr><td colspan="${cols}" style="padding:40px;text-align:center;color:var(--text-muted)">${msg}</td></tr>`;
}

/* â”€â”€ NavegaciÃ³n â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

const sections = {
  dashboard:      renderDashboard,
  usuarios:       renderUsuarios,
  especialidades: renderEspecialidades,
  disponibilidad: renderDisponibilidad,
  citas:          renderCitas,
  historial:      renderHistorial,
};

const sectionTitles = {
  dashboard:      "Dashboard",
  usuarios:       "Usuarios",
  especialidades: "Especialidades",
  disponibilidad: "Disponibilidad MÃ©dica",
  citas:          "GestiÃ³n de Citas",
  historial:      "Historial",
};

let currentSection = "dashboard";

function navigate(section) {
  if (!canAccessSection(section)) {
    toast("No tienes permisos para esta seccion", "error");
    return;
  }
  currentSection = section;
  document.querySelectorAll(".nav-item").forEach(el => {
    el.classList.toggle("active", el.dataset.section === section);
  });
  document.getElementById("page-title").textContent = sectionTitles[section];
  const btnNuevo = document.getElementById("btn-nuevo");
  btnNuevo.classList.toggle("hidden", section === "dashboard" || !canCreateInSection(section));
  sections[section]();
}

function canAccessSection(section) {
  return (ROLE_SECTIONS[currentUser?.rol] || []).includes(section);
}
function canCreateInSection(section) {
  return (CREATE_SECTIONS_BY_ROLE[currentUser?.rol] || []).includes(section);
}
function applyRoleUI() {
  const allowed = ROLE_SECTIONS[currentUser?.rol] || [];
  document.querySelectorAll(".nav-item").forEach(el => {
    el.classList.toggle("hidden", !allowed.includes(el.dataset.section));
  });

  const label = document.getElementById("current-user-label");
  const btnLogout = document.getElementById("btn-logout");
  const banner = document.getElementById("disabled-banner");
  const btnNotif = document.getElementById("notif-wrapper");

  if (currentUser) {
    label.textContent = `${currentUser.nombre} (${currentUser.rol})`;
    label.classList.remove("hidden");
    btnLogout.classList.remove("hidden");
    btnNotif.classList.remove("hidden");
    if (!currentUser.activo) {
      banner.classList.remove("hidden");
    } else {
      banner.classList.add("hidden");
    }
    startNotifPolling();
  } else {
    label.classList.add("hidden");
    btnLogout.classList.add("hidden");
    btnNotif.classList.add("hidden");
    banner.classList.add("hidden");
    stopNotifPolling();
  }
}

function logout() {
  currentUser = null;
  localStorage.removeItem(AUTH_USER_KEY);
  localStorage.removeItem(AUTH_TOKEN_KEY);
  window.location.href = "/login.html";
}
function initAuth() {
  try { currentUser = JSON.parse(localStorage.getItem(AUTH_USER_KEY) || "null"); }
  catch { currentUser = null; }

  if (!currentUser || !ROLE_SECTIONS[currentUser.rol]) {
    window.location.href = "/login.html";
    return;
  }
  applyRoleUI();
  navigate((ROLE_SECTIONS[currentUser.rol] || ["dashboard"])[0]);
}

document.querySelectorAll(".nav-item").forEach(el => {
  el.addEventListener("click", () => navigate(el.dataset.section));
});

document.getElementById("modal-close").addEventListener("click", closeModal);
document.getElementById("modal-overlay").addEventListener("click", e => {
  if (e.target === document.getElementById("modal-overlay")) closeModal();
});

document.getElementById("btn-nuevo").addEventListener("click", () => {
  if (currentUser && !currentUser.activo && currentUser.rol !== "admin") {
    toast("Tu cuenta está deshabilitada", "error");
    return;
  }
  const actions = {
    usuarios:       openFormUsuario,
    especialidades: openFormEspecialidad,
    disponibilidad: openFormDisponibilidad,
    citas:          openFormCita,
  };
  actions[currentSection]?.();
});
document.getElementById("btn-logout").addEventListener("click", logout);

/* ── Notificaciones ───────────────────────────────────────── */
let notifTimer = null;
function startNotifPolling() {
  cargarNotificaciones();
  if (!notifTimer) notifTimer = setInterval(cargarNotificaciones, 10000);
}
function stopNotifPolling() {
  if (notifTimer) clearInterval(notifTimer);
  notifTimer = null;
}

async function cargarNotificaciones() {
  if (!currentUser) return;
  try {
    const data = await apiFetch(`${API.usuarios}/usuarios/${currentUser.id}/notificaciones`);
    const list = document.getElementById("notif-list");
    const badge = document.getElementById("notif-badge");
    if (!data.length) {
      list.innerHTML = "<div class='empty'>No tienes notificaciones</div>";
      badge.classList.add("hidden");
      return;
    }
    const unread = data.filter(n => !n.leida).length;
    if (unread > 0) {
      badge.textContent = unread > 9 ? "+9" : unread;
      badge.classList.remove("hidden");
    } else {
      badge.classList.add("hidden");
    }
    list.innerHTML = data.map(n => `
      <div class="notif-item ${n.leida ? '' : 'unread'}" onclick="marcarNotifLeida(${n.id})">
        ${n.mensaje}
        <span class="date">${fmtFecha(n.creado_en)}</span>
      </div>
    `).join("");
  } catch (err) {
    console.error("Error loading notifications:", err);
  }
}

async function marcarNotifLeida(notif_id) {
  try {
    await apiFetch(`${API.usuarios}/usuarios/${currentUser.id}/notificaciones/${notif_id}/read`, { method: "PUT" });
    cargarNotificaciones();
  } catch (err) {
    toast(err.message, "error");
  }
}

document.getElementById("btn-notif").addEventListener("click", () => {
  document.getElementById("notif-dropdown").classList.toggle("hidden");
});
document.addEventListener("click", (e) => {
  const wrp = document.getElementById("notif-wrapper");
  if (wrp && !wrp.contains(e.target)) {
    document.getElementById("notif-dropdown")?.classList.add("hidden");
  }
});

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   DASHBOARD
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

async function renderDashboard() {
  const main = document.getElementById("main-content");
  main.innerHTML = `
    <p class="section-title">Resumen del sistema</p>
    <div class="dashboard-grid" id="stats-grid">
      ${["Usuarios","Especialidades","Disponibilidades","Citas"].map(l =>
        `<div class="stat-card">
          <div class="label">${l}</div>
          <div class="value"><span class="spinner"></span></div>
        </div>`).join("")}
    </div>
    <p class="section-title" style="margin-top:8px">Estado de microservicios</p>
    <div class="services-grid" id="services-grid">
      ${Object.entries({ "MS-Gateway":"8080", "MS-1 Usuarios":"3001","MS-3 Disponibilidad":"3003","MS-4 Citas":"3004","MS-5 Historial":"3005","MS-7 Especialidades":"3007" })
        .map(([name,port]) => `
          <div class="service-card">
            <div class="service-indicator loading" id="ind-${port}"></div>
            <div class="service-info">
              <div class="name">${name}</div>
              <div class="port" id="rt-${port}">:${port}</div>
            </div>
          </div>`).join("")}
    </div>
    
    <div id="admin-metrics-wrapper" class="hidden" style="margin-top:20px;">
      <p class="section-title">Monitor de Rendimiento y Salud (Métricas)</p>
      <table>
        <thead>
          <tr>
            <th>Servicio</th>
            <th>Estado</th>
            <th>Uptime (s)</th>
            <th>Uso de Memoria</th>
            <th>Peticiones Totales</th>
            <th>Errores HTTP (4xx/5xx)</th>
            <th>Tiempo Promedio (ms)</th>
          </tr>
        </thead>
        <tbody id="metrics-tbody">
          <tr><td colspan="7" style="text-align:center">Cargando métricas...</td></tr>
        </tbody>
      </table>
      <div style="margin-top:10px;text-align:right">
        <button class="btn btn-sm btn-ghost" onclick="fetchMetrics()">Actualizar Métricas</button>
      </div>
    </div>

    <div id="admin-logs-wrapper" class="hidden">
      <p class="section-title" style="margin-top:20px">Logs en tiempo real (Últimos 100 por servicio)</p>
      <div style="display:flex;gap:10px;margin-bottom:10px;">
        <select id="log-service-selector" style="padding:6px 10px;border-radius:6px;border:1px solid var(--border)">
          <option value="/logs">MS-Gateway</option>
          <option value="/api/usuarios/logs">MS-1 Usuarios</option>
          <option value="/api/disponibilidad/logs">MS-3 Disponibilidad</option>
          <option value="/api/citas/logs">MS-4 Citas</option>
          <option value="/api/historial/logs">MS-5 Historial</option>
          <option value="/api/especialidades/logs">MS-7 Especialidades</option>
        </select>
        <button class="btn btn-sm btn-ghost" onclick="fetchServiceLogs()">Actualizar Logs</button>
      </div>
      <div id="service-logs" class="logs-container">Cargando logs...</div>
    </div>`;

  // Health checks en paralelo
  const healthChecks = [
    { name: "MS-Gateway",           port: "8080", url: `http://localhost:8080/health` },
    { name: "MS-1 Usuarios",        port: "3001", url: `${API.usuarios.replace('/api/usuarios','')}/health` },
    { name: "MS-3 Disponibilidad",  port: "3003", url: `${API.disponibilidad.replace('/api/disponibilidad','')}/health` },
    { name: "MS-4 Citas",           port: "3004", url: `${API.citas.replace('/api/citas','')}/health` },
    { name: "MS-5 Historial",       port: "3005", url: `${API.historial.replace('/api/historial','')}/health` },
    { name: "MS-7 Especialidades",  port: "3007", url: `${API.especialidades.replace('/api/especialidades','')}/health` },
  ];

  healthChecks.forEach(async ({ port, url }) => {
    const ind = document.getElementById(`ind-${port}`);
    const rt  = document.getElementById(`rt-${port}`);
    if (!ind) return;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
      const data = await res.json();
      ind.className = `service-indicator ${res.ok ? "ok" : "error"}`;
      if (res.ok && data.response_time_ms !== undefined) {
        rt.textContent = `:${port} — ${data.response_time_ms}ms`;
      }
    } catch {
      ind.className = "service-indicator error";
    }
  });

  if (currentUser?.rol === "admin") {
    document.getElementById("admin-logs-wrapper").classList.remove("hidden");
    document.getElementById("admin-metrics-wrapper").classList.remove("hidden");
    document.getElementById("log-service-selector").addEventListener("change", fetchServiceLogs);
    fetchServiceLogs();
    fetchMetrics();
  }

  // Conteos en paralelo
  const counts = await Promise.allSettled([
    apiFetch(`${API.usuarios}/usuarios`),
    apiFetch(`${API.especialidades}/especialidades`),
    apiFetch(`${API.disponibilidad}/disponibilidad`),
    apiFetch(`${API.citas}/citas`),
  ]);

  const grid = document.getElementById("stats-grid");
  const labels = ["Usuarios","Especialidades","Disponibilidades","Citas"];
  const subs   = ["pacientes y médicos","registradas","bloques activos","total registradas"];
  grid.innerHTML = counts.map((r, i) => {
    const val = r.status === "fulfilled" ? r.value.total : "—";
    return `<div class="stat-card">
      <div class="label">${labels[i]}</div>
      <div class="value">${val}</div>
      <div class="sub">${subs[i]}</div>
    </div>`;
  }).join("");
}

window.fetchServiceLogs = async function() {
  const path = document.getElementById("log-service-selector").value;
  const container = document.getElementById("service-logs");
  container.innerHTML = "Cargando logs...";
  try {
    const res = await fetch(`http://localhost:8080${path}`);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const logs = await res.json();
    if (!logs.length) {
      container.innerHTML = "No hay logs recientes.";
      return;
    }
    container.innerHTML = logs.map(line => {
      let cls = "log-line";
      if (line.includes("[ERROR]")) cls += " error";
      if (line.includes("[WARN]")) cls += " warn";
      return `<div class="${cls}">${line.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>`;
    }).join("");
    container.scrollTop = container.scrollHeight;
  } catch (err) {
    container.innerHTML = `<div class="log-line error">Error al obtener logs: ${err.message}</div>`;
  }
};

window.fetchMetrics = async function() {
  const metricsEndpoints = [
    { name: "MS-Gateway", url: "http://localhost:8080/metrics" },
    { name: "MS-1 Usuarios", url: "http://localhost:8080/api/usuarios/metrics" },
    { name: "MS-3 Disponibilidad", url: "http://localhost:8080/api/disponibilidad/metrics" },
    { name: "MS-4 Citas", url: "http://localhost:8080/api/citas/metrics" },
    { name: "MS-5 Historial", url: "http://localhost:8080/api/historial/metrics" },
    { name: "MS-7 Especialidades", url: "http://localhost:8080/api/especialidades/metrics" }
  ];

  const tbody = document.getElementById("metrics-tbody");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="7" style="text-align:center">Actualizando...</td></tr>`;

  try {
    const results = await Promise.allSettled(metricsEndpoints.map(e => fetch(e.url).then(r => r.json())));
    tbody.innerHTML = results.map((r, i) => {
      const name = metricsEndpoints[i].name;
      if (r.status === "fulfilled" && r.value) {
        const m = r.value;
        return `<tr>
          <td style="font-weight:bold">${name}</td>
          <td><span style="background-color:var(--success);color:white;padding:2px 6px;border-radius:4px;font-size:12px;font-weight:bold;">Activo</span></td>
          <td>${m.uptime_seconds || 0}s</td>
          <td>${m.memory_mb || 0} MB</td>
          <td>${m.total_requests || 0}</td>
          <td>${m.error_count > 0 ? "<span style='color:var(--danger)'>" + m.error_count + "</span>" : "0"}</td>
          <td>${m.avg_response_time_ms || 0} ms</td>
        </tr>`;
      } else {
        return `<tr>
          <td style="font-weight:bold">${name}</td>
          <td><span style="background-color:var(--danger);color:white;padding:2px 6px;border-radius:4px;font-size:12px;font-weight:bold;">Apagado</span></td>
          <td colspan="5" style="color:var(--danger)">El servicio no responde</td>
        </tr>`;
      }
    }).join("");
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="7" style="color:var(--danger)">Error cargando métricas</td></tr>`;
  }
};

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   USUARIOS
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

async function renderUsuarios(filtroRol = "") {
  const main = document.getElementById("main-content");
  main.innerHTML = `
    <div class="card">
      <div class="card-toolbar">
        <label style="font-size:12px;font-weight:600;color:var(--text-muted)">Filtrar por rol:</label>
        <select id="filtro-rol">
          <option value="">Todos</option>
          <option value="paciente" ${filtroRol==="paciente"?"selected":""}>Paciente</option>
          <option value="medico"   ${filtroRol==="medico"  ?"selected":""}>MÃ©dico</option>
          <option value="admin"    ${filtroRol==="admin"   ?"selected":""}>Admin</option>
        </select>
        <div class="spacer"></div>
      </div>
      <table>
        <thead><tr>
          <th>ID</th><th>Nombre</th><th>Email</th><th>Rol</th><th>Estado</th><th>Acciones</th>
        </tr></thead>
        <tbody id="tbody-usuarios">${tableLoading(6)}</tbody>
      </table>
    </div>`;

  document.getElementById("filtro-rol").addEventListener("change", e => {
    renderUsuarios(e.target.value);
  });

  try {
    const { datos } = await apiFetch(`${API.usuarios}/usuarios`);
    const filtrados = filtroRol ? datos.filter(u => u.rol === filtroRol) : datos;
    const tbody = document.getElementById("tbody-usuarios");
    if (!filtrados.length) { tbody.innerHTML = tableEmpty(6); return; }
    tbody.innerHTML = filtrados.map(u => `
      <tr>
        <td>${u.id}</td>
        <td><strong>${u.nombre}</strong></td>
        <td>${u.email}</td>
        <td>${badge(u.rol, u.rol)}</td>
        <td>${badge(u.activo ? "Activo" : "Inactivo", u.activo ? "activo" : "inactivo")}</td>
        <td class="td-actions">
          ${u.activo
            ? `<button class="btn btn-danger btn-sm" onclick="desactivarUsuario(${u.id})">Desactivar</button>`
            : `<button class="btn btn-success btn-sm" onclick="activarUsuario(${u.id})">Activar</button>`}
        </td>
      </tr>`).join("");
  } catch (err) {
    document.getElementById("tbody-usuarios").innerHTML =
      tableEmpty(6, `Error al cargar usuarios: ${err.message}`);
  }
}

function openFormUsuario() {
  openModal("Nuevo Usuario", `
    <div class="form-group">
      <label>Nombre completo</label>
      <input id="f-nombre" type="text" placeholder="Ej: MarÃ­a GarcÃ­a" />
    </div>
    <div class="form-group">
      <label>Correo electrÃ³nico</label>
      <input id="f-email" type="email" placeholder="correo@ejemplo.com" />
    </div>
    <div class="form-group">
      <label>Rol</label>
      <select id="f-rol">
        <option value="">Seleccionar rolâ€¦</option>
        <option value="paciente">Paciente</option>
        <option value="medico">MÃ©dico</option>
        <option value="admin">Administrador</option>
      </select>
    </div>
    <div class="form-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="guardarUsuario()">Crear Usuario</button>
    </div>`);
}

async function guardarUsuario() {
  const nombre = document.getElementById("f-nombre").value.trim();
  const email  = document.getElementById("f-email").value.trim();
  const rol    = document.getElementById("f-rol").value;
  if (!nombre || !email || !rol) { toast("Completa todos los campos", "error"); return; }
  try {
    await apiFetch(`${API.usuarios}/usuarios`, {
      method: "POST",
      body: JSON.stringify({ nombre, email, rol }),
    });
    toast("Usuario creado correctamente", "success");
    closeModal();
    renderUsuarios();
  } catch (err) {
    toast(err.message, "error");
  }
}

async function desactivarUsuario(id) {
  if (!confirm("¿Desactivar este usuario?")) return;
  try {
    await apiFetch(`${API.usuarios}/usuarios/${id}`, { method: "DELETE" });
    toast("Usuario desactivado", "success");
    renderUsuarios();
  } catch (err) {
    toast(err.message, "error");
  }
}

async function activarUsuario(id) {
  if (!confirm("¿Activar este usuario?")) return;
  try {
    await apiFetch(`${API.usuarios}/usuarios/${id}/activar`, { method: "PATCH" });
    toast("Usuario activado", "success");
    renderUsuarios();
  } catch (err) {
    toast(err.message, "error");
  }
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   ESPECIALIDADES
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

async function renderEspecialidades() {
  const main = document.getElementById("main-content");
  main.innerHTML = `
    <div class="card">
      <table>
        <thead><tr>
          <th>ID</th><th>Nombre</th><th>DescripciÃ³n</th><th>Estado</th><th>Acciones</th>
        </tr></thead>
        <tbody id="tbody-esp">${tableLoading(5)}</tbody>
      </table>
    </div>`;

  try {
    const { datos } = await apiFetch(`${API.especialidades}/especialidades`);
    const tbody = document.getElementById("tbody-esp");
    if (!datos.length) { tbody.innerHTML = tableEmpty(5); return; }
    tbody.innerHTML = datos.map(e => `
      <tr>
        <td>${e.id}</td>
        <td><strong>${e.nombre}</strong></td>
        <td>${e.descripcion || "<span style='color:var(--text-muted)'>â€”</span>"}</td>
        <td>${badge(e.activo ? "Activa" : "Inactiva", e.activo ? "activo" : "inactivo")}</td>
        <td class="td-actions">
          ${e.activo
            ? `<button class="btn btn-danger btn-sm" onclick="desactivarEspecialidad(${e.id})">Desactivar</button>`
            : `<span style="color:var(--text-muted);font-size:12px">Inactiva</span>`}
        </td>
      </tr>`).join("");
  } catch (err) {
    document.getElementById("tbody-esp").innerHTML =
      tableEmpty(5, `Error: ${err.message}`);
  }
}

function openFormEspecialidad() {
  openModal("Nueva Especialidad", `
    <div class="form-group">
      <label>Nombre</label>
      <input id="f-esp-nombre" type="text" placeholder="Ej: NeurologÃ­a" />
    </div>
    <div class="form-group">
      <label>DescripciÃ³n (opcional)</label>
      <textarea id="f-esp-desc" placeholder="Breve descripciÃ³nâ€¦"></textarea>
    </div>
    <div class="form-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="guardarEspecialidad()">Crear</button>
    </div>`);
}

async function guardarEspecialidad() {
  const nombre      = document.getElementById("f-esp-nombre").value.trim();
  const descripcion = document.getElementById("f-esp-desc").value.trim();
  if (!nombre) { toast("El nombre es requerido", "error"); return; }
  try {
    await apiFetch(`${API.especialidades}/especialidades`, {
      method: "POST",
      body: JSON.stringify({ nombre, descripcion }),
    });
    toast("Especialidad creada", "success");
    closeModal();
    renderEspecialidades();
  } catch (err) {
    toast(err.message, "error");
  }
}

async function desactivarEspecialidad(id) {
  if (!confirm("Â¿Desactivar esta especialidad?")) return;
  try {
    await apiFetch(`${API.especialidades}/especialidades/${id}`, { method: "DELETE" });
    toast("Especialidad desactivada", "success");
    renderEspecialidades();
  } catch (err) {
    toast(err.message, "error");
  }
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   DISPONIBILIDAD
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

async function renderDisponibilidad() {
  const main = document.getElementById("main-content");
  main.innerHTML = `
    <div style="display:flex;gap:6px;margin-bottom:14px">
      <button class="btn btn-sm" data-dtab="bloques"   onclick="switchDispTab('bloques')">Bloques manuales</button>
      <button class="btn btn-sm" data-dtab="schedules" onclick="switchDispTab('schedules')">Horarios semanales</button>
      <button class="btn btn-sm" data-dtab="blocks"    onclick="switchDispTab('blocks')">Bloqueos</button>
    </div>
    <div id="disp-content"></div>`;
  switchDispTab(currentDispTab);
}

const DIAS = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
let currentDispTab = "bloques";

function switchDispTab(tab) {
  currentDispTab = tab;
  document.querySelectorAll("[data-dtab]").forEach(b => {
    b.className = `btn btn-sm ${b.dataset.dtab === tab ? "btn-primary" : "btn-ghost"}`;
  });
  if (tab === "schedules") renderDispSchedules();
  else if (tab === "blocks") renderDispBlocks();
  else renderDispBloques();
}

/* - Bloques manuales - */
function renderDispBloques() {
  const content = document.getElementById("disp-content");
  content.innerHTML = `
    <div class="card">
      <div class="card-toolbar">
        <label style="font-size:12px;font-weight:600;color:var(--text-muted)">Médico ID:</label>
        <input id="filtro-medico" type="number" placeholder="Todos" style="width:90px" />
        <label style="font-size:12px;font-weight:600;color:var(--text-muted)">Fecha:</label>
        <input id="filtro-fecha" type="date" />
        <button class="btn btn-ghost btn-sm" onclick="cargarDispBloques()">Filtrar</button>
        <div class="spacer"></div>
      </div>
      <table>
        <thead><tr>
          <th>ID</th><th>Médico ID</th><th>Fecha</th>
          <th>Hora inicio</th><th>Hora fin</th><th>Especialidad ID</th><th>Acciones</th>
        </tr></thead>
        <tbody id="tbody-disp">${tableLoading(7)}</tbody>
      </table>
    </div>`;
  cargarDispBloques();
}

async function cargarDispBloques() {
  const medicoId = document.getElementById("filtro-medico")?.value.trim();
  const fecha    = document.getElementById("filtro-fecha")?.value;
  const params = new URLSearchParams();
  if (medicoId) params.set("medico_id", medicoId);
  if (fecha)    params.set("fecha", fecha);
  const tbody = document.getElementById("tbody-disp");
  tbody.innerHTML = tableLoading(7);
  try {
    const qs = params.toString();
    const { datos } = await apiFetch(`${API.disponibilidad}/disponibilidad${qs ? "?" + qs : ""}`);
    if (!datos.length) { tbody.innerHTML = tableEmpty(7); return; }
    tbody.innerHTML = datos.map(d => `
      <tr>
        <td>${d.id}</td>
        <td>${d.medico_id}</td>
        <td>${fmtDate(d.fecha)}</td>
        <td>${d.hora_inicio?.substring(0,5) || "—"}</td>
        <td>${d.hora_fin?.substring(0,5) || "—"}</td>
        <td>${d.especialidad_id ?? "<span style='color:var(--text-muted)'>—</span>"}</td>
        <td class="td-actions">
          <button class="btn btn-danger btn-sm" onclick="eliminarDisponibilidad(${d.id})">Eliminar</button>
        </td>
      </tr>`).join("");
  } catch (err) {
    tbody.innerHTML = tableEmpty(7, `Error: ${err.message}`);
  }
}

async function openFormDisponibilidad() {
  if (currentDispTab === "schedules") return openFormSchedule();
  if (currentDispTab === "blocks")    return openFormBlock();

  let medicos = [], especialidades = [];
  try {
    const r = await apiFetch(`${API.usuarios}/usuarios`);
    medicos = r.datos.filter(u => u.rol === "medico" && u.activo);
  } catch { }
  try {
    const r = await apiFetch(`${API.especialidades}/especialidades`);
    especialidades = r.datos.filter(e => e.activo);
  } catch { }

  const optMedicos = medicos.length
    ? medicos.map(m => `<option value="${m.id}">${m.nombre} (ID ${m.id})</option>`).join("")
    : `<option value="">No hay médicos registrados</option>`;
  const optEsp = especialidades.length
    ? `<option value="">Sin especialidad</option>` +
      especialidades.map(e => `<option value="${e.id}">${e.nombre}</option>`).join("")
    : `<option value="">No hay especialidades</option>`;

  openModal("Registrar Disponibilidad", `
    <div class="form-group">
      <label>Médico</label>
      <select id="f-disp-medico">${optMedicos}</select>
    </div>
    <div class="form-group">
      <label>Especialidad (opcional)</label>
      <select id="f-disp-esp">${optEsp}</select>
    </div>
    <div class="form-group">
      <label>Fecha</label>
      <input id="f-disp-fecha" type="date" />
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Hora inicio</label>
        <input id="f-disp-inicio" type="time" />
      </div>
      <div class="form-group">
        <label>Hora fin</label>
        <input id="f-disp-fin" type="time" />
      </div>
    </div>
    <div class="form-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="guardarDisponibilidad()">Registrar</button>
    </div>`);
}

async function guardarDisponibilidad() {
  const medico_id       = document.getElementById("f-disp-medico").value;
  const especialidad_id = document.getElementById("f-disp-esp").value || null;
  const fecha           = document.getElementById("f-disp-fecha").value;
  const hora_inicio     = document.getElementById("f-disp-inicio").value;
  const hora_fin        = document.getElementById("f-disp-fin").value;
  if (!medico_id || !fecha || !hora_inicio || !hora_fin) {
    toast("Completa todos los campos requeridos", "error"); return;
  }
  if (hora_inicio >= hora_fin) {
    toast("La hora de inicio debe ser anterior a la hora fin", "error"); return;
  }
  try {
    await apiFetch(`${API.disponibilidad}/disponibilidad`, {
      method: "POST",
      body: JSON.stringify({
        medico_id: parseInt(medico_id),
        especialidad_id: especialidad_id ? parseInt(especialidad_id) : null,
        fecha, hora_inicio, hora_fin,
      }),
    });
    toast("Disponibilidad registrada correctamente", "success");
    closeModal();
    renderDispBloques();
  } catch (err) {
    toast(err.message, "error");
  }
}

async function eliminarDisponibilidad(id) {
  if (!confirm("¿Eliminar este bloque de disponibilidad?")) return;
  try {
    await apiFetch(`${API.disponibilidad}/disponibilidad/${id}`, { method: "DELETE" });
    toast("Bloque eliminado", "success");
    cargarDispBloques();
  } catch (err) {
    toast(err.message, "error");
  }
}

/* - Horarios semanales - */
function renderDispSchedules() {
  const content = document.getElementById("disp-content");
  content.innerHTML = `
    <div class="card">
      <div class="card-toolbar">
        <label style="font-size:12px;font-weight:600;color:var(--text-muted)">Médico ID:</label>
        <input id="filtro-sched-medico" type="number" placeholder="Todos" style="width:90px" />
        <button class="btn btn-ghost btn-sm" onclick="cargarSchedules()">Filtrar</button>
        <div class="spacer"></div>
      </div>
      <table>
        <thead><tr>
          <th>ID</th><th>Médico</th><th>Día</th><th>Hora inicio</th><th>Hora fin</th><th>Acciones</th>
        </tr></thead>
        <tbody id="tbody-sched">${tableLoading(6)}</tbody>
      </table>
    </div>`;
  cargarSchedules();
}

async function cargarSchedules() {
  const medicoId = document.getElementById("filtro-sched-medico")?.value.trim();
  const params = new URLSearchParams();
  if (medicoId) params.set("medico_id", medicoId);
  const tbody = document.getElementById("tbody-sched");
  tbody.innerHTML = tableLoading(6);
  try {
    const qs = params.toString();
    const { datos } = await apiFetch(`${API.disponibilidad}/doctor-schedules${qs ? "?" + qs : ""}`);
    if (!datos.length) { tbody.innerHTML = tableEmpty(6); return; }
    tbody.innerHTML = datos.map(s => `
      <tr>
        <td>${s.id}</td>
        <td>${s.medico || s.medico_id}</td>
        <td>${DIAS[s.dia_semana] ?? s.dia_semana}</td>
        <td>${String(s.hora_inicio || "").substring(0,5)}</td>
        <td>${String(s.hora_fin || "").substring(0,5)}</td>
        <td class="td-actions">
          <button class="btn btn-danger btn-sm" onclick="eliminarSchedule(${s.id})">Eliminar</button>
        </td>
      </tr>`).join("");
  } catch (err) {
    tbody.innerHTML = tableEmpty(6, `Error: ${err.message}`);
  }
}

async function openFormSchedule() {
  let medicos = [];
  try {
    const r = await apiFetch(`${API.usuarios}/usuarios`);
    medicos = r.datos.filter(u => u.rol === "medico" && u.activo);
  } catch { }
  const optMedicos = medicos.length
    ? medicos.map(m => `<option value="${m.id}">${m.nombre} (ID ${m.id})</option>`).join("")
    : `<option value="">No hay médicos registrados</option>`;
  const optDias = DIAS.map((d, i) => `<option value="${i}">${d}</option>`).join("");

  openModal("Nuevo Horario Semanal", `
    <div class="form-group">
      <label>Médico</label>
      <select id="f-sched-medico">${optMedicos}</select>
    </div>
    <div class="form-group">
      <label>Día de la semana</label>
      <select id="f-sched-dia">${optDias}</select>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Hora inicio</label>
        <input id="f-sched-inicio" type="time" />
      </div>
      <div class="form-group">
        <label>Hora fin</label>
        <input id="f-sched-fin" type="time" />
      </div>
    </div>
    <div class="form-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="guardarSchedule()">Crear</button>
    </div>`);
}

async function guardarSchedule() {
  const medico_id   = document.getElementById("f-sched-medico").value;
  const dia_semana  = document.getElementById("f-sched-dia").value;
  const hora_inicio = document.getElementById("f-sched-inicio").value;
  const hora_fin    = document.getElementById("f-sched-fin").value;
  if (!medico_id || dia_semana === "" || !hora_inicio || !hora_fin) {
    toast("Completa todos los campos", "error"); return;
  }
  if (hora_inicio >= hora_fin) {
    toast("La hora de inicio debe ser anterior a la hora fin", "error"); return;
  }
  try {
    await apiFetch(`${API.disponibilidad}/doctor-schedules`, {
      method: "POST",
      body: JSON.stringify({
        medico_id: parseInt(medico_id),
        dia_semana: parseInt(dia_semana),
        hora_inicio, hora_fin,
      }),
    });
    toast("Horario semanal creado", "success");
    closeModal();
    cargarSchedules();
  } catch (err) {
    toast(err.message, "error");
  }
}

async function eliminarSchedule(id) {
  if (!confirm("¿Eliminar este horario semanal?")) return;
  try {
    await apiFetch(`${API.disponibilidad}/doctor-schedules/${id}`, { method: "DELETE" });
    toast("Horario eliminado", "success");
    cargarSchedules();
  } catch (err) {
    toast(err.message, "error");
  }
}

/* - Bloqueos - */
function renderDispBlocks() {
  const content = document.getElementById("disp-content");
  content.innerHTML = `
    <div class="card">
      <div class="card-toolbar">
        <label style="font-size:12px;font-weight:600;color:var(--text-muted)">Médico ID:</label>
        <input id="filtro-block-medico" type="number" placeholder="Todos" style="width:90px" />
        <label style="font-size:12px;font-weight:600;color:var(--text-muted)">Fecha:</label>
        <input id="filtro-block-fecha" type="date" />
        <button class="btn btn-ghost btn-sm" onclick="cargarBlocks()">Filtrar</button>
        <div class="spacer"></div>
      </div>
      <table>
        <thead><tr>
          <th>ID</th><th>Médico</th><th>Fecha</th><th>Hora inicio</th><th>Hora fin</th><th>Motivo</th><th>Acciones</th>
        </tr></thead>
        <tbody id="tbody-blocks">${tableLoading(7)}</tbody>
      </table>
    </div>`;
  cargarBlocks();
}

async function cargarBlocks() {
  const medicoId = document.getElementById("filtro-block-medico")?.value.trim();
  const fecha    = document.getElementById("filtro-block-fecha")?.value;
  const params = new URLSearchParams();
  if (medicoId) params.set("medico_id", medicoId);
  if (fecha)    params.set("fecha", fecha);
  const tbody = document.getElementById("tbody-blocks");
  tbody.innerHTML = tableLoading(7);
  try {
    const qs = params.toString();
    const { datos } = await apiFetch(`${API.disponibilidad}/doctor-blocks${qs ? "?" + qs : ""}`);
    if (!datos.length) { tbody.innerHTML = tableEmpty(7); return; }
    tbody.innerHTML = datos.map(b => `
      <tr>
        <td>${b.id}</td>
        <td>${b.medico || b.medico_id}</td>
        <td>${fmtDate(b.fecha)}</td>
        <td>${b.hora_inicio ? String(b.hora_inicio).substring(0,5) : "<span style='color:var(--text-muted)'>Todo el día</span>"}</td>
        <td>${b.hora_fin   ? String(b.hora_fin).substring(0,5)   : "—"}</td>
        <td>${b.motivo || "—"}</td>
        <td class="td-actions">
          <button class="btn btn-danger btn-sm" onclick="eliminarBlock(${b.id})">Eliminar</button>
        </td>
      </tr>`).join("");
  } catch (err) {
    tbody.innerHTML = tableEmpty(7, `Error: ${err.message}`);
  }
}

async function openFormBlock() {
  let medicos = [];
  try {
    const r = await apiFetch(`${API.usuarios}/usuarios`);
    medicos = r.datos.filter(u => u.rol === "medico" && u.activo);
  } catch { }
  const optMedicos = medicos.length
    ? medicos.map(m => `<option value="${m.id}">${m.nombre} (ID ${m.id})</option>`).join("")
    : `<option value="">No hay médicos registrados</option>`;

  openModal("Nuevo Bloqueo", `
    <div class="form-group">
      <label>Médico</label>
      <select id="f-block-medico">${optMedicos}</select>
    </div>
    <div class="form-group">
      <label>Fecha</label>
      <input id="f-block-fecha" type="date" />
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Hora inicio (opcional)</label>
        <input id="f-block-inicio" type="time" />
      </div>
      <div class="form-group">
        <label>Hora fin (opcional)</label>
        <input id="f-block-fin" type="time" />
      </div>
    </div>
    <div class="form-group">
      <label>Motivo (opcional)</label>
      <input id="f-block-motivo" type="text" placeholder="Ej: Reunión, vacaciones..." />
    </div>
    <p style="font-size:12px;color:var(--text-muted)">Sin hora → bloqueo de todo el día.</p>
    <div class="form-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="guardarBlock()">Crear bloqueo</button>
    </div>`);
}

async function guardarBlock() {
  const medico_id   = document.getElementById("f-block-medico").value;
  const fecha       = document.getElementById("f-block-fecha").value;
  const hora_inicio = document.getElementById("f-block-inicio").value || null;
  const hora_fin    = document.getElementById("f-block-fin").value || null;
  const motivo      = document.getElementById("f-block-motivo").value.trim() || null;
  if (!medico_id || !fecha) {
    toast("Médico y fecha son requeridos", "error"); return;
  }
  if (hora_inicio && hora_fin && hora_inicio >= hora_fin) {
    toast("La hora de inicio debe ser anterior a la hora fin", "error"); return;
  }
  try {
    await apiFetch(`${API.disponibilidad}/doctor-blocks`, {
      method: "POST",
      body: JSON.stringify({ medico_id: parseInt(medico_id), fecha, hora_inicio, hora_fin, motivo }),
    });
    toast("Bloqueo creado", "success");
    closeModal();
    cargarBlocks();
  } catch (err) {
    toast(err.message, "error");
  }
}

async function eliminarBlock(id) {
  if (!confirm("¿Eliminar este bloqueo?")) return;
  try {
    await apiFetch(`${API.disponibilidad}/doctor-blocks/${id}`, { method: "DELETE" });
    toast("Bloqueo eliminado", "success");
    cargarBlocks();
  } catch (err) {
    toast(err.message, "error");
  }
}


async function renderCitas(filtroEstado = "") {
  const main = document.getElementById("main-content");
  main.innerHTML = `
    <div class="card">
      <div class="card-toolbar">
        <label style="font-size:12px;font-weight:600;color:var(--text-muted)">Estado:</label>
        <select id="filtro-estado">
          <option value="">Activas (pendiente/confirmada)</option>
          <option value="pendiente"  ${filtroEstado==="pendiente" ?"selected":""}>Pendiente</option>
          <option value="confirmada" ${filtroEstado==="confirmada" ?"selected":""}>Confirmada</option>
          <option value="cancelada"   ${filtroEstado==="cancelada"  ?"selected":""}>Cancelada</option>
          <option value="completada"  ${filtroEstado==="completada" ?"selected":""}>Completada</option>
        </select>
        <div class="spacer"></div>
      </div>
      <table>
        <thead><tr>
          <th>ID</th><th>Fecha y hora</th><th>Paciente</th>
          <th>MÃ©dico</th><th>Estado</th><th>Notas</th><th>Acciones</th>
        </tr></thead>
        <tbody id="tbody-citas">${tableLoading(7)}</tbody>
      </table>
    </div>`;

  document.getElementById("filtro-estado").addEventListener("change", e => {
    renderCitas(e.target.value);
  });

  try {
    const { datos } = await apiFetch(`${API.citas}/citas`);
    let filtradas = filtroEstado
      ? datos.filter(c => c.estado === filtroEstado)
      : datos.filter(c => c.estado === "pendiente" || c.estado === "confirmada");

    if (currentUser?.rol === "medico") {
      filtradas = filtradas.filter(c =>
        Number(c.medico_id) === Number(currentUser.id) ||
        String(c.medico || "").toLowerCase() === String(currentUser.nombre || "").toLowerCase()
      );
    } else if (currentUser?.rol === "paciente") {
      filtradas = filtradas.filter(c =>
        Number(c.paciente_id) === Number(currentUser.id) ||
        String(c.paciente || "").toLowerCase() === String(currentUser.nombre || "").toLowerCase()
      );
    }

    const tbody = document.getElementById("tbody-citas");
    if (!filtradas.length) { tbody.innerHTML = tableEmpty(7); return; }
    tbody.innerHTML = filtradas.map(c => `
      <tr>
        <td>${c.id}</td>
        <td>${fmtDate(c.fecha)} ${String(c.hora_inicio || "").substring(0,5)} - ${String(c.hora_fin || "").substring(0,5)}</td>
        <td>${c.paciente}</td>
        <td>${c.medico}</td>
        <td>${badge(c.estado, c.estado)}</td>
        <td>${cleanNota(c.notas)}</td>
        <td class="td-actions">
          ${c.estado === "pendiente" ? `
            <button class="btn btn-success btn-sm" onclick="confirmarCita(${c.id})" ${!currentUser.activo ? "disabled" : ""}>Confirmar</button>
            <button class="btn btn-danger btn-sm" onclick="cancelarCita(${c.id})" ${!currentUser.activo ? "disabled" : ""}>Cancelar</button>
          ` : c.estado === "confirmada" ? `
            <button class="btn btn-success btn-sm" onclick="completarCita(${c.id})" ${!currentUser.activo ? "disabled" : ""}>Completar</button>
            <button class="btn btn-danger btn-sm" onclick="cancelarCita(${c.id})" ${!currentUser.activo ? "disabled" : ""}>Cancelar</button>
          ` : `<span style="color:var(--text-muted);font-size:12px">${c.estado}</span>`}
        </td>
      </tr>`).join("");
  } catch (err) {
    document.getElementById("tbody-citas").innerHTML =
      tableEmpty(7, `Error al cargar citas: ${err.message}`);
  }
}

async function openFormCita() {
  let pacientes = [], medicos = [];
  try {
    const r = await apiFetch(`${API.usuarios}/usuarios`);
    pacientes = r.datos.filter(u => u.rol === "paciente" && u.activo);
    medicos   = r.datos.filter(u => u.rol === "medico"   && u.activo);
  } catch { /* sin usuarios */ }

  const optPac = pacientes.length
    ? pacientes.map(p => `<option value="${p.id}">${p.nombre}</option>`).join("")
    : `<option value="">Sin pacientes registrados</option>`;

  const optMed = medicos.length
    ? medicos.map(m => `<option value="${m.id}">${m.nombre}</option>`).join("")
    : `<option value="">Sin mÃ©dicos registrados</option>`;

  // Fecha/hora mÃ­nima = ahora
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  const minDT = now.toISOString().slice(0, 16);

  openModal("Agendar Nueva Cita", `
    <div class="form-group">
      <label>Paciente</label>
      <select id="f-cita-pac">${optPac}</select>
    </div>
    <div class="form-group">
      <label>MÃ©dico</label>
      <select id="f-cita-med">${optMed}</select>
    </div>
    <div class="form-group">
      <label>Fecha y hora</label>
      <input id="f-cita-dt" type="datetime-local" min="${minDT}" />
    </div>
    <div class="form-group">
      <label>Notas (opcional)</label>
      <textarea id="f-cita-notas" placeholder="Motivo de consulta, observacionesâ€¦"></textarea>
    </div>
    <p style="font-size:12px;color:var(--text-muted);margin-bottom:4px">
      â„¹ï¸ El mÃ©dico debe tener disponibilidad registrada en ese horario.
    </p>
    <div class="form-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="guardarCita()">Agendar Cita</button>
    </div>`);
}

async function guardarCita() {
  const paciente_id = document.getElementById("f-cita-pac").value;
  const medico_id   = document.getElementById("f-cita-med").value;
  const fecha_hora  = document.getElementById("f-cita-dt").value;
  const notas       = document.getElementById("f-cita-notas").value.trim();

  if (!paciente_id || !medico_id || !fecha_hora) {
    toast("Completa todos los campos requeridos", "error"); return;
  }

  const [fecha, horaStr] = fecha_hora.split('T');
  const hora_inicio = horaStr.slice(0, 5);
  const [h, m] = hora_inicio.split(':').map(Number);
  const totalMin = h * 60 + m + 30;
  const hora_fin = String(Math.floor(totalMin / 60)).padStart(2, '0') + ':' + String(totalMin % 60).padStart(2, '0');

  try {
    await apiFetch(`${API.citas}/citas`, {
      method: "POST",
      body: JSON.stringify({
        paciente_id: parseInt(paciente_id),
        medico_id:   parseInt(medico_id),
        fecha,
        hora_inicio,
        hora_fin,
        notas: notas || null,
      }),
    });
    toast("Cita agendada correctamente", "success");
    closeModal();
    renderCitas();
  } catch (err) {
    toast(err.message, "error");
  }
}

async function cancelarCita(id) {
  if (!confirm("Â¿Cancelar esta cita?")) return;
  try {
    await apiFetch(`${API.citas}/citas/${id}/cancelar`, { method: "PATCH" });
    toast("Cita cancelada", "success");
    renderCitas();
  } catch (err) {
    toast(err.message, "error");
  }
}

async function confirmarCita(id) {
  if (!confirm("Confirmar esta cita?")) return;
  try {
    await apiFetch(`${API.citas}/citas/${id}/confirmar`, { method: "PATCH" });
    toast("Cita confirmada", "success");
    renderCitas();
  } catch (err) {
    toast(err.message, "error");
  }
}

async function completarCita(id) {
  if (!confirm("Â¿Marcar esta cita como completada?")) return;
  try {
    await apiFetch(`${API.citas}/citas/${id}/completar`, { method: "PATCH" });
    toast("Cita marcada como completada", "success");
    renderCitas();
  } catch (err) {
    toast(err.message, "error");
  }
}

/* â”€â”€ Inicio â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
initAuth();

async function renderHistorial() {
  const main = document.getElementById("main-content");
  main.innerHTML = `
    <div class="card">
      <div class="card-toolbar">
        <label style="font-size:12px;font-weight:600;color:var(--text-muted)">Estado:</label>
        <select id="filtro-h-estado">
          <option value="">Todos los eventos</option>
          <option value="completada">Completada</option>
          <option value="cancelada">Cancelada</option>
          <option value="confirmada">Confirmada</option>
          <option value="pendiente">Pendiente</option>
        </select>
        <button class="btn btn-ghost btn-sm" id="btn-recargar-h">Recargar</button>
      </div>
      <table>
        <thead><tr>
          <th>ID evento</th><th>Cita</th><th>Accion</th><th>Estado</th><th>Fecha</th><th>Hora</th><th>Detalle</th>
        </tr></thead>
        <tbody id="tbody-historial">${tableLoading(7)}</tbody>
      </table>
    </div>
  `;

  document.getElementById("filtro-h-estado").addEventListener("change", cargarHistorial);
  document.getElementById("btn-recargar-h").addEventListener("click", cargarHistorial);
  await cargarHistorial();
}

async function cargarHistorial() {
  const tbody = document.getElementById("tbody-historial");
  if (!tbody) return;
  tbody.innerHTML = tableLoading(7);

  const estadoSel = document.getElementById("filtro-h-estado")?.value || "";
  const params = new URLSearchParams();
  params.set("limit", "300");
  if (estadoSel) params.set("estado", estadoSel);

  if (currentUser?.rol === "medico") params.set("medico_id", String(currentUser.id));
  if (currentUser?.rol === "paciente") params.set("paciente_id", String(currentUser.id));

  try {
    const { datos } = await apiFetch(`${API.historial}/historial?${params.toString()}`);
    const rows = datos || [];
    if (!rows.length) {
      tbody.innerHTML = tableEmpty(7, "Sin eventos en historial");
      return;
    }

    tbody.innerHTML = rows.map(h => `
      <tr>
        <td>${h.id}</td>
        <td>${h.cita_id}</td>
        <td>${h.accion || "-"}</td>
        <td>${badge(h.estado, h.estado)}</td>
        <td>${fmtDate(h.fecha)}</td>
        <td>${(h.hora_inicio || "").substring(0,5)} - ${(h.hora_fin || "").substring(0,5)}</td>
        <td>${h.detalle || "-"}</td>
      </tr>
    `).join("");
  } catch (err) {
    tbody.innerHTML = tableEmpty(7, err.message || "Error cargando historial");
  }
}
