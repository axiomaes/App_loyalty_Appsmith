export default {
	DEDUP_MS: 2500,

	// --- normaliza, dedupe y extrae token del final de la URL ---
	_normalize(ev) {
		if (!ev) return null;
		let msg = ev.data;
		if (typeof msg === "string") {
			try { msg = JSON.parse(msg); } catch { msg = { type:"QR_DETECTED", payload:{ text: msg } }; }
		}
		return (msg && typeof msg === "object") ? msg : null;
	},
	_dedupe(raw) {
		const now = Date.now();
		const last = appsmith.store?.lastQRProcessed || "";
		const at   = Number(appsmith.store?.lastQRAt || 0);
		const dup  = raw === last && (now - at) < this.DEDUP_MS;
		if (!dup) {
			storeValue("lastQRProcessed", raw, false);
			storeValue("lastQRAt", now, false);
		}
		return !dup;
	},
	_extractToken(text) {
		if (!text) return "";
		const t = String(text).trim();
		if (!/[\/\s]/.test(t) && t.length >= 6 && t.length <= 64) return t;
		try {
			const u = new URL(t);
			const p = (u.pathname || "").replace(/\/+$/,"");
			return p.split("/").filter(Boolean).pop() || "";
		} catch {
			const noHash  = t.split("#")[0];
			const noQuery = noHash.split("?")[0];
			return noQuery.split("/").filter(Boolean).pop() || "";
		}
	},

	// --- resuelve token -> cliente (ajusta a tu query real) ---
	async resolveCustomer(token) {
		// Esperamos que tengas una query como esta:
		// q_customer_by_token.run({ token }) → [{ id, nombre, telefono, ... }]
		if (typeof q_customer_by_token?.run !== "function") return null;
		const res = await q_customer_by_token.run({ token });
		const row = Array.isArray(res) ? res[0] : res;
		if (!row) return null;
		return {
			id: row.id || row.customer_id || row.customerId,
			name: row.nombre || row.fullname || row.name || "",
			phone: row.telefono || row.phone || row.whatsapp || ""
		};
	},

	// --- registra la visita y refresca la UI ---
	async _registerVisitAndShow(customerId) {
		// 1) Insertar visita (usa tu API o query)
		//   a) vía API Nest:
		// await q_add_visit_api.run({ customerId });  // si ya la tienes
		//   b) o query SQL directa:
		if (typeof q_add_visit?.run === "function") {
			await q_add_visit.run({ customerId });
		}

		// 2) Refrescar historial/detalle en store (reusa tu handler existente)
		if (typeof CustomerDetailHanldler?.openDetail === "function") {
			await CustomerDetailHanldler.openDetail({ id: customerId });
		} else {
			// fallback: ejecuta queries básicas si no quieres abrir modal
			await Promise.allSettled([
				q_cliente_detalle?.run?.({ id: customerId }),
				q_visitas_historial?.run?.({ customerId, limit: 50, offset: 0 })
			]);
			const det = Array.isArray(q_cliente_detalle?.data) ? q_cliente_detalle.data[0] : (q_cliente_detalle?.data || {});
			await storeValue("clienteDetalle", det);
			await storeValue("selCustomerId", customerId);
		}

		// 3) (Opcional) Cambia a la sub-sección que muestra la tarjeta, si tienes tabs internos
		// TabsQR.setSelectedTab("Clientes"); // ajusta al nombre de tu tab si aplica
	},

	// --- entry point: llamado desde onMessageReceived del Iframe ---
	async onQrMessage(ev) {
		try {
			const msg = this._normalize(ev);
			if (!msg || msg.type !== "QR_DETECTED") return;

			const raw = (msg.payload?.text || msg.text || "").trim();
			if (!raw) return;
			if (!this._dedupe(raw)) return;

			const token = this._extractToken(raw);
			if (!token) { showAlert("QR no reconocido.", "warning"); return; }

			await storeValue("lastQR", raw, false);
			await storeValue("lastQRToken", token, false);

			// 1) token → cliente
			const customer = await this.resolveCustomer(token);
			if (!customer?.id) { showAlert("Cliente no encontrado para este QR.", "warning"); return; }

			await storeValue("selCustomerId", customer.id, false);
			await storeValue("lastQRClientName", customer.name || "", false);

			// 2) registrar e inmediatamente refrescar tarjeta
			await this._registerVisitAndShow(customer.id);

			showAlert(`Visita registrada para ${customer.name || "cliente"}.`, "success");
			return { ok: true, customerId: customer.id };
		} catch (e) {
			console.error("QR handler error:", e);
			showAlert("Error procesando el QR.", "error");
			return { ok: false, error: e?.message || String(e) };
		}
	}
};
