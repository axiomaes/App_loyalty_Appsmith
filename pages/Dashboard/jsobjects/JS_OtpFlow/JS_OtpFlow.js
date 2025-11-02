export default {
  CFG() {
    return {
      welcomeTemplate: 'welcome_qr_es',
      otpTemplate: 'otp_pago_bono_es',
      useWelcomeFirst: !!(appsmith.store.useWelcomeFirst ?? true),
      lang: 'es' // Spanish (SPA)
    };
  },

  _digitsFromE164(phone) {
    return String(phone || '').replace(/\D/g, '');
  },

  _bizName() {
    return (typeof Auth?.businessName === "function" && Auth.businessName())
      || appsmith.store?.businessName
      || "Tu barbería";
  },

  /**
   * Envía OTP con opción de mandar bienvenida primero.
   * @param {Object} opts
   *  - customer: { id, name, phone(+E164) }
   *  - code: string OTP
   *  - ttlMin: minutos de validez (opcional)
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

    // (opcional) consultar estado del proveedor
    // const st = await wa_status.run(); // si lo necesitas para gating

    // 1) Bienvenida (si está activado el toggle)
    if (cfg.useWelcomeFirst) {
      try {
        await wa_send.run({
          to,                                        // "34xxxxxxxxx"
          template: cfg.welcomeTemplate,             // welcome_qr_es
          language: cfg.lang,                       // 'es'
          variables: [ name, business ]             // {{1}}: nombre, {{2}}: negocio
        });
      } catch (e) {
        // No abortamos: si la bienvenida falla, intentamos OTP igual
        console.warn("welcome failed:", e);
      }
      // pequeño respiro para orden de llegada
      await new Promise(r => setTimeout(r, 600));
    }

    // 2) OTP (template de autenticación)
    await wa_send.run({
      to,
      template: cfg.otpTemplate,    // otp_pago_bono_es (Authentication)
      language: cfg.lang,
      // ajusta a las variables reales de tu plantilla OTP
      variables: [ code, String(ttlMin) ] // p.ej. {{1}}=código, {{2}}=TTL
    });

    showAlert("Mensaje enviado por WhatsApp.", "success");
  }
}
