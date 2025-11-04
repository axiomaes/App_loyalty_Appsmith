export default {
	// ================== Config ==================
	CFG() {
		return {
			// SIDs de las plantillas en Twilio
			welcomeSid: "HXb06a2950296822f06a8e3bdc02c893de", // welcome_qr_es (Marketing)
			otpSid:     "HX8903c49a01fcf311ffcec50560694638", // otp_pago_bono_es (Authentication)
			vipSid:     "HX3b91ea6167d412d8eacc07312603e58a", // vip_pago_aviso_es (Utility)

			// Enviar bienvenida antes del OTP (puedes cambiarlo con store.useWelcomeFirst)
			useWelcomeFirst: !!(appsmith.store?.useWelcomeFirst ?? true),

			// Teléfono del dueño (puedes sobreescribirlo en store.ownerPhone)
			ownerE164: "+34632803533"
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

	/**
   * Envía OTP al cliente con opción de mandar bienvenida primero
   * y notifica al dueño con la plantilla Utility.
   *
   * IMPORTANTE en la acción `wa_send`:
   *   contentVariables: "{{ JSON.stringify(this.params.templateVars || {}) }}"
   */
	async sendOtpWithOptionalWelcome({ customer, code, ttlMin = 10 }) {
		const cfg = this.CFG();

		const to = this._digitsFromE164(customer?.phone);
		const name = customer?.name || "cliente";
		const business = this._bizName();

		if (!to) {
			showAlert("Teléfono inválido para WhatsApp.", "warning");
			return;
		}

		// 1) Bienvenida (opcional)
		if (cfg.useWelcomeFirst) {
			try {
				await wa_send.run({
					to, // "34XXXXXXXXX"
					contentSidOverride: cfg.welcomeSid,
					templateVars: { "1": name, "2": business } // {{1}}=nombre, {{2}}=negocio
				});
			} catch (e) {
				console.warn("welcome failed:", e);
			}
			await this._sleep(600); // ordenar llegada
		}

		// 2) OTP (Authentication)
		await wa_send.run({
			to,
			contentSidOverride: cfg.otpSid,
			templateVars: { "1": String(code || ""), "2": String(ttlMin) } // {{1}}=código, {{2}}=TTL
		});

		// 3) Aviso al dueño (Utility)
		try {
			const ownerTo = this._ownerDigits();
			if (ownerTo) {
				const planName =
							SelectPlan?.selectedOptionLabel ||
							appsmith.store?.selVipPlanName ||
							"Plan";

				const amountEur =
							(JS_BondPayHelper?._toIntEuros?.(InputImporte?.text) ??
							 Number(InputImporte?.text || 0));

				const amountLabel = this._formatEur(amountEur);
				const dateLabel = moment().format("DD/MM/YYYY");

				await wa_send.run({
					to: ownerTo,                                 // "34632803533"
					contentSidOverride: cfg.vipSid,              // vip_pago_aviso_es
					// {{1}} cliente, {{2}} bono, {{3}} importe, {{4}} fecha, {{5}} código, {{6}} ttl
					templateVars: {
						"1": String(name),
						"2": String(planName),
						"3": String(amountLabel),
						"4": String(dateLabel),
						"5": String(code || ""),
						"6": String(ttlMin)
					}
				});
			}
		} catch (e) {
			console.warn("owner notify failed:", e);
		}

		showAlert("Mensaje enviado por WhatsApp.", "success");
	}
};
