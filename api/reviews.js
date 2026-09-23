const { sendJson, method, configured, db, cleanText, hashToken } = require("../lib/shared");

async function tokenRequest(rawToken) {
  if (typeof rawToken !== "string" || rawToken.length < 30 || rawToken.length > 200) return null;
  const { data } = await db(
    `review_requests?token_hash=eq.${hashToken(rawToken)}&used_at=is.null&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=id,order_id,expires_at`
  );
  if (!data || !data.length) return null;
  const { data: orders } = await db(`orders?id=eq.${data[0].order_id}&status=eq.delivered&select=id,first_name,last_name,email`);
  return orders && orders[0] ? { invitation: data[0], order: orders[0] } : null;
}

module.exports = async function handler(req, res) {
  if (!method(req, res, "GET, POST") || !configured(res)) return;
  try {
    if (req.method === "GET") {
      const token = req.query && req.query.token;
      if (token) {
        const access = await tokenRequest(token);
        return access
          ? sendJson(res, 200, { eligible: true, name: access.order.first_name })
          : sendJson(res, 410, { eligible: false, error: "Este enlace ya se usó o venció. Escríbenos para verificar tu pedido." });
      }
      const [{ data: reviews }, { data: stats }, { response: salesResponse }] = await Promise.all([
        db("reviews?select=display_name,rating,comment,created_at&order=created_at.desc&limit=100"),
        db("rpc/review_stats", { method: "POST", body: "{}" }),
        db("orders?status=eq.delivered&select=id&limit=1", { headers: { Prefer: "count=exact" } })
      ]);
      const range = salesResponse.headers.get("content-range") || "*/0";
      const salesCount = Number(range.split("/").pop()) || 0;
      const reviewStats = stats && stats[0] ? stats[0] : { review_count: 0, average_rating: null };
      return sendJson(res, 200, {
        reviews: (reviews || []).map((review) => ({
          name: review.display_name,
          rating: review.rating,
          comment: review.comment,
          date: new Date(review.created_at).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" })
        })),
        salesCount,
        reviewCount: Number(reviewStats.review_count),
        averageRating: reviewStats.average_rating === null ? null : Number(reviewStats.average_rating)
      });
    }

    const input = req.body || {};
    const access = await tokenRequest(input.token);
    if (!access) return sendJson(res, 410, { error: "Este enlace ya se usó o venció." });
    const rating = Number(input.rating);
    const displayName = cleanText(input.name, 40);
    const comment = cleanText(input.comment, 280);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5 || displayName.length < 2 || comment.length < 8) {
      return sendJson(res, 400, { error: "Escribe tu nombre, una calificación y un comentario de al menos 8 caracteres." });
    }
    const [{ data: used }, { data: priorReviews }] = await Promise.all([
      db(`review_requests?id=eq.${access.invitation.id}&select=used_at`),
      db(`reviews?order_id=eq.${access.order.id}&select=id`)
    ]);
    if (!used || used[0].used_at || (priorReviews && priorReviews.length)) {
      return sendJson(res, 409, { error: "Este pedido ya tiene una reseña publicada." });
    }
    const { data: created } = await db("reviews?select=id", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ order_id: access.order.id, display_name: displayName, rating, comment })
    });
    await db(`review_requests?id=eq.${access.invitation.id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ used_at: new Date().toISOString() })
    });
    return sendJson(res, 201, { published: true, id: created && created[0] ? created[0].id : null });
  } catch (_) {
    return sendJson(res, 503, { error: "No pudimos procesar la solicitud. Inténtalo de nuevo más tarde." });
  }
};
