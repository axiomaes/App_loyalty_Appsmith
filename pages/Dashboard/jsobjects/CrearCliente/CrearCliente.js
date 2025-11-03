export default {
	// flag interno para evitar dobles envíos
	_busy: false,

	// ==== UTILIDADES ===========================================================
	_onlyDigits(s) { return (s || "").replace(/\D/g, ""); },

	_normalizePhoneES(raw) {
		const d = this._onlyDigits(raw);

		if (!d) return null;

		// ya viene como 34XXXXXXXXX
		if (d.startsWith("34") && d.length >= 11) {
			return `+34${d.slice(-9)}`;
		}

		// 9 dígitos móviles ES
		const nine = d.slice(-9);
		if (/^[6789]\d{8}$/.test(nine)) return `+34${nine}`;

		// fallback: si tiene más de 9 dígitos, toma los últimos 9 como móvil ES
		if (d.length > 9) return `+34${d.slice(-9)}`;

		return null;
	},

	_isValidESPhone(raw) {
		const nine = this._onlyDigits(raw).slice(-9);
		return nine.length === 9 && /^[6789]\d{8}$/.test(nine);
	},

	_normalizeEmail(s) {
		const v = (s || "").trim().toLowerCase();
		return v && v.includes("@") ? v : null;
	},

	_normalizeNotes(s) {
		const v = (s || "").trim();
		return v || null;
	},

	_normalizeName(s) {
		return (s || "").trim();
	},

	// ► IMPORTANTE: devolver 'YYYY-MM-DD' (DATE) y no ISO con tiempo
	_normalizeBirthday(d) {
		if (!d) return null;
		try {
			const date = (d instanceof Date) ? d : new Date(d);
			if (isNaN(date.getTime())) return null;

			const yyyy = date.getFullYear();
			const mm = String(date.getMonth() + 1).padStart(2, "0");
			const dd = String(date.getDate()).padStart(2, "0");
			return `${yyyy}-${mm}-${dd}`; // ← tipo DATE compatible
		} catch {
			return null;
		}
	},

	// ==== ACCIÓN PRINCIPAL =====================================================
	async crear() {
		if (this._busy) return;
		this._busy = true;

		try {
			const name  = this._normalizeName(InputNombre.text);
			const raw   = (InputTelefono.text || "").trim();
			const phone = this._normalizePhoneES(raw);
			const email = this._normalizeEmail(InputEmail.text);
			const notes = this._normalizeNotes(InputNotas.text);
			const birthday = this._normalizeBirthday(DateNacimiento.selectedDate);
			const tag   = SelectTag.selectedOptionValue || null;

			// 🧩 Validaciones
			if (!name) { showAlert("El nombre es obligatorio.", "warning"); return; }
			if (!raw || !phone) { showAlert("El teléfono es obligatorio.", "warning"); return; }
			if (!this._isValidESPhone(raw)) {
				showAlert("Teléfono inválido: debe tener 9 dígitos válidos en España.", "warning");
				return;
			}

			const bid = Auth.businessId && Auth.businessId();
			if (!bid) { showAlert("Negocio inválido en la sesión. Vuelve a iniciar sesión.", "error"); return; }

			// 🚀 Ejecuta query de inserción
			const res = await q_crear_cliente.run({
				name,
				phone,
				email,
				notes,
				birthday, // ahora va como 'YYYY-MM-DD'
				tag
				// businessId: bid  // si tu SQL lo toma del JWT/store, no hace falta
			});

			const r = res?.[0];

			if (!r) { showAlert("No se pudo crear el cliente (respuesta vacía).", "error"); return; }
			if (!r.has_bid) { showAlert("Negocio inválido. Vuelve a iniciar sesión.", "error"); return; }

			if (r.is_duplicate) {
				showAlert("Ese móvil ya existe en este negocio.", "warning");
				if (r.duplicate_id && typeof q_cliente_detalle?.run === "function") {
					try {
						await q_cliente_detalle.run({ id: r.duplicate_id });
						if (typeof q_visitas_historial?.run === "function") {
							await q_visitas_historial.run({ customerId: r.duplicate_id, limit: 50, offset: 0 });
						}
					} catch {}
				}
				return;
			}

			if (!r.inserted) {
				showAlert("No se pudo crear el cliente (condición no satisfecha).", "warning");
				return;
			}

			// ✅ Éxito
			showAlert("Cliente creado con éxito.", "success");

			if (r.row) await storeValue("cliente_creado", r.row);
			if (r.qr_payload) await storeValue("cliente_qr_payload", r.qr_payload);

			// Cierra modal y refresca listado
			try {
				if (typeof closeModal === "function" && Modal_crear_cliente?.name) {
					closeModal(Modal_crear_cliente.name);
				}
			} catch {}

			if (typeof q_clientes_listado?.run === "function") {
				await q_clientes_listado.run({ bid });
			}

		} catch (e) {
			const msg = e?.message || "Error inesperado al crear el cliente.";
			showAlert(msg, "error");
			console.error("crear_cliente_error:", e);
		} finally {
			this._busy = false;
		}
	}
};
