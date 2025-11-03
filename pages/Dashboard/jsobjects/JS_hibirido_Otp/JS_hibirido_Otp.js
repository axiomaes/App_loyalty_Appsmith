export default {
  // ===== Constantes =====
  _WELCOME_SID: "HXb06a2950296822f06a8e3bdc02c893de",   // welcome_qr_es
  _OTP_SID:     "HX8903c49a01fcf311ffcec50560694638",   // otp_pago_bono_es
  _OWNER_PHONE: "+34632803533",                          // número del dueño (E.164)

  // ===== Utils =====
  _bizId() {
    try {
      return (typeof Auth?.businessId === "function" && Auth.businessId()) ||
             appsmith.store?.businessId || null;
    } catch {
      return appsmith.store?.businessId || null;
    }
  },

  _normalizeE164(raw = "") {
    const d = String(raw || "").replace(/\D+/g, "");
    if (!d) return "";
    if (d.startsWith("00")) return `+${d.slice(2)}`;
    if (d.startsWith("+")) return `+${d.replace(/^\++/, "")}`;
    if (/^[6789]\d{8}$/.test(d)) return `+34${d}`; // España por defecto
    if (d.startsWith("34") && d.length >= 11) return `+34${d.slice(-9)}`;
    return `+${d}`;
  },

  _formatEur(value) {
    const n = Number(value || 0);
    return n.toLocaleString("es-ES", { style: "currency", currency: "EUR" });
  },

  _buildOtpVars(code, ttlMin) {
    return { "1": String(code || ""), "2": String(ttlMin || 10) };
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
    await storeValue("otp_code_plain", codeObj.code);
    await storeValue("otp_hash", codeObj.codeHash);
    await storeValue("otp_ttl_min", ttlMin);
    await storeValue("otp_verified", false);
    return codeObj;
  },

  // ===== WhatsApp =====
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

  // ===== Flujo de envío =====
  async sendWelcome(toRaw) {
    const to = this._normalizeE164(toRaw);
    if (!to) {
      showAlert("Teléfono inválido.", "warning");
      return;
    }
    await this._sendTemplate({ to, sid: this._WELCOME_SID });
    showAlert("Mensaje de bienvenida enviado.", "success");
  },

  async sendOtpToClientAndOwner(toRaw, { ttlMin = 10 } = {}) {
    const phoneClient = this._normalizeE164(toRaw);
    const phoneOwner  = this._normalizeE164(this._OWNER_PHONE);
    if (!phoneOwner) {
      showAlert("Teléfono del dueño no válido.", "warning");
      return;
    }

    const { code, ttlMin: t } = await this._startOtpFor(phoneClient, ttlMin);

    // ===== 1️⃣ Envío al CLIENTE (si Twilio ya aprobó las plantillas) =====
    try {
      await this._sendTemplate({
        to: phoneClient,
        sid: this._OTP_SID,
        vars: this._buildOtpVars(code, t)
      });
    } catch (err) {
      console.warn("No se pudo enviar OTP al cliente (quizá sin plantilla aprobada):", err);
    }

    // ===== 2️⃣ Envío de COPIA al DUEÑO =====
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

    await this._sendText({ to: phoneOwner, body: msg });

    showAlert("OTP enviado al cliente y copia al propietario.", "success");
  },

  // ===== Verificar OTP =====
  async verifyOtp(inputCode) {
    const hash = appsmith.store?.otp_hash;
    if (!hash) {
      showAlert("No hay OTP generado.", "warning");
      return false;
    }
    const ok = await OTPUtils.checkOtp(String(inputCode || ""), hash);
    if (!ok) showAlert("Código inválido.", "error");
    return ok;
  },

  // ===== Abrir modal desde Detalle =====
  async openFromDetail() {
    try {
      const c = appsmith.store?.editingCustomer;
      if (!c?.id) {
        showAlert("Selecciona un cliente antes de abrir el pago VIP.", "warning");
        return;
      }

      await this.clearOtp();

      // Refresca detalle del cliente
      const detRes = await q_cliente_detalle.run({ id: c.id });
      const det = Array.isArray(detRes) ? (detRes[0] || {}) : (detRes || {});
      await storeValue("editingCustomer", det);

      // Setea valores por defecto del modal
      if (InputPeriodo) InputPeriodo.setValue(moment().format("YYYY-MM"));
      if (PhoneInput) PhoneInput.setValue(this._normalizeE164(det.phone || ""));
      if (InputImporte) InputImporte.setValue("0");
      if (InputNotas) InputNotas.setValue("");

      await showModal(Modal_pago_vip.name);
    } catch (e) {
      console.error("openFromDetail error:", e);
      showAlert("No se pudo abrir el pago VIP.", "error");
    }
  },

  // ===== Guardar / Confirmar =====
  async onSave() {
    try {
      const otpHash = appsmith.store?.otp_hash;
      if (otpHash && !appsmith.store?.otp_verified) {
        const ok = await this.verifyOtp(InputOtp?.text);
        if (ok) {
          showAlert("Código verificado, registrando pago...", "success");
          await JS_BondPayHelper.pay();
          await storeValue("otp_verified", true);
        }
        return;
      }

      const phoneClient = this._normalizeE164(PhoneInput?.text);
      if (!phoneClient) {
        showAlert("Teléfono del cliente inválido.", "warning");
        return;
      }

      // Envío OTP al cliente y copia al dueño
      await this.sendOtpToClientAndOwner(phoneClient, { ttlMin: 10 });

      try { InputOtp?.setFocus?.(); } catch {}
    } catch (e) {
      console.error("onSave error:", e);
      showAlert("Error en el proceso OTP.", "error");
    }
  },

  buttonLabel() {
    const otpHash = appsmith.store?.otp_hash;
    const verified = appsmith.store?.otp_verified;
    return otpHash && !verified
      ? "Confirmar OTP y Guardar"
      : "Enviar OTP";
  }
};
