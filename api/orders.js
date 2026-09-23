const { sendJson, method, configured, db, cleanText, validEmail } = require("../lib/shared");

module.exports = async function handler(req, res) {
  if (!method(req, res, "POST") || !configured(res)) return;
  const input = req.body || {};
  const firstName = cleanText(input.firstName, 80);
  const lastName = cleanText(input.lastName, 80);
  const email = cleanText(input.email, 254).toLowerCase();
  if (!firstName || !lastName || !validEmail(email) || input.privacyConsent !== true) {
    return sendJson(res, 400, { error: "Revisa tu nombre, correo y autorización de tratamiento de datos." });
  }
  try {
    const { data } = await db("orders?select=id,created_at", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ first_name: firstName, last_name: lastName, email, privacy_consent_at: new Date().toISOString(), status: "pending" })
    });
    const order = data && data[0];
    if (!order) throw new Error("No se recibió el registro del pedido.");
    return sendJson(res, 201, { orderId: order.id, createdAt: order.created_at });
  } catch (_) {
    return sendJson(res, 503, { error: "No pudimos registrar el pedido ahora. Puedes continuar por WhatsApp, pero no se habilitará la reseña hasta confirmar el pedido." });
  }
};
