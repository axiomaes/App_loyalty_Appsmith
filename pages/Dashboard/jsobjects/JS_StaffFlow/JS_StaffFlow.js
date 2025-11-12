export default {
	_maskPhone(p) {
		const s = String(p || "").replace(/\s+/g, "");
		if (!s) return "—";
		return "••• •• •• " + s.slice(-3);
	},

	async onQr(scanned) {
		const cid = String(scanned || "").trim();
		if (!Utils?.isUuid?.(cid)) {
			showAlert("QR inválido: no es un UUID.", "warning");
			return;
		}

		const isAdminLike = !!(Roles?.isAdminLike && Roles.isAdminLike());

		try {
			// 1) Insertar visita con tu query existente
			const res = await q_visit_code_qr.run({
				customerId: cid,
				notes: "Visita por QR (STAFF)",
				isAdminLike,
			});
			const r = Array.isArray(res) ? res[0] : res;
			if (!(r?.allowed && r?.inserted)) {
				showAlert("No se registró (regla de 48h activa).", "warning");
				return;
			}

			// 2) Cargar detalle + historial del cliente (para pintar tarjeta)
			const [detail] = await Promise.all([
				q_cliente_detalle.run({ id: cid }),                       // debe devolver planName/tag si los tienes
				q_visitas_historial.run({ customerId: cid, limit: 500, offset: 0 }),
			]);
			const rows = Array.isArray(q_visitas_historial.data) ? q_visitas_historial.data : [];

			// 3) Construir modelo de tarjeta con tu helper existente
			const model = JS_VisitsFilter.processDataFrom(rows, detail || {});

			// 4) Enviar modelo al Custom Widget de la tarjeta
			if (typeof CustomCard?.setModel === "function") {
				await CustomCard.setModel(model);
			}

			// 5) Cabecera con nombre + teléfono enmascarado (si usas un Text)
			if (typeof TxtCliente !== "undefined") {
				const name  = detail?.name || "Cliente";
				const phone = this._maskPhone(detail?.phone);
				try { TxtCliente.text = `${name} • ${phone}`; } catch (_) {}
			}

			// 6) Refrescar tabla "visitas de hoy" (para caja tipo supermercado)
			const bid = appsmith.store?.businessId;
			if (typeof q_visitas_hoy?.run === "function") {
				await q_visitas_hoy.run({ bid });
			}

			showAlert("Visita registrada ✅", "success");
		} catch (e) {
			console.error("STAFF onQr error:", e);
			showAlert(e?.message || "No se pudo registrar la visita.", "error");
		}
	},
};
