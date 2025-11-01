export default {
  // ----- Motivo de la visita -----
  motive() {
    const label = SelReason?.selectedOptionLabel || "";
    return label.trim() || "Visita por servicio";
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
      });

      const ok = Array.isArray(res) && res[0]?.inserted === true;
      if (!ok) {
        showAlert("No se pudo registrar: regla de 48 h activa.", "warning");
        return;
      }

      await this._refreshIfSelected(customerId);
      closeModal?.(Modal_add_visit?.name);
      showAlert("Visita registrada correctamente.", "success");
    } catch (e) {
      console.error("VisitAdd.manual error:", e);
      showAlert(e?.message || "No se pudo registrar la visita.", "error");
    }
  },

  // ----- Parsear QR -> intenta UUID directo o patrones comunes -----
  parseCustomerIdFromQr(text) {
    const s = String(text || "").trim();
    if (!s) return null;

    // 1) UUID puro
    const mUuid = s.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    if (mUuid) return mUuid[0];

    // 2) Patrones habituales (URLs y AXIOMA)
    const patterns = [
      /AXIOMA:VISIT:CID=([0-9a-f-]{36})/i,
      /\/customers\/([0-9a-f-]{36})(?:[\/?]|$)/i,
      /\/public\/customers\/([0-9a-f-]{36})(?:[\/?]|$)/i,
    ];
    for (const p of patterns) {
      const m = s.match(p);
      if (m) return m[1];
    }

    return null; // podría ser un token (no UUID)
  },

  // ----- (Opcional) Resolver TOKEN -> customerId vía CustomerQrToken -----
  async resolveCustomerIdByTokenMaybe(text) {
    const raw = String(text || "").trim();
    if (!raw) return null;

    // si ya es UUID, devolver directo
    if (Utils.isUuid(raw)) return raw;

    // intenta extraer token de URLs como "...?token=XYZ" o path "/qr/XYZ"
    let token = null;
    const m1 = raw.match(/[?&]token=([\w\-]+)/i);
    if (m1) token = m1[1];
    if (!token) {
      const m2 = raw.match(/\/qr\/([\w\-]+)/i);
      if (m2) token = m2[1];
    }
    // si nada de lo anterior, usa el texto completo como token
    token = token || raw;

    try {
      const r = await q_qr_token_resolve.run({ token });
      const cid = r?.[0]?.customerid || r?.[0]?.customerId || null;
      return Utils.isUuid(cid) ? cid : null;
    } catch (e) {
      console.warn("resolveCustomerIdByTokenMaybe error:", e);
      return null;
    }
  },

  // ----- Registrar visita por QR (desde Scanner o Input) -----
	async fromQr(scannedText) {
		// ⛔️ Debounce anti-doble disparo (misma lectura en < 1.5s)
		const now = Date.now();
		const lastTs   = appsmith.store._lastScanTs || 0;
		const lastText = appsmith.store._lastScanText || "";
		if (scannedText && String(scannedText) === String(lastText) && (now - lastTs) < 1500) {
			return; // ignorar repetido inmediato
		}
		await storeValue("_lastScanTs", now);
		await storeValue("_lastScanText", String(scannedText || ""));

		// 1) intentar UUID directo / patrones
		let cid = this.parseCustomerIdFromQr(scannedText);

		// 2) si no hay UUID, intenta resolver por token (CustomerQrToken)
		if (!Utils.isUuid(cid)) {
			cid = await this.resolveCustomerIdByTokenMaybe(scannedText);
		}

		if (!Utils.isUuid(cid)) {
			showAlert("Código QR inválido o no reconocido.", "warning");
			return;
		}

		const isAdminLike = Roles.isAdminLike();

		// 🔒 Bloqueo VIP (si aplica a STAFF/BARBER)
		const canVisit = await VIP.mustBeActiveBeforeVisit(cid);
		if (!canVisit) return;

		try {
			const res = await q_visit_code_qr.run({
				customerId: cid,
				notes: "Visita por QR",
				isAdminLike,
			});

			const ok = Array.isArray(res) && res[0]?.inserted === true;
			if (!ok) {
				showAlert("No se pudo registrar: regla de 48 h activa.", "warning");
				return;
			}

			await this._refreshIfSelected(cid);
			closeModal?.(Modal_add_visit?.name);
			showAlert("Visita registrada mediante QR.", "success");

			// ✅ Feedback opcional para el dashboard/kiosko
			await storeValue("_lastScanOk", true);
		} catch (e) {
			console.error("VisitAdd.fromQr error:", e);
			showAlert(e?.message || "No se pudo registrar la visita por QR.", "error");
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
