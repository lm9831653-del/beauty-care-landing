const {
  sendJson, method, configured, db, adminAuthorized, validEmail,
  newToken, hashToken, sendReviewInvite, cleanText
} = require("../lib/shared");

module.exports = async function handler(req, res) {
  if (!method(req, res, "GET, POST") || !configured(res)) return;
  if (!adminAuthorized(req)) return sendJson(res, 401, { error: "Acceso no autorizado." });
  try {
    if (req.method === "GET") {
      const { data } = await db("orders?select=id,first_name,last_name,email,status,created_at&order=created_at.desc&limit=100");
      return sendJson(res, 200, { orders: data || [] });
    }
    const orderId = cleanText(req.body && req.body.orderId, 64);
    const action = cleanText(req.body && req.body.action, 20);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId)) {
      return sendJson(res, 400, { error: "Referencia de pedido no válida." });
    }
    const { data: found } = await db(`orders?id=eq.${orderId}&select=id,first_name,last_name,email,status`);
    const order = found && found[0];
    if (!order) return sendJson(res, 404, { error: "No encontramos ese pedido." });

    if (action === "correct") {
      const firstName = cleanText(req.body && req.body.firstName, 80);
      const lastName = cleanText(req.body && req.body.lastName, 80);
      const email = cleanText(req.body && req.body.email, 254).toLowerCase();
      if (!firstName || !lastName || !validEmail(email)) return sendJson(res, 400, { error: "Revisa el nombre y el correo." });
      await db(`orders?id=eq.${orderId}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ first_name: firstName, last_name: lastName, email }) });
      await db(`review_requests?order_id=eq.${orderId}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
      return sendJson(res, 200, { updated: true, message: "Datos corregidos; los enlaces anteriores dejaron de funcionar. Si ya se entregó, envía una nueva invitación." });
    }
    if (action === "erase-data") {
      await db(`orders?id=eq.${orderId}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ first_name: "Datos", last_name: "eliminados", email: `privacy-erased+${orderId}@invalid.local` }) });
      await Promise.all([
        db(`review_requests?order_id=eq.${orderId}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }),
        db(`reviews?order_id=eq.${orderId}`, { method: "DELETE", headers: { Prefer: "return=minimal" } })
      ]);
      return sendJson(res, 200, { updated: true, message: "Datos de contacto y reseña eliminados; el registro de entrega se conserva sin nombre ni correo para el contador." });
    }

    if (action === "confirm") {
      if (order.status === "pending") {
        await db(`orders?id=eq.${orderId}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status: "confirmed", confirmed_at: new Date().toISOString() }) });
      } else if (!["confirmed", "delivered"].includes(order.status)) {
        return sendJson(res, 409, { error: "Solo se pueden confirmar pedidos pendientes." });
      }
      return sendJson(res, 200, { updated: true, message: "Datos del pedido confirmados. Registra la entrega cuando la persona reciba el producto." });
    }
    if (action === "deliver") {
      if (order.status !== "confirmed" && order.status !== "delivered") return sendJson(res, 409, { error: "Confirma el pedido antes de marcarlo como entregado." });
      if (order.status !== "delivered") {
        await db(`orders?id=eq.${orderId}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status: "delivered", delivered_at: new Date().toISOString() }) });
      }
      if (!configured(res, { email: true })) return;
      await invite(order);
      return sendJson(res, 200, { updated: true, message: "Entrega registrada; invitación enviada al correo verificado del pedido." });
    }
    if (action === "send-invite") {
      if (order.status !== "delivered") return sendJson(res, 409, { error: "Solo se envía invitación a pedidos entregados." });
      if (!configured(res, { email: true })) return;
      await invite(order);
      return sendJson(res, 200, { updated: true, message: "Invitación enviada al correo registrado." });
    }
    if (action === "cancel") {
      if (order.status === "delivered") return sendJson(res, 409, { error: "Una entrega registrada no se puede cancelar aquí." });
      await db(`orders?id=eq.${orderId}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status: "cancelled" }) });
      return sendJson(res, 200, { updated: true, message: "Pedido cancelado." });
    }
    return sendJson(res, 400, { error: "Acción no válida." });
  } catch (error) {
    return sendJson(res, 503, { error: error.message || "No se pudo completar la acción." });
  }
};

async function invite(order) {
  const rawToken = newToken();
  await db("review_requests", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ order_id: order.id, token_hash: hashToken(rawToken), expires_at: new Date(Date.now() + 14 * 86400000).toISOString() })
  });
  await sendReviewInvite(order.email, order.first_name, rawToken);
}
