export default {
	// ===== Constantes =====
	_WELCOME_SID: "HXb06a2950296822f06a8e3bdc02c893de",   // welcome_qr_es (no usada aquí)
	_OTP_SID:     "HX8903c49a01fcf311ffcec50560694638",   // otp_pago_bono_es (modo clásico)
	_VIP_SID:     "HX3b91ea6167d412d8eacc07312603e58a",   // vip_pago_aviso_es (Utility)
	_OWNER_PHONE: "+34682686605",                          // número del dueño (E.164)

	// Switch en store: true => SOLO dueñ@ con vip_pago_aviso_es
	_activeMode() {
		return appsmith.store?.wa_useVipOnly === true;
	},

	// ===== Utils =====
	_bizId() {
		try {
			return (typeof Auth?.businessId === "function" && Auth.businessId())
			|| appsmith.store?.businessId
			|| null;
		} catch {
			return appsmith.store?.businessId || null;
		}
	},

	_normalizeE164(raw = "") {
		const d = String(raw || "").replace(/\D+/g, "");
		if (!d) return "";
		if (d.startsWith("00")) return `+${d.slice(2)}`;
		if (d.startsWith("+")) return `+${d.replace(/^\++/, "")}`;
		if (/^[6789]\d{8}$/.test(d)) return `+34${d}`;
		if (d.startsWith("34") && d.length >= 11) return `+34${d.slice(-9)}`;
		return `+${d}`;
	},

	// <- NUEVO: fuerza "dígitos" para wa_send (evita confusiones)
	_digits(e164) { return String(e164 || "").replace(/\D/g, ""); },

	_formatEur(value) {
		const n = Number(value || 0);
		return n.toLocaleString("es-ES", { style: "currency", currency: "EUR" });
	},

	_buildOtpVars(code, ttlMin) {
		return { "1": String(code || ""), "2": String(ttlMin || 10) };
	},

	_buildVipVars({ name, planName, amountLabel, dateLabel, code, ttlMin }) {
		// vip_pago_aviso_es: {{1}} cliente, {{2}} bono, {{3}} importe, {{4}} fecha, {{5}} código, {{6}} ttl
		return {
			"1": String(name || "Cliente"),
			"2": String(planName || "Plan"),
			"3": String(amountLabel || "€ 0"),
			"4": String(dateLabel || ""),
			"5": String(code || ""),
			"6": String(ttlMin || 10)
		};
	},

	_buildOtpVarsForOtpTemplate({ name, business, code, ttlMin }) {
		// Por si vuelves a OTP clásico en el futuro
		return {
			"1": String(name || "cliente"),
			"2": String(business || "Tu barbería"),
			"3": String(code || ""),
			"4": String(ttlMin || 10)
		};
	},

	// ===== Estado OTP =====
	async clearOtp() {
		await storeValue("otp_phone", null);
		await storeValue("otp_hash", null);
		await storeValue("otp_code_plain", null);
		await storeValue("otp_ttl_min", null);
		await storeValue("otp_verified", false);
	},

	async _startOtpFor(toE164, ttlMin = 10) {
		const codeObj = await OTPUtils.startOtp({
			businessId: this._bizId(),
			phone: toE164,
			ttlMin
		});
		await storeValue("otp_phone", toE164);
		await storeValue("otp_code_plain", codeObj.code);   // usado en el aviso VIP
		await storeValue("otp_hash", codeObj.codeHash);
		await storeValue("otp_ttl_min", ttlMin);
		await storeValue("otp_verified", false);
		return codeObj;
	},

	// ===== WhatsApp (wrappers) =====
	async _sendTemplate({ to, sid, vars = {} }) {
		if (!to) throw new Error("Destino vacío.");
		if (!sid) throw new Error("SID vacío.");
		await wa_send.run({ to, contentSidOverride: sid, templateVars: vars });
	},

	async _sendText({ to, body }) {
		if (!to) throw new Error("Destino vacío.");
		if (!body) throw new Error("Mensaje vacío.");
		await wa_send.run({ to, body });
	},

	async _canSendFreeform(toE164) {
		try {
			if (!wa_status?.run) return false;
			const res = await wa_status.run({ to: toE164 });
			return !!(res && (res.canFreeform || res.windowOpen || res.within24h));
		} catch {
			return false;
		}
	},

	// ===== Envío VIP SOLO al propietario (plantilla Utility) =====
	async _sendVipOnlyToOwner({ code, ttlMin }) {
		// forzar SIEMPRE el número del dueño en dígitos (lo que espera wa_send)
		const toDigits = this._digits(this._OWNER_PHONE);
		if (!toDigits) {
			showAlert("Teléfono del dueño no válido.", "warning");
			return;
		}

		const customer    = appsmith.store?.editingCustomer || {};
		const name        = customer.name || "Cliente";
		const planName    = SelectPlan?.selectedOptionLabel || appsmith.store?.selVipPlanName || "Plan";
		const amount      = (JS_BondPayHelper?._toIntEuros?.(InputImporte?.text) ?? Number(InputImporte?.text || 0));
		const amountLabel = this._formatEur(amount);
		const dateLabel   = moment().format("DD/MM/YYYY");

		const vars = this._buildVipVars({ name, planName, amountLabel, dateLabel, code, ttlMin });

		// PASAR explícitamente el SID de la plantilla VIP
		await wa_send.run({
			to: toDigits,                        // e.g. "34632803533"
			contentSidOverride: this._VIP_SID,   // vip_pago_aviso_es
			templateVars: vars
		});

		try { await storeValue('debug_last_wa_to', toDigits); } catch {}
		showAlert("📩 Aviso VIP enviado al propietario.", "success");
	},

	// ===== Flujo actual: OTP al dueño O solo VIP según switch =====
	async sendOtpToOwner({ ttlMin = 10 } = {}) {
		const toOwner = this._normalizeE164(this._OWNER_PHONE);
		if (!toOwner) { showAlert("Teléfono del dueño no válido.", "warning"); return; }

		// MODO VIP-ONLY activo: solo plantilla VIP al dueño (sin freeform)
		if (this._activeMode()) {
			const { code, ttlMin: t } = await this._startOtpFor(toOwner, ttlMin);
			await this._sendVipOnlyToOwner({ code, ttlMin: t });
			return;
		}

		// MODO CLÁSICO (si lo necesitas): OTP +, opcionalmente, resumen freeform
		const { code, ttlMin: t } = await this._startOtpFor(toOwner, ttlMin);

		// 1) OTP con plantilla
		await this._sendTemplate({
			to: this._digits(toOwner),
			sid: this._OTP_SID,
			vars: this._buildOtpVars(code, t)
		});
		showAlert("📩 OTP enviado al propietario.", "info");

		// 2) (opcional) resumen en texto libre SOLO si la ventana está abierta
		const canFreeform = await this._canSendFreeform(toOwner);
		if (!canFreeform) {
			console.log("ℹ️ Resumen NO enviado: fuera de la ventana de 24h.");
			return;
		}

		const customer = appsmith.store?.editingCustomer || {};
		const planName = SelectPlan?.selectedOptionLabel || "Sin plan";
		const importe  = this._formatEur(InputImporte?.text || 0);
		const fecha    = moment().format("DD/MM/YYYY");

		const msg =
					`💈 *Nuevo pago VIP registrado*\n` +
					`👤 Cliente: *${customer.name || "Desconocido"}*\n` +
					`🎟 Bono: *${planName}*\n` +
					`💶 Importe: *${importe}*\n` +
					`📅 Fecha: ${fecha}\n` +
					`🔢 Código: *${code}*\n` +
					`⏰ Válido por ${t} minutos.`;

		await this._sendText({ to: this._digits(toOwner), body: msg });
		showAlert("🧾 Resumen del pago enviado al propietario.", "success");
	},

	// ===== Abrir modal (carga cliente correcto + reset campos) =====
	async openFromDetail(customerId) {
		try {
			// 1) Resolver ID del cliente
			const id =
						customerId ||
						appsmith.store?.selCustomerId ||
						Listado_clientes?.selectedRow?.id ||
						Listado_clientes?.triggeredRow?.id;

			if (!id) { showAlert("No se pudo determinar el ID del cliente.", "warning"); return; }

			// 2) Reset OTP y selección de plan
			await this.clearOtp();
			await storeValue("selVipPlanName", null);
			await storeValue("selVipPlanId", null);

			// 3) Cargar detalle FRESCO
			const detRes = await q_cliente_detalle.run({ id });
			const det    = Array.isArray(detRes) ? (detRes[0] || {}) : (detRes || {});
			if (!det?.id) { showAlert("No se pudo cargar el detalle del cliente.", "error"); return; }

			// 4) Guardar como fuente única para el modal
			await storeValue("editingCustomer", det);
			await storeValue("selCustomerId", det.id);

			// 5) Reset de widgets del modal (best-effort)
			try { InputPeriodo?.setValue?.(moment().format("YYYY-MM")); } catch {}
			try { PhoneInput?.setValue?.(this._normalizeE164(det.phone || "")); } catch {}
			try { InputImporte?.setValue?.("0"); } catch {}
			try { InputNotas?.setValue?.(""); } catch {}
			try { InputNotasPago?.setValue?.(""); } catch {}
			try { InputOtp?.setValue?.(""); } catch {}
			try { SelectPlan?.setSelectedOption?.(null); } catch {}

			// 6) Abrir modal
			await showModal(Modal_pago_vip.name);
		} catch (e) {
			console.error("openFromDetail error:", e);
			showAlert("No se pudo abrir el pago VIP.", "error");
		}
	},

	// ===== Verificar / Guardar =====
	async verifyOtp(inputCode) {
		const hash = appsmith.store?.otp_hash;
		if (!hash) { showAlert("No hay OTP generado.", "warning"); return false; }

		const ok = await OTPUtils.checkOtp(String(inputCode || ""), hash);
		if (!ok) { showAlert("Código inválido.", "error"); return false; }

		try {
			await JS_BondPayHelper.paySelected();
			await storeValue("otp_verified", true);

			const id = appsmith.store?.selCustomerId || appsmith.store?.editingCustomer?.id;
			if (id) {
				await q_cliente_detalle.run({ id });
				await q_visitas_historial.run({
					customerId: id,
					limit: Table_visitas?.pageSize || 50,
					offset: 0
				});
			}

			showAlert("💶 Pago registrado correctamente.", "success");
			// opcional: await closeModal(Modal_pago_vip.name);
		} catch (e) {
			console.error("Error al guardar pago:", e);
			showAlert("Error registrando el pago en la base de datos.", "error");
		}

		return true;
	},

	// ===== Guardar (maneja los 3 estados) =====
	async onSave() {
		try {
			// Si el switch VIP-only está activo, solo mandamos el aviso VIP al dueño
			if (this._activeMode && this._activeMode() === true) {
				const ownerE164 = this._normalizeE164(this._OWNER_PHONE);
				const { code, ttlMin } = await this._startOtpFor(ownerE164, 10);
				await this._sendVipOnlyToOwner({ code, ttlMin });
				try { InputOtp?.setValue?.(''); } catch {}
				return;
			}

			// Flujo OTP clásico
			const otpHash  = appsmith.store?.otp_hash;
			const verified = appsmith.store?.otp_verified;

			if (verified) { showAlert("Este pago ya ha sido verificado y guardado.", "info"); return; }
			if (otpHash && !verified) { await this.verifyOtp(InputOtp?.text); return; }

			if (!otpHash) {
				await this.sendOtpToOwner({ ttlMin: 10 });
				await storeValue("otp_verified", false);
				try { InputOtp?.setValue?.(""); } catch {}
			}
		} catch (e) {
			console.error("onSave error:", e);
			showAlert("Error en el proceso OTP.", "error");
		}
	},

	// ===== Etiqueta del botón =====
	buttonLabel() {
		const otpHash  = appsmith.store?.otp_hash;
		const verified = appsmith.store?.otp_verified;

		if (verified) return "¡Pago Guardado!";
		if (otpHash && !verified) return "Confirmar OTP y Guardar";
		return "Enviar OTP al Propietario";
	}
};
