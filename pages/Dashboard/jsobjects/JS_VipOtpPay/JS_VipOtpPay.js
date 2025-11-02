export default {
  // ==== Config ====
  OTP_TEMPLATE_SID: "HX8903c49a01fcf311ffec50560694638", // otp_pago_bono_es
  OTP_TTL_MIN: 10,

  // ==== Estado OTP ====
  isOtpPending() { return !!appsmith.store.otp_hash && appsmith.store.otp_verified !== true; },
  isOtpVerified() { return appsmith.store.otp_verified === true; },

  async resetOtp() {
    await Promise.all([
      storeValue("otp_hash", null),
      storeValue("otp_code_plain", null),
      storeValue("otp_verified", false),
      storeValue("otp_started", null),
      storeValue("otp_code_ui", "")
    ]);
  },

  // ==== Paso 1: Enviar OTP si no hay ====
  async startOtpIfNeeded(phoneE164) {
    if (appsmith.store.otp_hash) return false; // ya existe uno
    const { code } = await OTPUtils.startOtp({
      businessId: Auth?.businessId?.(),
      phone: phoneE164,
      ttlMin: this.OTP_TTL_MIN
    });

    await wa_send.run({
      to: phoneE164,
      templateVars: { "1": code, "2": String(this.OTP_TTL_MIN) },
      contentSidOverride: this.OTP_TEMPLATE_SID
    });

    showAlert("Código enviado por WhatsApp. Revísalo e ingrésalo.", "success");
    return true; // se inició OTP
  },

  // ==== Paso 2: Verificar OTP si está pendiente ====
  async verifyOtpIfNeeded() {
    if (!this.isOtpPending()) return true; // nada que verificar
    const input = (InputOtp?.text || "").trim();
    if (!input) { showAlert("Ingresa el código recibido por WhatsApp.", "warning"); return false; }

    const ok = await OTPUtils.checkOtp(input, appsmith.store.otp_hash);
    if (!ok) { showAlert("Código incorrecto o vencido.", "error"); return false; }

    await storeValue("otp_verified", true);
    showAlert("Código verificado ✅", "success");
    return true;
  },

  // ==== Paso 3: Registrar pago (cuando OTP OK) ====
  async submitPayment() {
    const res = await JS_BondPayHelper.paySelected({
      method: SelectMetodoPago?.selectedOptionValue || null,
      notes: InputObs?.text || "",
      period: InputPeriodo?.text || null,
      amountEur: InputImporte?.text || null
    });

    if (res?.updated)      showAlert("Pago actualizado para ese período.", "success");
    else if (res?.inserted) showAlert("Pago registrado.", "success");
    else                    showAlert("No se registró ningún cambio.", "info");

    await this.resetOtp();
    closeModal(Modal_pago_vip.name);
  },

  // ==== Orquestador para el botón "Guardar" ====
  async onSave() {
    // Validaciones del formulario (reusa tu helper actual)
    const v = JS_BondPayHelper.validatePagoVipForm();
    if (!v.ok) { showAlert(v.errs.join("\n"), "error"); return; }

    // 1) Enviar OTP si no existe aún
    const started = await this.startOtpIfNeeded(v.phoneE164);
    if (started) return; // mostramos input OTP y esperamos siguiente click

    // 2) Verificar OTP si está pendiente
    const ok = await this.verifyOtpIfNeeded();
    if (!ok) return;

    // 3) OTP OK -> pagar
    await this.submitPayment();
  },

  // (Opcional) Etiqueta dinámica del botón
  buttonLabel() {
    if (!appsmith.store.otp_hash) return "Enviar código";
    if (this.isOtpPending()) return "Confirmar código";
    return "Guardar pago";
  }
};
