export default {
	buildModel() {
		const customer = q_cliente_detalle.data?.[0] || q_cliente_detalle.data || {};
		const progress = q_cliente_progress.data || {};

		const currentVisits = Number(progress.count || 0);
		const totalSlots    = Number(progress.target || (progress.isVip ? 4 : 10));
		const isVip         = !!progress.isVip;

		return {
			// info de cliente / plan
			planName: customer.tag || "",
			tag: customer.tag || "",
			currentVisits,
			totalSlots,
			isVip,

			// si quieres, puedes pre-construir slots aquí (opcional)
			// pero como el widget ya tiene ensureSlots, podrías omitirlo
			// slots: Array.from({ length: totalSlots }).map((_, i) => ({
			//   value: i + 1,
			//   filled: i + 1 <= currentVisits,
			// })),
		};
	}
};
