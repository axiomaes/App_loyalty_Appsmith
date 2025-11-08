export default {
	// ===== Constantes =====
	_VIP_SID:     "HX3b91ea6167d412d8eacc07312603e58a", // vip_pago_aviso_es
	_OWNER_PHONE: "+34632803533",                        // fallback (se sobreescribe con store.ownerPhone)
	_LANG() { return "es"; },

	// ===== Utils =====
	_digits(s){ return String(s||"").replace(/\D/g,""); },
	_normalizeE164(raw=""){ const d=this._digits(raw); return d?`+${d}`:""; },
	_formatEur(v){ const n=Number(v||0); return n.toLocaleString("es-ES",{style:"currency",currency:"EUR"}); },

	// móvil del cliente (si existe en formulario/detalle)
	_clientDigits() {
		const raw =
					PhoneInput?.text ||
					appsmith.store?.editingCustomer?.phone ||
					"";
		// normaliza igual que el resto (sólo dígitos, el action añade whatsapp:+)
		return String(raw).replace(/\D/g, "");
	},

	// ===== Estado OTP =====
	async clearOtp(){
		await storeValue("otp_phone", null);
		await storeValue("otp_hash", null);
		await storeValue("otp_code_plain", null);
		await storeValue("otp_ttl_min", null);
		await storeValue("otp_verified", false);
	},

	async _startOtpForOwner(ttlMin=10){
		const toE164 = this._normalizeE164(appsmith.store?.ownerPhone || this._OWNER_PHONE);
		const codeObj = await OTPUtils.startOtp({ businessId: Auth?.businessId?.(), phone: toE164, ttlMin });
		return { toE164, ...codeObj };
	},

	// ===== WhatsApp (plantilla VIP al dueño y, opcionalmente, al cliente) =====
	async _sendVipOnlyToOwner({ code, ttlMin }) {
		const toDigits = this._digits(appsmith.store?.ownerPhone || this._OWNER_PHONE);
		if (!toDigits) { showAlert("Teléfono del dueño no válido.", "warning"); return; }

		const customer    = appsmith.store?.editingCustomer || {};
		const name        = customer.name || "Cliente";
		const planName    = SelectPlan?.selectedOptionLabel || appsmith.store?.selVipPlanName || "Plan";
		const amount      = (JS_BondPayHelper?._toIntEuros?.(InputImporte?.text) ?? Number(InputImporte?.text || 0));
		const amountLabel = this._formatEur(amount);
		const dateLabel   = moment().format("DD/MM/YYYY");

		const vars = { "1": String(name), "2": String(planName), "3": String(amountLabel), "4": String(dateLabel), "5": String(code||""), "6": String(ttlMin||10) };

		// 1) Siempre al DUEÑO
		await wa_send.run({
			to: toDigits,
			contentSidOverride: this._VIP_SID,
			contentLanguage: this._LANG(),
			templateVars: vars
		});

		// 2) Si modo = BOTH y BI aprobado -> también al CLIENTE (misma plantilla y variables)
		const mode = appsmith.store?.wa_mode || "vip";
		const biOk = appsmith.store?.wa_bi_approved === true;
		if (mode === "both" && biOk) {
			const clientTo = this._clientDigits();
			if (clientTo) {
				await wa_send.run({
					to: clientTo,
					contentSidOverride: this._VIP_SID,
					contentLanguage: this._LANG(),
					templateVars: vars
				});
			}
		}

		showAlert("📩 Aviso VIP enviado.", "success");
	},

	// ===== Flujo único: generar y avisar al dueño (y cliente si procede) =====
	async sendOtpToOwner({ ttlMin = 10 } = {}) {
		const { code, ttlMin: t } = await this._startOtpForOwner(ttlMin);
		await this._sendVipOnlyToOwner({ code, ttlMin: t });
	},

	// ===== Abrir modal (igual que ya tenías) =====
	async openFromDetail(customerId) {
		try {
			const id =
						customerId ||
						appsmith.store?.selCustomerId ||
						Listado_clientes?.selectedRow?.id ||
						Listado_clientes?.triggeredRow?.id;

			if (!id) { showAlert("No se pudo determinar el ID del cliente.", "warning"); return; }

			await this.clearOtp();
			await storeValue("selVipPlanName", null);
			await storeValue("selVipPlanId", null);

			const detRes = await q_cliente_detalle.run({ id });
			const det    = Array.isArray(detRes) ? (detRes[0] || {}) : (detRes || {});
			if (!det?.id) { showAlert("No se pudo cargar el detalle del cliente.", "error"); return; }

			await storeValue("editingCustomer", det);
			await storeValue("selCustomerId", det.id);

			try { InputPeriodo?.setValue?.(moment().format("YYYY-MM")); } catch {}
			try { PhoneInput?.setValue?.(this._normalizeE164(det.phone || "")); } catch {}
			try { InputImporte?.setValue?.("0"); } catch {}
			try { InputNotas?.setValue?.(""); } catch {}
			try { InputOtp?.setValue?.(""); } catch {}
			try { SelectPlan?.setSelectedOption?.(null); } catch {}

			await showModal(Modal_pago_vip.name);
		} catch (e) {
			console.error("openFromDetail error:", e);
			showAlert("No se pudo abrir el pago VIP.", "error");
		}
	},

	// ===== Verificar / Guardar (igual) =====
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
				await q_visitas_historial.run({ customerId: id, limit: Table_visitas?.pageSize || 50, offset: 0 });
			}

			showAlert("💶 Pago registrado correctamente.", "success");
		} catch (e) {
			console.error("Error al guardar pago:", e);
			showAlert("Error registrando el pago en la base de datos.", "error");
		}
		return true;
	},

	async onSave() {
		try {
			const otpHash  = appsmith.store?.otp_hash;
			const verified = appsmith.store?.otp_verified;

			if (verified) { showAlert("Este pago ya ha sido verificado y guardado.", "info"); return; }
			if (otpHash && !verified) { await this.verifyOtp(InputOtp?.text); return; }

			// ÚNICO flujo: generar OTP y avisar al dueño (y cliente si procede)
			await this.sendOtpToOwner({ ttlMin: 10 });
			await storeValue("otp_verified", false);
			try { InputOtp?.setValue?.(""); } catch {}
		} catch (e) {
			console.error("onSave error:", e);
			showAlert("Error en el proceso OTP.", "error");
		}
	},

	buttonLabel() {
		const otpHash  = !!appsmith.store?.otp_hash;
		const verified = appsmith.store?.otp_verified === true;
		if (verified) return "¡Pago Guardado!";
		if (otpHash && !verified) return "Confirmar OTP y Guardar";
		return "Enviar aviso al Propietario";
	}
};
