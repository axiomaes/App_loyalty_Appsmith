export default {
	// ================== Config ==================
	CFG() {
		return {
			// SIDs de las plantillas en Twilio
			vipSid: "HX3b91ea6167d412d8eacc07312603e58a", // vip_pago_aviso_es (Utility)

			// Fallback visible SOLO para compat (no se usa en envío si hay store)
			ownerFallbackE164: "+34632803533"
		};
	},

	// ================ Utils =====================
	_digits(s) { return String(s || "").replace(/\D/g, ""); },

	// Lee primero de store; si viene vacío, corto con error (evita fallback silencioso)
	_ownerDigitsSafe() {
		const raw = appsmith.store?.ownerPhone || "";
		const digits = this._digits(raw);
		if (!digits) {
			throw new Error("ownerPhone vacío en store. Ejecuta JS_WaSettings.load() y guarda el número en Administración.");
		}
		return digits;
	},

	// Mantengo el antiguo por compat (no se usa para enviar)
	_ownerDigits() {
		const raw = appsmith.store?.ownerPhone || this.CFG().ownerFallbackE164;
		return this._digits(raw);
	},

	_clientDigits() {
		// Toma el móvil del cliente del formulario/detalle
		const raw =
					PhoneInput?.text ||
					appsmith.store?.editingCustomer?.phone ||
					"";
		return this._digits(raw);
	},

	_formatEur(val) {
		const n = Number(val ?? 0);
		return `€ ${Math.round(n)}`;
	},

	_sanitizeVar(v, { allowEmpty = false } = {}) {
		let s = String(v ?? "");
		s = s.replace(/[\r\n\t]/g, " ").replace(/ {5,}/g, "    ").trim();
		if (!allowEmpty && s.length === 0) throw new Error("Variable vacía para plantilla");
		return s;
	},

	_varsVip({ customer, code, ttlMin }) {
		const name =
					customer?.name ||
					appsmith.store?.editingCustomer?.name ||
					"Cliente";

		const planName =
					SelectPlan?.selectedOptionLabel ||
					appsmith.store?.selVipPlanName ||
					"Plan";

		const amountEur =
					(JS_BondPayHelper?._toIntEuros?.(InputImporte?.text) ??
					 Number(InputImporte?.text || 0));

		const amountLabel = this._formatEur(amountEur);
		const dateLabel   = moment().format("DD/MM/YYYY");

		// {{1}} cliente, {{2}} bono, {{3}} importe, {{4}} fecha, {{5}} código, {{6}} ttl
		return {
			"1": this._sanitizeVar(name),
			"2": this._sanitizeVar(planName),
			"3": this._sanitizeVar(amountLabel),
			"4": this._sanitizeVar(dateLabel),
			"5": this._sanitizeVar(code, { allowEmpty: true }),
			"6": this._sanitizeVar(ttlMin)
		};
	},

	// ================== Envío ==================
	/**
   * Enviar aviso VIP.
   * - Siempre envía al DUEÑO (número leído de la mini-tabla a través del store).
   * - Si wa_mode === "both" y wa_bi_approved === true, también envía al CLIENTE.
   *   (mismo contenido/plantilla).
   */
	async sendOtpWithOptionalWelcome({ customer, code, ttlMin = 10 }) {
		try {
			// Asegura que la config esté en store (por si llaman esto muy pronto)
			try { await JS_WaSettings.load(); } catch (_) {}

			const vars = this._varsVip({ customer, code, ttlMin });
			const sid  = this.CFG().vipSid;

			// 1) Dueño (siempre, usando ownerDigitsSafe)
			const ownerTo = this._ownerDigitsSafe();
			const respOwner = await wa_send.run({
				to: ownerTo,                     // dígitos (el action añade whatsapp:+)
				contentSidOverride: sid,
				contentLanguage: "es",
				templateVars: vars
			});

			// Log dueño
			try {
				await JS_WaLog.logSend({
					to: ownerTo,
					sid: respOwner?.sid,
					category: "utility",
					template: sid
				});
			} catch (e) { console.warn("log owner fail:", e); }

			// 2) Cliente (solo si BI aprobado y modo both)
			const mode = appsmith.store?.wa_mode || "vip";
			const biOk = appsmith.store?.wa_bi_approved === true;
			if (mode === "both" && biOk) {
				const clientTo = this._clientDigits();
				if (clientTo) {
					const respCli = await wa_send.run({
						to: clientTo,
						contentSidOverride: sid,
						contentLanguage: "es",
						templateVars: vars
					});

					// Log cliente
					try {
						await JS_WaLog.logSend({
							to: clientTo,
							sid: respCli?.sid,
							category: "utility",
							template: sid
						});
					} catch (e) { console.warn("log client fail:", e); }
				}
			}

			showAlert("Aviso enviado por WhatsApp.", "success");
		} catch (e) {
			console.warn("vip notify failed:", e);
			showAlert("No se pudo enviar el aviso por WhatsApp.", "error");
		}
	}
};
