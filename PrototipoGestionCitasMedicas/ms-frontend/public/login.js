const API_AUTH = "http://localhost:8080/api/auth";
const AUTH_USER_KEY = "gcitas_current_user";
const AUTH_TOKEN_KEY = "gcitas_auth_token";

const btnLogin = document.getElementById("btn-login");
const inpEmail = document.getElementById("inp-email");
const inpPw = document.getElementById("inp-pw");
const err = document.getElementById("login-error");
const pwBtn = document.getElementById("pw-btn");
const iconOpen = document.getElementById("icon-open");
const iconClosed = document.getElementById("icon-closed");

const svg = document.getElementById("scene");
const VBW = 390;
const VBH = 470;
const EYES = [
  ["p-l", 96, 164, 7.5],
  ["p-r", 150, 157, 7.5],
  ["b-l", 224, 208, 8],
  ["b-r", 273, 208, 8],
  ["o-l", 50, 357, 4],
  ["o-r", 96, 347, 4],
  ["y-e", 304, 316, 5],
];

function moveEyesTo(mx, my) {
  EYES.forEach(([id, bx, by, maxR]) => {
    const dx = mx - bx;
    const dy = my - by;
    const dist = Math.hypot(dx, dy);
    const r = maxR * (1 - 1 / (1 + dist / 90));
    const angle = Math.atan2(dy, dx);
    const el = document.getElementById(id);
    if (!el) return;
    el.setAttribute("cx", (bx + Math.cos(angle) * r).toFixed(2));
    el.setAttribute("cy", (by + Math.sin(angle) * r).toFixed(2));
  });
}

function lookAtDomTarget(targetEl) {
  if (!svg || !targetEl) return;
  const sRect = svg.getBoundingClientRect();
  const tRect = targetEl.getBoundingClientRect();
  const tx = tRect.left + (tRect.width / 2);
  const ty = tRect.top + (tRect.height / 2);
  const mx = ((tx - sRect.left) / sRect.width) * VBW;
  const my = ((ty - sRect.top) / sRect.height) * VBH;
  moveEyesTo(mx, my);
}

document.addEventListener("mousemove", (e) => {
  if (!svg) return;
  if (document.activeElement === inpEmail || document.activeElement === inpPw) return;
  const rect = svg.getBoundingClientRect();
  const mx = ((e.clientX - rect.left) / rect.width) * VBW;
  const my = ((e.clientY - rect.top) / rect.height) * VBH;
  moveEyesTo(mx, my);
});

const lidL = document.getElementById("pl-lid");
const lidR = document.getElementById("pr-lid");
let animId = null;

function animateLids(targetH) {
  if (!lidL || !lidR) return;
  if (animId) cancelAnimationFrame(animId);
  function step() {
    const curr = parseFloat(lidL.getAttribute("height")) || 0;
    const diff = targetH - curr;
    if (Math.abs(diff) < 0.3) {
      lidL.setAttribute("height", String(targetH));
      lidR.setAttribute("height", String(targetH));
      return;
    }
    const next = curr + diff * 0.14;
    lidL.setAttribute("height", String(next));
    lidR.setAttribute("height", String(next));
    animId = requestAnimationFrame(step);
  }
  animId = requestAnimationFrame(step);
}

function updateSquint() {
  const focused = document.activeElement === inpPw;
  const hidden = inpPw.type === "password";
  animateLids(focused && hidden ? 12 : 0);
}
inpPw.addEventListener("focus", updateSquint);
inpPw.addEventListener("blur", updateSquint);
inpEmail.addEventListener("focus", () => lookAtDomTarget(inpEmail));
inpPw.addEventListener("focus", () => lookAtDomTarget(inpPw));
inpEmail.addEventListener("input", () => { if (document.activeElement === inpEmail) lookAtDomTarget(inpEmail); });
inpPw.addEventListener("input", () => { if (document.activeElement === inpPw) lookAtDomTarget(inpPw); });
inpEmail.addEventListener("blur", () => {
  if (document.activeElement !== inpPw) {
    moveEyesTo(195, 210);
  }
});
inpPw.addEventListener("blur", () => {
  if (document.activeElement !== inpEmail) {
    moveEyesTo(195, 210);
  }
});

pwBtn.addEventListener("click", () => {
  const isHidden = inpPw.type === "password";
  inpPw.type = isHidden ? "text" : "password";
  iconOpen.style.display = isHidden ? "none" : "";
  iconClosed.style.display = isHidden ? "" : "none";
  updateSquint();
  inpPw.focus();
});

async function doLogin() {
  err.textContent = "";
  const email = inpEmail.value.trim().toLowerCase();
  const password = inpPw.value;
  if (!email || !password) {
    err.textContent = "Ingresa correo y contraseña.";
    return;
  }
  try {
    const res = await fetch(`${API_AUTH}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(data.user));
    localStorage.setItem(AUTH_TOKEN_KEY, data.token);
    window.location.href = "/index.html";
  } catch (e) {
    err.textContent = e.message || "No fue posible iniciar sesión.";
  }
}

btnLogin.addEventListener("click", doLogin);
inpPw.addEventListener("keydown", (e) => { if (e.key === "Enter") doLogin(); });
