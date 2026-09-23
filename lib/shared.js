const { createHash, randomBytes, timingSafeEqual } = require("node:crypto");

const env = {
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  resendKey: process.env.RESEND_API_KEY,
  reviewFrom: process.env.REVIEW_FROM_EMAIL,
  adminToken: process.env.ADMIN_TOKEN,
  siteUrl: process.env.SITE_URL || "https://beauty-care-landing.vercel.app"
};

function sendJson(res, status, payload) {
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  return res.end(JSON.stringify(payload));
}

function method(req, res, allowed) {
  const methods = allowed.split(",").map((item) => item.trim());
  if (methods.includes(req.method)) return true;
  res.setHeader("Allow", methods.join(", "));
  sendJson(res, 405, { error: "Método no permitido." });
  return false;
}

function configured(res, { email = false } = {}) {
  const missing = !env.supabaseUrl || !env.supabaseKey ||
    (email && (!env.resendKey || !env.reviewFrom));
  if (missing) {
    sendJson(res, 503, { error: "El sistema de pedidos verificados todavía se está configurando." });
    return false;
  }
  return true;
}

async function db(path, options = {}) {
  const response = await fetch(`${env.supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: env.supabaseKey,
      // Supabase's new sb_secret_* keys are API keys, not JWTs, so they
      // must not be sent as a Bearer token. Keep legacy service_role support.
      ...(env.supabaseKey.startsWith("sb_secret_") ? {} : { Authorization: `Bearer ${env.supabaseKey}` }),
      "Content-Type": "application/json",
      ...options.headers
    }
  });
  const body = await response.text();
  let data = null;
  try { data = body ? JSON.parse(body) : null; } catch (_) {}
  if (!response.ok) {
    const error = new Error(data && data.message ? data.message : "Error de base de datos.");
    error.status = response.status;
    throw error;
  }
  return { data, response };
}

function adminAuthorized(req) {
  const provided = req.headers["x-admin-token"] || "";
  const expected = env.adminToken || "";
  const a = Buffer.from(String(provided));
  const b = Buffer.from(String(expected));
  return Boolean(expected && a.length === b.length && timingSafeEqual(a, b));
}

function cleanText(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function validEmail(value) {
  return typeof value === "string" && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function newToken() {
  return randomBytes(32).toString("base64url");
}

async function sendReviewInvite(email, name, token) {
  const reviewUrl = `${env.siteUrl}/?resena=${encodeURIComponent(token)}#resenas`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.reviewFrom,
      to: [email],
      subject: "Ya puedes compartir tu experiencia con Beauty Care",
      text: `Hola ${name}. Confirmamos tu entrega de Beauty Care. Abre este enlace personal para verificar tu correo y dejar una reseña: ${reviewUrl}\n\nCada pedido permite una reseña. Si no hiciste este pedido, ignora este mensaje.`,
      html: `<div style="font-family:Arial,sans-serif;color:#24212a;line-height:1.6"><h2>Gracias por tu compra, ${escapeHtml(name)}.</h2><p>Confirmamos la entrega de tu pedido de Beauty Care. Usa el botón para verificar tu correo y compartir tu experiencia.</p><p><a href="${reviewUrl}" style="display:inline-block;padding:12px 20px;border-radius:10px;background:#e94e91;color:white;text-decoration:none;font-weight:bold">Verificar mi correo y opinar</a></p><p>El enlace es personal y cada pedido permite una reseña. Si no hiciste este pedido, ignora este mensaje.</p></div>`
    })
  });
  if (!response.ok) throw new Error("No se pudo enviar la invitación de reseña por correo.");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[character]);
}

module.exports = {
  env, sendJson, method, configured, db, adminAuthorized, cleanText,
  validEmail, hashToken, newToken, sendReviewInvite, escapeHtml
};
