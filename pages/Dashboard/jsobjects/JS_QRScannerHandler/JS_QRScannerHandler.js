export default {
	// tiempo mínimo entre dos lecturas idénticas
	DEDUP_MS: 2500,

	// --- normaliza mensaje desde iframe (evento, string u objeto) ---
	_normalize(ev) {
		if (!ev) return null;

		let msg = ev;

		// Si viene como event.data (postMessage)
		if (typeof ev === "object" && ev !== null && "data" in ev) {
			msg = ev.data;
		}

		// Si es string, intentamos JSON, si no, lo envolvemos
		if (typeof msg === "string") {
			try {
				msg = JSON.parse(msg);
			} catch {
				msg = { type: "QR_DETECTED", payload: { text: msg } };
			}
		}

		return (msg && typeof msg === "object") ? msg : null;
	},

	// --- dedupe básico por último QR procesado ---
	_dedupe(raw) {
		const now  = Date.now();
		const last = appsmith.store?.lastQRProcessed || "";
		const at   = Number(appsmith.store?.lastQRAt || 0);
		const dup  = raw === last && (now - at) < this.DEDUP_MS;

		if (!dup) {
			storeValue("lastQRProcessed", raw, false);
			storeValue("lastQRAt", now, false);
		}

		return !dup;
	},

	// --- saca un "token" del texto/URL (solo para guardar/reference) ---
	_extractToken(text) {
		if (!text) return "";
		const t = String(text).trim();

		// Si ya parece un token limpio (sin / ni espacios)
		if (!/[\/\s]/.test(t) && t.length >= 6 && t.length <= 64) return t;

		// Quitamos fragmento y query
		const noHash  = t.split("#")[0];
		const noQuery = noHash.split("?")[0];

		// Tomamos la última parte del path
		return noQuery
			.split("/")
			.filter(Boolean)
			.pop() || "";
	},

	// --- entry point: llamado desde onMessageReceived del Iframe ---
	async onQrMessage(ev) {
		try {
			const msg = this._normalize(ev);
			if (!msg || msg.type !== "QR_DETECTED") return;

			const raw = (msg.payload?.text || msg.text || "").trim();
			if (!raw) return;

			// dedupe rápido para evitar dobles disparos
			if (!this._dedupe(raw)) return;

			// solo para poder ver último QR/token en la app si quieres
			const token = this._extractToken(raw);
			await storeValue("lastQR", raw, false);
			await storeValue("lastQRToken", token, false);

			// delegamos TODO el flujo a VisitAdd
			if (typeof VisitAdd?.fromQr === "function") {
				await VisitAdd.fromQr(raw);
			} else {
				showAlert("No está disponible el manejador de visitas por QR.", "error");
			}
		} catch (e) {
			console.error("QR handler error:", e);
			showAlert("Error procesando el QR.", "error");
			return { ok: false, error: e?.message || String(e) };
		}
	},
};
