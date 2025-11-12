export default {
	// ================== CONFIG ==================
	API_BASE: "https://axioma-api.loyalty.axioma-creativa.es/public/customers",

	// ================== ESTADO ==================
	_timer: null,

	// ================== HELPERS =================
	_isUuid(s) {
		return typeof s === "string" &&
			/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
	},
	_normId(id) {
		const s = String(id || "").trim();
		return s && this._isUuid(s) ? s : "";
	},
	_normSize(size, def = 300) {
		const n = Number(size);
		return Number.isFinite(n) ? Math.max(64, Math.min(1024, Math.trunc(n))) : def;
	},
	_clean(text) {
		return String(text || "")
			.replace(/\uFEFF/g, "")
			.replace(/[\r\n\t]+$/g, "")
			.trim();
	},
	_refocus() {
		try { ScanInput?.focus && ScanInput.focus(); } catch (_) {}
	},

	// ================== LECTOR (PISTOLA/CÁMARA) ==================
	/** Caso pistola con Enter → vincular a onSubmit del Input oculto */
	async onSubmit(raw) {
		const text = this._clean(raw);
		if (!text) return;
		try {
			await VisitAdd.fromQr(text);
			await storeValue("_lastScanRaw", text);
		} finally {
			ScanInput.setValue("");
			this._refocus();
		}
	},

	/** Caso sin Enter → vincular a onTextChanged del Input oculto */
	onType(raw) {
		const text = this._clean(raw);
		if (!text) return;
		clearTimeout(this._timer);
		this._timer = setTimeout(async () => {
			try {
				await VisitAdd.fromQr(text);
				await storeValue("_lastScanRaw", text);
			} finally {
				ScanInput.setValue("");
				this._refocus();
			}
		}, 150); // debounce corto para pistolas rápidas
	},

	// ================== URLS / ACCIONES ==================
	/** URL del PNG del QR generado por el API */
	pngUrl(id, size = 300) {
		const cid = this._normId(id);
		if (!cid) return "";
		const sz = this._normSize(size);
		return `${this.API_BASE}/${encodeURIComponent(cid)}/qr.png?size=${sz}`;
	},

	// --- NUEVO: extraer token desde URL o texto crudo ---
	extractToken(text) {
		if (!text) return "";
		const t = String(text).trim();
		if (!/[\/\s]/.test(t) && t.length >= 6 && t.length <= 64) return t;
		try {
			const url = new URL(t);
			const path = (url.pathname || "").replace(/\/+$/, "");
			const last = path.split("/").filter(Boolean).pop() || "";
			return last;
		} catch {
			const noHash = t.split("#")[0];
			const noQuery = noHash.split("?")[0];
			const last = noQuery.split("/").filter(Boolean).pop() || "";
			return last;
		}
	},

	// --- NUEVO: orquesta una lectura de scanner/pistola ---
	async fromScan(raw) {
		const token = this.extractToken(raw);
		if (!token) {
			showAlert("QR inválido.", "warning");
			return { ok: false, reason: "invalid_token" };
		}
		// Si tu VisitAdd.fromQr acepta token directamente, úsalo:
		if (typeof VisitAdd?.fromQr === "function") {
			return VisitAdd.fromQr(token);
		}
		// O si prefieres por UUID/cliente ID, aquí podrías resolver token->ID
		showAlert("No hay handler para registrar con este QR.", "error");
		return { ok: false, reason: "no_handler" };
	},


	/** URL de la landing pública en Appsmith (si la usas) */
	pageUrl(id) {
		const cid = this._normId(id);
		if (!cid) return "";
		const appName = encodeURIComponent(appsmith.app.name);
		return `${window.location.origin}/app/${appName}/QR_Landing?cid=${encodeURIComponent(cid)}`;
	},

	async copyLandingUrl(id) {
		const url = this.pageUrl(id);
		if (!url) return showAlert("Cliente inválido.", "warning");
		await copyToClipboard(url);
		showAlert("Enlace copiado al portapapeles.", "success");
	},

	openLanding(id) {
		const url = this.pageUrl(id);
		if (!url) return showAlert("Cliente inválido.", "warning");
		window.open(url, "_blank", "noopener,noreferrer");
	},

	async copyPngUrl(id, size = 300) {
		const url = this.pngUrl(id, size);
		if (!url) return showAlert("Cliente inválido.", "warning");
		await copyToClipboard(url);
		showAlert("URL del QR copiada.", "success");
	},
};
