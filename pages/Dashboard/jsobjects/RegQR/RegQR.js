export default {
	_timer: null,

	// --- extrae customerId de un QR o deeplink
	parseCustomerIdFromQr(text) {
		const s = String(text || "").trim();
		if (!s) return null;

		// AXIOMA:VISIT:CID=<uuid>
		let m = s.match(/AXIOMA:VISIT:CID=([0-9a-f-]{36})/i);
		if (m) return m[1];

		// /customers/<uuid>
		m = s.match(/\/customers\/([0-9a-f-]{36})(?:[\/?]|$)/i);
		if (m) return m[1];

		// /public/customers/<uuid>
		m = s.match(/\/public\/customers\/([0-9a-f-]{36})(?:[\/?]|$)/i);
		if (m) return m[1];

		// Portal /p/<token> NO sirve para registrar, ahí no viene el UUID
		return null;
	},

	async _refreshToday() {
		const bid = appsmith.store.businessId;
		if (typeof q_visitas_hoy?.run === "function") {
			await q_visitas_hoy.run({ bid });
			await storeValue("visitasHoy", q_visitas_hoy.data || []);
		}
	},

	_clearInput() {
		try { InputScanQR.setValue && InputScanQR.setValue(""); } catch(_) {}
	},

	// Pistola que dispara Enter
	async onSubmit(raw) {
		const text = String(raw || "").trim();
		if (!text) return;

		const cid = this.parseCustomerIdFromQr(text);
		if (!cid) {
			showAlert("Código QR inválido o no reconocido.", "warning");
			this._clearInput();
			return;
		}

		try {
			// tu query/endpoint de alta de visita (ajusta el nombre)
			await q_visit_code_qr.run({
				customerId: cid,
				notes: "Visita por QR",
				isAdminLike: Auth.isAdmin?.() || false,
				force: false,
				count: 1
			});

			// refresca el listado del día
			await this._refreshToday();
			showAlert("Visita registrada.", "success");
		} catch (e) {
			showAlert(e?.message || "No se pudo registrar la visita.", "error");
		} finally {
			this._clearInput();
		}
	},

	// Pistola que solo "teclea" (sin Enter). Debounce ~150ms
	onType(raw) {
		const text = String(raw || "").trim();
		if (!text) return;
		clearTimeout(this._timer);
		this._timer = setTimeout(() => this.onSubmit(text), 150);
	}
};
