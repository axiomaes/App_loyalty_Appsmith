export default {
	// ================== Config ==================
	CFG() {
		return {
			// SIDs de las plantillas en Twilio
			welcomeSid: "HXb06a2950296822f06a8e3bdc02c893de", // (no usado por ahora)
			otpSid:     "HX8903c49a01fcf311ffcec50560694638", // (no usado por ahora)
			vipSid:     "HX3b91ea6167d412d8eacc07312603e58a", // vip_pago_aviso_es (Utility)

			// Teléfono del dueño (puedes sobreescribirlo en store.ownerPhone)
			ownerE164: "+34682686605"
		};
	},

	// ================ Utils =====================
	_digitsFromE164(phone) {
		// La acción wa_send espera dígitos (sin '+')
		return String(phone || "").replace(/\D/g, "");
	},

	_bizName() {
		try {
			return (
				(typeof Auth?.businessName === "function" && Auth.businessName()) ||
				appsmith.store?.businessName ||
				"Tu barbería"
			);
		} catch {
			return "Tu barbería";
		}
	},

	_ownerDigits() {
		const cfg = this.CFG();
		const raw = appsmith.store?.ownerPhone || cfg.ownerE164;
		return this._digitsFromE164(raw);
	},

	_formatEur(val) {
		const n = Number(val ?? 0);
		// Mostramos "€ 20" (entero), consistente con _toIntEuros
		return `€ ${Math.round(n)}`;
	},

	_sleep(ms = 500) {
		return new Promise((r) => setTimeout(r, ms));
	},

	// Sanea variables para Twilio (sin \r \n \t, sin rachas >4 espacios, sin vacíos)
	_sanitizeVar(v, { allowEmpty = false } = {}) {
		let s = String(v ?? "");
		s = s.replace(/[\r\n\t]/g, " ").replace(/ {5,}/g, "    ").trim();
		if (!allowEmpty && s.length === 0) {
			throw new Error("Variable vacía para plantilla");
		}
		return s;
	},

	/**
   * Enviar SOLO el aviso al dueño (vip_pago_aviso_es).
   * No manda bienvenida ni OTP al cliente mientras las plantillas no estén aprobadas.
   *
   * IMPORTANTE en la acción `wa_send`:
   *  - contentSidOverride: si no se pasa, usa por defecto el VIP (HX3b9...e58a)
   *  - contentVariables: debe sanear y hacer JSON.stringify (ya lo dejaste listo)
   */
	async sendOtpWithOptionalWelcome({ customer, code, ttlMin = 10 }) {
		try {
			const ownerTo = this._ownerDigits();
			if (!ownerTo) {
				showAlert("No hay teléfono del dueño configurado.", "warning");
				return;
			}

			const name = customer?.name || "Cliente";

			const planName =
						SelectPlan?.selectedOptionLabel ||
						appsmith.store?.selVipPlanName ||
						"Plan";

			const amountEur =
						(JS_BondPayHelper?._toIntEuros?.(InputImporte?.text) ??
						 Number(InputImporte?.text || 0));

			const amountLabel = this._formatEur(amountEur);
			const dateLabel   = moment().format("DD/MM/YYYY");

			// Saneamos lo que enviamos (opcional, ya se sanea también en wa_send)
			const vars = {
				// {{1}} cliente, {{2}} bono, {{3}} importe, {{4}} fecha, {{5}} código, {{6}} ttl
				"1": this._sanitizeVar(name),
				"2": this._sanitizeVar(planName),
				"3": this._sanitizeVar(amountLabel),
				"4": this._sanitizeVar(dateLabel),
				"5": this._sanitizeVar(code),          // lanza si vacío; cambia {allowEmpty:true} si quieres permitirlo
				"6": this._sanitizeVar(ttlMin)
			};

			await wa_send.run({
				to: ownerTo,           // "34632803533"
				// NO enviamos contentSidOverride -> la acción usa vipSid por defecto
				templateVars: vars
			});

			showAlert("Aviso enviado al dueño por WhatsApp.", "success");
		} catch (e) {
			console.warn("owner notify failed:", e);
			showAlert("No se pudo enviar el aviso al dueño.", "error");
		}
	}
};
