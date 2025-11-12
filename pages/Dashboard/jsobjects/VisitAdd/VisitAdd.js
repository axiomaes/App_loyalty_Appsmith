export default {
	// ----- Motivo de la visita -----
	motive() {
		const label = SelReason?.selectedOptionLabel || "";
		return String(label).trim() || "Visita por servicio";
	},

	// ===== Helpers =====
	cleanScan(text) {
		let s = String(text || "")
		.replace(/\uFEFF/g, "")
		.replace(/[\r\n\t]+/g, " ")
		.trim();

		// Correcciones por lector mal mapeado
		s = s
		// protocolo: httpsÑ--  / httpÑ--
			.replace(/httpsÑ--/gi, "https://")
			.replace(/httpÑ--/gi, "http://")
		// separadores /p/ escritos como -p- (y variantes)
			.replace(/-p-/gi, "/p/")
			.replace(/-qr-/gi, "/qr/")
			.replace(/-public-/gi, "/public/")
			.replace(/-customers-/gi, "/customers/")
		// apóstrofes sustituyendo puntos o guiones en dominios
			.replace(/'/g, "."); // suficiente para nuestro caso (no afecta /p/)

		return s;
	},

	// UUID / URLs / payloads -> customerId
	parseCustomerIdFromQr(text) {
		const s = this.cleanScan(text);
		if (!s) return null;

		// a) UUID en cualquier parte
		const mUuid = s.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
		if (mUuid) return mUuid[0];

		// b) Payload AXIOMA
		const mAx = s.match(/AXIOMA:VISIT:CID=([0-9a-f-]{36})/i);
		if (mAx) return mAx[1];

		// c) URLs típicas
		const mPub = s.match(/\/public\/customers\/([0-9a-f-]{36})(?:[\/?]|$)/i);
		if (mPub) return mPub[1];

		const mCust = s.match(/\/customers\/([0-9a-f-]{36})(?:[\/?]|$)/i);
		if (mCust) return mCust[1];

		// d) nada → podría ser token
		return null;
	},

	// ----- (Opcional) Resolver TOKEN -> customerId vía CustomerQrToken -----
	async resolveCustomerIdByTokenMaybe(text) {
		const raw = this.cleanScan(text);
		if (!raw) return null;

		if (Utils.isUuid(raw)) return raw;

		let token = null;

		// ?token=XYZ
		let m = raw.match(/[?&]token=([\w\-]+)/i);
		if (m) token = m[1];

		// /qr/XYZ
		if (!token) {
			m = raw.match(/\/qr\/([\w\-]+)/i);
			if (m) token = m[1];
		}

		// /p/XYZ
		if (!token) {
			m = raw.match(/\/p\/([\w\-]+)/i);
			if (m) token = m[1];
		}

		// **nuevo**: también acepta -p-XYZ por mapeo raro del lector
		if (!token) {
			m = raw.match(/[-\/]p[-\/]([\w\-]{6,})/i);
			if (m) token = m[1];
		}

		token = token || raw;
		if (!token) return null;

		try {
			const businessId = appsmith.store?.session?.businessId || appsmith.store?.businessId;
			const r = await q_qr_token_resolve.run({ token, businessId });
			const cid = r?.[0]?.customerid || r?.[0]?.customerId || null;
			return Utils.isUuid(cid) ? cid : null;
		} catch (e) {
			console.warn("resolveCustomerIdByTokenMaybe error:", e);
			return null;
		}
	},

	// ----- Añadir visita manual (mantienes tu flujo actual) -----
	async manual() {
		const customerId =
					appsmith.store.selCustomerId || appsmith.store.editingCustomer?.id;

		if (!Utils.isUuid(customerId)) {
			showAlert("Selecciona un cliente válido.", "warning");
			return;
		}

		const isAdminLike = Roles.isAdminLike();
		const notes = this.motive();

		// 🔒 Bloqueo VIP (solo para STAFF/BARBER)
		const canVisit = await VIP.mustBeActiveBeforeVisit(customerId);
		if (!canVisit) return;

		try {
			const res = await q_visit_code_qr.run({
				customerId,
				notes,
				isAdminLike,
				// 👇 trazabilidad (nuevo)
				createdBy: appsmith.user?.email || "",
				createdByRole: appsmith.store?.session?.role || appsmith.store?.role || "",
				createdById: appsmith.store?.session?.userId || null,
			});

			const ok =
						(Array.isArray(res) && (res[0]?.inserted === true || res[0]?.ok === true)) ||
						(res?.inserted === true || res?.ok === true);

			if (!ok) {
				showAlert("No se pudo registrar: regla de 48 h activa.", "warning");
				return;
			}

			// refresco opcional de "visitas de hoy"
			if (typeof q_visitas_hoy?.run === "function") {
				try { await q_visitas_hoy.run(); } catch (_) {}
			}

			await this._refreshIfSelected(customerId);
			closeModal?.(Modal_add_visit?.name);
			showAlert("Visita registrada correctamente.", "success");
		} catch (e) {
			console.error("VisitAdd.manual error:", e);
			showAlert(e?.message || "No se pudo registrar la visita.", "error");
		}
	},

	// ----- Registrar visita por QR (desde Scanner o Input) -----
	async fromQr(scannedText) {
		// normaliza y protege vacíos
		const scan = this.cleanScan(scannedText);
		if (!scan) {
			showAlert("Lectura vacía. Intenta de nuevo.", "warning");
			return;
		}

		// ⛔️ Debounce anti-doble disparo (misma lectura en < 1.5s)
		const now = Date.now();
		const lastTs = appsmith.store._lastScanTs || 0;
		const lastText = appsmith.store._lastScanText || "";
		if (scan === String(lastText) && (now - lastTs) < 1500) return;
		await storeValue("_lastScanTs", now);
		await storeValue("_lastScanText", scan);

		// 1) intentar UUID / patrones
		let cid = this.parseCustomerIdFromQr(scan);

		// 2) si no hay UUID, intenta resolver por token (CustomerQrToken)
		if (!Utils.isUuid(cid)) {
			cid = await this.resolveCustomerIdByTokenMaybe(scan);
		}

		if (!Utils.isUuid(cid)) {
			showAlert("Código QR inválido o no reconocido.", "warning");
			await storeValue("_lastScanOk", false);
			return;
		}

		const isAdminLike = Roles.isAdminLike();

		// 🔒 Bloqueo VIP (si aplica a STAFF/BARBER)
		const canVisit = await VIP.mustBeActiveBeforeVisit(cid);
		if (!canVisit) {
			await storeValue("_lastScanOk", false);
			return;
		}

		try {
			const res = await q_visit_code_qr.run({
				customerId: cid,
				notes: "Visita por QR",
				isAdminLike,
				// 👇 trazabilidad (nuevo)
				createdBy: appsmith.user?.email || "",
				createdByRole: appsmith.store?.session?.role || appsmith.store?.role || "",
				createdById: appsmith.store?.session?.userId || null,
			});

			const ok =
						(Array.isArray(res) && (res[0]?.inserted === true || res[0]?.ok === true)) ||
						(res?.inserted === true || res?.ok === true);

			if (!ok) {
				showAlert("No se pudo registrar: regla de 48 h activa.", "warning");
				await storeValue("_lastScanOk", false);
				return;
			}

			// refresco opcional de "visitas de hoy"
			if (typeof q_visitas_hoy?.run === "function") {
				try { await q_visitas_hoy.run(); } catch (_) {}
			}

			await this._refreshIfSelected(cid);
			closeModal?.(Modal_add_visit?.name);
			showAlert("Visita registrada mediante QR.", "success");
			await storeValue("_lastScanOk", true);
		} catch (e) {
			console.error("VisitAdd.fromQr error:", e);
			showAlert(e?.message || "No se pudo registrar la visita por QR.", "error");
			await storeValue("_lastScanOk", false);
		}
	},

	// ----- Helper: refresca datos si el cliente abierto coincide -----
	async _refreshIfSelected(cid) {
		const selected =
					appsmith.store.selCustomerId || appsmith.store.editingCustomer?.id;

		if (selected === cid) {
			await Promise.all([
				q_cliente_detalle.run({ id: cid }),
				q_visitas_historial.run({ customerId: cid, limit: 500, offset: 0 }),
				getClientVisitsQuery.run(),
				getFallbackVisitsCount.run(),
			]);
			await visitsLogic.processData();
			await storeValue("visits", q_visitas_historial.data || []);
		}
	},
};
