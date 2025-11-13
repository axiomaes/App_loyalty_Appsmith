export default {
	// ================== CONFIG ==================
	API_BASE: "https://axioma-api.loyalty.axioma-creativa.es/api/public/customers",

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
		/* no-op para evitar lint por focus */
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
			try { ScanInput && ScanInput.setValue && ScanInput.setValue(""); } catch(_) {}
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
				try { ScanInput && ScanInput.setValue && ScanInput.setValue(""); } catch(_) {}
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
		// ⚠️ NO usar `this.API_BASE` en Appsmith -> usa el nombre del objeto
		const base = String(
			JS_QR.API_BASE || appsmith.store?.API_PUBLIC_BASE ||
			"https://axioma-api.loyalty.axioma-creativa.es/public/customers"
		).replace(/\/+$/, "");
		return `${base}/${encodeURIComponent(cid)}/qr.png?size=${sz}`;
	},

	// --- extraer token desde URL o texto crudo (sin new URL)
	extractToken(text) {
		if (!text) return "";
		const t = String(text).trim();
		if (!/[\/\s]/.test(t) && t.length >= 6 && t.length <= 64) return t;
		const noHash = t.split("#")[0];
		const noQuery = noHash.split("?")[0];
		const last = noQuery.split("/").filter(Boolean).pop() || "";
		return last;
	},

	// --- orquesta una lectura de scanner/pistola ---
	async fromScan(raw) {
		const token = this.extractToken(raw);
		if (!token) {
			showAlert("QR inválido.", "warning");
			return { ok: false, reason: "invalid_token" };
		}
		if (typeof VisitAdd?.fromQr === "function") {
			return VisitAdd.fromQr(token);
		}
		showAlert("No hay handler para registrar con este QR.", "error");
		return { ok: false, reason: "no_handler" };
	},

	/** URL de la landing pública (usa PORTAL_BASE del store si la configuras) */
	pageUrl(id) {
		const cid = this._normId(id);
		if (!cid) return "";
		const base = String(appsmith.store?.PORTAL_BASE || "").replace(/\/+$/, "");
		if (!base) return "";
		return `${base}/QR_Landing?cid=${encodeURIComponent(cid)}`;
	},

	async copyLandingUrl(id) {
		const url = this.pageUrl(id);
		if (!url) return showAlert("Cliente inválido o PORTAL_BASE no configurado.", "warning");
		await copyToClipboard(url);
		showAlert("Enlace copiado al portapapeles.", "success");
	},

	openLanding(id) {
		const url = this.pageUrl(id);
		if (!url) return showAlert("Cliente inválido o PORTAL_BASE no configurado.", "warning");
		navigateTo(url, {}, "NEW_WINDOW");
	},

	async copyPngUrl(id, size = 300) {
		const url = this.pngUrl(id, size);
		if (!url) return showAlert("Cliente inválido.", "warning");
		await copyToClipboard(url);
		showAlert("URL del QR copiada.", "success");
	},

	/* ================== AÑADIDOS MÍNIMOS ================== */

	// 1) URL directa de descarga
	downloadUrl(id) {
		const cid = this._normId(id);
		if (!cid) return "";
		const base = String(
			JS_QR.API_BASE || appsmith.store?.API_PUBLIC_BASE ||
			"https://axioma-api.loyalty.axioma-creativa.es/public/customers"
		).replace(/\/+$/, "");
		return `${base}/${encodeURIComponent(cid)}/qr/download`;
	},

	// 2) Copiar el link de descarga
	async copyDownloadUrl(id) {
		const url = this.downloadUrl(id);
		if (!url) return showAlert("Cliente inválido.", "warning");
		await copyToClipboard(url);
		showAlert("Enlace de descarga copiado.", "success");
	},

	// 3) Abrir descarga en pestaña nueva
	openDownload(id) {
		const url = this.downloadUrl(id);
		if (!url) return showAlert("Cliente inválido.", "warning");
		navigateTo(url, {}, "NEW_WINDOW");
	},

	// 4) Abrir Modal_QR usando el id ya guardado en store
	openQrModalFromStore() {
		const id = appsmith.store?.selCustomerId;
		if (!id) return showAlert("Cliente inválido.", "warning");
		storeValue("qrImg", this.pngUrl(id));              // preview
		storeValue("qrFallbackUrl", this.downloadUrl(id)); // backup/descarga
		showModal(Modal_QR.name);
	},
};
