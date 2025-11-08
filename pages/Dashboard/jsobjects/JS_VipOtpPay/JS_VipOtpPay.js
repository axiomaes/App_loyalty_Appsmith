export default {
	// ---- Config ----
	_VIP_SID: "HX3b91ea6167d412d8eacc07312603e58a", // vip_pago_aviso_es

	_OWNER_E164() {
		// Lee primero de la config persistida (JS_WaSettings.load -> store)
		const raw = appsmith.store?.ownerPhone || "+34632803533"; // fallback seguro
		return String(raw || "").replace(/\D/g, "");
	},

	// ---- Estado OTP local ----
	async resetOtp() {
		await storeValue("otp_code_plain", null);
		await storeValue("otp_hash", null);
		await storeValue("otp_phone", null);
		await storeValue("otp_verified", false);
	},

	_normPhone(raw){ return JS_BondPayHelper.normalizePhone(raw || ""); },
	_nowPeriod(){ return moment().format("YYYY-MM"); },
	_formatEurInt(n){ return `€ ${Math.round(Number(n||0))}`; },

	_currentIds() {
		const id = appsmith.store?.editingCustomer?.id || appsmith.store?.selCustomerId || null;
		const planId = SelectPlan?.selectedOptionValue || appsmith.store?.selVipPlanId || null;
		return { id, planId };
	},

	_formValues() {
		return {
			period: InputPeriodo?.text || this._nowPeriod(),
			phone: this._normPhone(PhoneInput?.text || (appsmith.store?.editingCustomer?.phone || "")),
			method: SelectMetodoPago?.selectedOptionValue || null,
			notes: InputNotas?.text || "",
			amountEur: InputImporte?.text || 0,
			planId: SelectPlan?.selectedOptionValue || null
		};
	},

	// Helper: dígitos del cliente (si hay)
	_clientDigits() {
		const raw =
					PhoneInput?.text ||
					appsmith.store?.editingCustomer?.phone ||
					"";
		return String(this._normPhone(raw)).replace(/\D/g, "");
	},

	// ---- Abrir modal desde detalle ----
	async openFromDetail() {
		try {
			const det = appsmith.store?.editingCustomer || {};
			const id = det?.id || appsmith.store?.selCustomerId;
			if (!id) { showAlert("No se pudo determinar el cliente (detalle).", "warning"); return; }

			await this.resetOtp();

			const detRes = await q_cliente_detalle.run({ id });
			const fresh = Array.isArray(detRes) ? (detRes[0] || {}) : (detRes || {});
			await storeValue("editingCustomer", fresh);
			await storeValue("selCustomerId", fresh.id);

			try {
				InputPeriodo?.setValue?.(this._nowPeriod());
				PhoneInput?.setValue?.(this._normPhone(fresh.phone || ""));
				InputImporte?.setValue?.(String(JS_BondPayHelper?._toIntEuros?.(0) || 0));
				InputNotas?.setValue?.("");
				InputOtp?.setValue?.("");
			} catch(e){}

			await showModal(Modal_pago_vip.name);
		} catch (e) {
			console.error("openFromDetail error:", e);
			showAlert("No se pudo abrir el pago VIP.", "error");
		}
	},

	async openForSelected() {
		const id = appsmith.store?.selCustomerId;
		if (!id) { showAlert("Selecciona un cliente desde el detalle.", "warning"); return; }
		const detRes = await q_cliente_detalle.run({ id });
		const det = Array.isArray(detRes) ? (detRes[0] || {}) : (detRes || {});
		await storeValue("editingCustomer", det);
		return this.openFromDetail();
	},

	_validateBasics() {
		const v = JS_BondPayHelper.validatePagoVipForm();
		if (!v.ok) { showAlert(v.errs.join("\n"), "error"); return null; }
		return v;
	},

	// ---- ÚNICO envío: VIP al dueño (y opcional al cliente si el modo lo permite) ----
	async _sendVipToOwner({ code, ttlMin }) {
		const ownerTo = this._OWNER_E164();
		if (!ownerTo) { showAlert("Teléfono del dueño no válido.", "warning"); return; }

		const cust = appsmith.store?.editingCustomer || {};
		const name = cust?.name || "Cliente";
		const plan = SelectPlan?.selectedOptionLabel || appsmith.store?.selVipPlanName || "Plan";
		const amountInt = JS_BondPayHelper?._toIntEuros?.(InputImporte?.text) ?? Number(InputImporte?.text || 0);
		const amountLabel = this._formatEurInt(amountInt);
		const dateLabel = moment().format("DD/MM/YYYY");

		const vars = {
			"1": String(name),
			"2": String(plan),
			"3": String(amountLabel),
			"4": String(dateLabel),
			"5": String(code||""),
			"6": String(ttlMin||10)
		};

		// 1) Siempre enviamos al dueño
		await wa_send.run({
			to: ownerTo,
			contentSidOverride: this._VIP_SID,
			contentLanguage: "es",
			templateVars: vars
		});

		// 2) Si la config dice BOTH y BI está aprobado, también al cliente
		const mode = appsmith.store?.wa_mode || "vip";
		const biOk = appsmith.store?.wa_bi_approved === true;
		if (mode === "both" && biOk) {
			const clientTo = this._clientDigits();
			if (clientTo) {
				await wa_send.run({
					to: clientTo,
					contentSidOverride: this._VIP_SID, // misma plantilla
					contentLanguage: "es",
					templateVars: vars
				});
			}
		}
	},

	// ---- Verificar OTP y registrar pago ----
	async _verifyAndPay() {
		const typed = (InputOtp?.text || "").trim();
		const hash  = appsmith.store?.otp_hash;
		if (!typed || !hash) { showAlert("Ingresa el código de verificación.", "warning"); return; }

		const ok = await OTPUtils.checkOtp(typed, hash);
		if (!ok) { showAlert("Código inválido.", "error"); return; }

		const { id: customerId } = this._currentIds();
		const { method, notes, period, amountEur, planId } = this._formValues();
		if (!customerId) { showAlert("Falta cliente.", "warning"); return; }
		if (!planId)     { showAlert("Selecciona el plan.", "warning"); return; }

		await JS_BondPayHelper.pay({ customerId, planId, method, notes, period, amountEur });
		await storeValue("otp_verified", true);
		showAlert("Pago registrado correctamente.", "success");

		await q_cliente_detalle.run({ id: customerId });
		await q_visitas_historial.run({ customerId, limit: Table_visitas?.pageSize || 50, offset: 0 });
	},

	// --- Alias público para compatibilidad con botones antiguos ---
	async verifyAndPay() { return this._verifyAndPay(); },

	// ---- Botón GUARDAR (dos fases) ----
	async onSave() {
		try {
			const hasOtp  = !!appsmith.store?.otp_hash && appsmith.store?.otp_verified !== true;
			if (hasOtp) { await this._verifyAndPay(); return; }

			const base = this._validateBasics();
			if (!base) return;

			// Genera OTP (para control/registro) y avisa según configuración
			const ownerDigits = this._OWNER_E164();               // <- dígitos del dueño
			const { code, codeHash } = await OTPUtils.startOtp({
				businessId: Auth?.businessId?.(),
				phone: '+' + ownerDigits,                            // <- E164 correcto
				ttlMin: 10
			});
			await storeValue("otp_phone", ownerDigits);
			await storeValue("otp_hash", codeHash);

			await this._sendVipToOwner({ code, ttlMin: 10 });

			showAlert("Aviso enviado.", "success");
			try { InputOtp?.setFocus?.(); } catch (_){}
		} catch (e) {
			console.error("onSave error:", e);
			showAlert(e?.message || "No se pudo completar la operación.", "error");
		}
	},

	// ---- Texto dinámico del botón ----
	buttonLabel() {
		const hasOtp  = !!appsmith.store?.otp_hash && appsmith.store?.otp_verified !== true;
		return hasOtp ? "Confirmar OTP y Guardar" : "Enviar aviso al Propietario";
	}
};
