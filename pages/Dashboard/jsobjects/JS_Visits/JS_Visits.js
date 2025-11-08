export default {
	// ===== Helpers de widgets / confirm =======================================
	_w(name) { return globalThis[name]; }, // acceso seguro a widgets
	_confirm(msg = "¿Confirmas?") {
		const fn = typeof globalThis.confirm === "function" ? globalThis.confirm : null;
		return Promise.resolve(fn ? !!fn(msg) : true);
	},
	_errMsg(e) {
		return (
			e?.data?.message ||
			e?.responseMeta?.statusText ||
			e?.message ||
			"Ocurrió un error."
		);
	},

	// ===================== 🔧 UTILIDADES ======================================
	cleanScan(text) {
		return String(text || "")
			.replace(/\uFEFF/g, "")
			.replace(/[\r\n\t]+/g, " ")
			.replace(/\s{2,}/g, " ")
			.trim();
	},

	lastVisitAt() {
		const rows = q_visitas_historial?.data || [];
		const iso = rows?.[0]?.fecha;  // tu query expone "fecha"
		return iso ? new Date(iso) : null;
	},

	canAddNow() {
		if (Auth.isAdmin()) return true; // usa Auth centralizado
		const last = this.lastVisitAt();
		if (!last) return true;
		const hours = (Date.now() - last.getTime()) / 3600000;
		return hours >= 48;
	},

	openModal() {
		resetWidget?.('SelReason', true);
		resetWidget?.('TxtNotes', true);
		resetWidget?.('NumCount', true);
		resetWidget?.('ChkForce', true);
		showModal(Modal_add_visit.name);
	},

	baseNotes() {
		const sel = this._w('SelReason');
		const txt = this._w('TxtNotes');

		const label =
					(sel && typeof sel.selectedOptionLabel === "string" && sel.selectedOptionLabel)
		? sel.selectedOptionLabel
		: "Visita manual";

		const extra = (txt?.text || "").trim();
		return extra ? `${label} · ${extra}` : label;
	},

	// ===================== ⚙️ INSERCIÓN BASE ==================================
	async _runInsert({ customerId, notes, count = 1, force = false }) {
		if (!customerId) {
			showAlert("Selecciona un cliente.", "warning");
			return;
		}
		// ⛔️ anti doble clic
		if (appsmith.store._visitBusy) return;
		await storeValue("_visitBusy", true);

		try {
			await q_visit_code_qr.run({
				customerId,
				notes,
				isAdminLike: Auth.isAdmin(),
				force: !!force,
				count: Number(count) || 1,
			});

			await Promise.allSettled([
				q_cliente_detalle?.run?.({ id: customerId }),
				q_visitas_historial.run({ customerId, limit: 500, offset: 0 }),
				getClientVisitsQuery?.run?.(),
				getFallbackVisitsCount?.run?.(),
			]);
		} finally {
			await storeValue("_visitBusy", false);
		}
	},

	// ===================== 🧾 MANUAL ==========================================
	async createManual() {
		const customerId = appsmith.store.selCustomerId || appsmith.store.editingCustomer?.id;
		if (!customerId) return showAlert("Selecciona un cliente.", "warning");

		if (!Auth.isAdmin() && !this.canAddNow()) {
			showAlert("Solo puedes registrar una visita cada 48 horas.", "warning");
			return;
		}

		const notes = this.baseNotes();
		const num = this._w('NumCount');
		const chk = this._w('ChkForce');

		const count = Auth.isAdmin() ? Number(num?.value || 1) : 1;
		const force = Auth.isAdmin() && !!(chk?.isChecked);

		try {
			await this._runInsert({ customerId, notes, count, force });
			closeModal(Modal_add_visit.name);
			showAlert("Visita registrada.", "success");
		} catch (e) {
			showAlert(this._errMsg(e) || "No se pudo registrar.", "error");
		}
	},

	// ===================== 📱 DESDE QR ========================================
	parseCustomerIdFromQr(text) {
		const s = this.cleanScan(text);
		if (!s) return null;

		// a) UUID en cualquier parte
		let m = s.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
		if (m) return m[0];

		// b) Payload AXIOMA
		m = s.match(/AXIOMA:VISIT:CID=([0-9a-f-]{36})/i);
		if (m) return m[1];

		// c) URLs típicas
		m = s.match(/\/public\/customers\/([0-9a-f-]{36})(?:[\/?]|$)/i);
		if (m) return m[1];

		m = s.match(/\/customers\/([0-9a-f-]{36})(?:[\/?]|$)/i);
		if (m) return m[1];

		// d) nada → podría ser token
		return null;
	},

	async _resolveCustomerIdByTokenMaybe(text) {
		const raw = this.cleanScan(text);
		if (!raw) return null;

		if (Utils.isUuid(raw)) return raw;

		// extraer token de: ?token=XYZ | /qr/XYZ | /p/XYZ (partner-web)
		let token = null;

		let q = raw.match(/[?&]token=([\w\-]+)/i);
		if (q) token = q[1];

		if (!token) {
			q = raw.match(/\/qr\/([\w\-]+)/i);
			if (q) token = q[1];
		}

		if (!token) {
			q = raw.match(/\/p\/([\w\-]+)/i);
			if (q) token = q[1];
		}

		token = token || raw;
		if (!token) return null;

		try {
			const businessId = appsmith.store?.session?.businessId || appsmith.store?.businessId;
			const r = await q_qr_token_resolve.run({ token, businessId });
			const cid = r?.[0]?.customerid || r?.[0]?.customerId || null;
			return Utils.isUuid(cid) ? cid : null;
		} catch (e) {
			console.warn("JS_Visits._resolveCustomerIdByTokenMaybe error:", e);
			return null;
		}
	},

	async createFromQr(scannedText) {
		// normaliza
		const cleaned = this.cleanScan(scannedText);
		if (!cleaned) return showAlert("Lectura vacía. Intenta de nuevo.", "warning");

		// ⛔️ debounce lectura idéntica (<1.5s)
		const now = Date.now();
		const lastTs   = appsmith.store._lastScanTs || 0;
		const lastText = appsmith.store._lastScanText || "";
		if (cleaned === String(lastText) && (now - lastTs) < 1500) return;
		await storeValue("_lastScanTs", now);
		await storeValue("_lastScanText", cleaned);

		// 1) intenta UUID / patrones
		let cid = this.parseCustomerIdFromQr(cleaned);

		// 2) si no hay UUID, intenta resolver por token (CustomerQrToken)
		if (!Utils.isUuid(cid)) {
			cid = await this._resolveCustomerIdByTokenMaybe(cleaned);
		}

		if (!Utils.isUuid(cid)) {
			showAlert("QR inválido o no reconocido.", "warning");
			return;
		}

		const selectedId = appsmith.store.selCustomerId || appsmith.store.editingCustomer?.id;
		if (selectedId && selectedId !== cid) {
			const ok = await this._confirm("El QR pertenece a otro cliente. ¿Registrar igualmente?");
			if (!ok) return;
		}

		if (!Auth.isAdmin() && !this.canAddNow()) {
			showAlert("Solo puedes registrar una visita cada 48 horas.", "warning");
			return;
		}

		try {
			await this._runInsert({
				customerId: cid,
				notes: "Visita por QR",
				count: 1,
				force: false
			});
			closeModal(Modal_add_visit.name);
			showAlert("Visita registrada por QR.", "success");
		} catch (e) {
			showAlert(this._errMsg(e) || "No se pudo registrar desde QR.", "error");
		}
	}
};
