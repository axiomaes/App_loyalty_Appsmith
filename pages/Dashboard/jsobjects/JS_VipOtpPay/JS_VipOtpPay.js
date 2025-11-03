export default {
  // ---- Estado OTP local (limpio al abrir) ----
  async resetOtp() {
    await storeValue("otp_code_plain", null);
    await storeValue("otp_hash", null);
    await storeValue("otp_phone", null);
    await storeValue("otp_verified", false);
  },

  _normPhone(raw) {
    return JS_BondPayHelper.normalizePhone(raw || "");
  },

  _nowPeriod() {
    return moment().format("YYYY-MM");
  },

  // Lee ids/valores actuales (prioriza el detalle ya cargado)
  _currentIds() {
    const id = appsmith.store?.editingCustomer?.id || appsmith.store?.selCustomerId || null;
    const planId =
      SelectPlan?.selectedOptionValue ||
      appsmith.store?.selVipPlanId ||
      null;
    return { id, planId };
  },

  _formValues() {
    return {
      period: InputPeriodo?.text || this._nowPeriod(),
      phone: this._normPhone(
        PhoneInput?.text || (appsmith.store?.editingCustomer?.phone || "")
      ),
      method: SelectMetodoPago?.selectedOptionValue || null,
      notes: InputNotas?.text || "",
      amountEur: InputImporte?.text || 0,
      planId: SelectPlan?.selectedOptionValue || null,
      welcomeFirst: !!TogWelcomeFirst?.isChecked
    };
  },

  // ---- ABRIR desde el modal de DETALLE (botón VIP) ----
  // Vincula el botón a: {{ JS_VipOtpPay.openFromDetail() }}
  async openFromDetail() {
    try {
      const det = appsmith.store?.editingCustomer || {};
      const id = det?.id || appsmith.store?.selCustomerId;
      if (!id) { showAlert("No se pudo determinar el cliente (detalle).", "warning"); return; }

      await this.resetOtp();

      // Opcional: refresca el detalle para asegurar datos frescos
      const detRes = await q_cliente_detalle.run({ id });
      const fresh = Array.isArray(detRes) ? (detRes[0] || {}) : (detRes || {});
      await storeValue("editingCustomer", fresh);
      await storeValue("selCustomerId", fresh.id);

      // Defaults del formulario
      try {
        InputPeriodo?.setValue?.(this._nowPeriod());
        PhoneInput?.setValue?.(this._normPhone(fresh.phone || ""));
        InputImporte?.setValue?.(String(JS_BondPayHelper?._toIntEuros?.(0) || 0));
        InputNotas?.setValue?.("");
        TogWelcomeFirst?.setChecked?.(true);
      } catch (e) {
        console.warn("Setters del formulario (no crítico):", e);
      }

      await showModal(Modal_pago_vip.name);
    } catch (e) {
      console.error("openFromDetail error:", e);
      showAlert("No se pudo abrir el pago VIP.", "error");
    }
  },

  // ---- Alias por si en algún sitio usan selección simple ----
  async openForSelected() {
    const id = appsmith.store?.selCustomerId;
    if (!id) { showAlert("Selecciona un cliente desde el detalle.", "warning"); return; }
    // Asegura editingCustomer y reusa la misma lógica
    const detRes = await q_cliente_detalle.run({ id });
    const det = Array.isArray(detRes) ? (detRes[0] || {}) : (detRes || {});
    await storeValue("editingCustomer", det);
    return this.openFromDetail();
  },

  // Validación mínima antes de ENVIAR OTP
  _validateBasics() {
    const v = JS_BondPayHelper.validatePagoVipForm();
    if (!v.ok) { showAlert(v.errs.join("\n"), "error"); return null; }
    return v;
  },

  // Enviar bienvenida (si toggle ON)
  async _sendWelcomeIfNeeded(toE164) {
    try {
      if (!TogWelcomeFirst?.isChecked) return;
      await wa_send.run({
        to: toE164,
        contentSidOverride: "HXb06a2950296822f06a8e3bdc02c893de", // welcome_qr_es
        templateVars: {}
      });
    } catch (e) {
      console.warn("Welcome send warn:", e);
    }
  },

  // Enviar OTP (plantilla AUTH)
  async _sendOtp(toE164) {
    const { code, codeHash } = await OTPUtils.startOtp({
      businessId: Auth?.businessId?.(),
      phone: toE164,
      ttlMin: 10
    });

    await storeValue("otp_code_plain", code);
    await storeValue("otp_hash", codeHash);

    await wa_send.run({
      to: toE164,
      templateVars: { "1": code, "2": "10" },
      contentSidOverride: "HX8903c49a01fcf311ffcec50560694638" // otp_pago_bono_es
    });
  },

  // Verificar OTP y REGISTRAR el pago
  async _verifyAndPay() {
    const typed = InputOtp?.text?.trim() || "";
    const hash = appsmith.store?.otp_hash;
    if (!typed || !hash) {
      showAlert("Ingresa el código de verificación.", "warning");
      return;
    }
    const ok = await OTPUtils.checkOtp(typed, hash);
    if (!ok) { showAlert("Código inválido.", "error"); return; }

    const { id: customerId } = this._currentIds();
    const { method, notes, period, amountEur, planId } = this._formValues();
    if (!customerId) { showAlert("Falta cliente.", "warning"); return; }
    if (!planId)     { showAlert("Selecciona el plan.", "warning"); return; }

    await JS_BondPayHelper.pay({
      customerId, planId, method, notes, period, amountEur
    });

    await storeValue("otp_verified", true);
    showAlert("Pago registrado correctamente.", "success");

    // Refrescos de UI
    await q_cliente_detalle.run({ id: customerId });
    await q_visitas_historial.run({
      customerId,
      limit: Table_visitas?.pageSize || 50,
      offset: 0
    });
  },

  // Botón GUARDAR del modal (dos fases)
  async onSave() {
    try {
      const hasOtp = !!appsmith.store?.otp_hash && appsmith.store?.otp_verified !== true;
      if (hasOtp) {
        await this._verifyAndPay();
        return;
      }

      const base = this._validateBasics();
      if (!base) return;

      const phone = this._normPhone(PhoneInput?.text || "");
      if (!phone) { showAlert("Móvil inválido.", "error"); return; }

      await this._sendWelcomeIfNeeded(phone);
      await this._sendOtp(phone);

      showAlert("Código enviado por WhatsApp.", "success");
      try { InputOtp?.setFocus?.(); } catch (_) {}
    } catch (e) {
      console.error("onSave error:", e);
      showAlert(e?.message || "No se pudo completar la operación.", "error");
    }
  },

  // Etiqueta dinámica del botón Guardar
  buttonLabel() {
    const hasOtp = !!appsmith.store?.otp_hash && appsmith.store?.otp_verified !== true;
    return hasOtp ? "Confirmar OTP y Guardar" : "Enviar OTP";
  }
};
