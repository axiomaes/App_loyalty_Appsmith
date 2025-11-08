export default {
	// Precio de venta por mensaje (cámbialo aquí y se aplica en todo)
	PRICE_PER_MSG: 0.25,

	_digits(s){ return String(s || "").replace(/\D/g, ""); },

	async logSend({
		to,
		sid,
		category = "utility", // "utility" | "marketing" | "auth" | ...
		template = "HX3b91ea6167d412d8eacc07312603e58a", // vip_pago_aviso_es
		unit = null
	}) {
		try {
			const price = unit ?? this.PRICE_PER_MSG;
			const toDigits = this._digits(to);
			const bid = (typeof Auth?.businessId === "function" && Auth.businessId()) || appsmith.store?.businessId;
			if (!bid || !toDigits) return;

			if (typeof q_wa_log_insert?.run !== "function") {
				console.warn("q_wa_log_insert no existe; no se loguea el envío.");
				return;
			}

			await q_wa_log_insert.run({
				business_id: bid,
				to_digits: toDigits,
				template_sid: template,
				category,
				twilio_sid: sid || null,
				status: "sent",
				unit_price_eur: Number(price)
			});
		} catch (e) {
			console.warn("logSend fail:", e);
		}
	}
};
