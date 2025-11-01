export default {
  // ===== Helpers =====
  _bizName() {
    try {
      return (typeof Auth?.businessName === "function" && Auth.businessName())
        || appsmith.store?.businessName
        || "Tu barbería";
    } catch { return "Tu barbería"; }
  },

  _e164ToWaPhone(phone) {
    // Acepta "+34xxxxxxxxx" o "34xxxxxxxxx" o con espacios; devuelve "34xxxxxxxxx"
    const digits = String(phone || "").replace(/\D/g, "");
    if (!digits) return "";
    // Si venía como +34..., ya será 34... al quitar no dígitos
    return digits;
  },

  // ===== Mensajes =====
  buildMessage(customer, { includeLanding = true } = {}) {
    const name = (customer?.name || "cliente").trim();
    const cid = customer?.id;
    const page = includeLanding ? (JS_QR?.pageUrl?.(cid) || "") : "";
    const png  = JS_QR?.pngUrl?.(cid, 300) || "";

    // Ajusta el copy a tu gusto
    let msg = `Hola ${name}! 👋
Te damos la bienvenida a *${this._bizName()}*.
Aquí tienes tu tarjeta de fidelización:`;
    if (page) msg += `\n${page}`;

    msg += `\n\nSi no se muestra la vista previa, usa esta imagen del QR:\n${png}\n\n` +
           `📲 Muestra el QR en tu visita para sumar y canjear.\n` +
           `¡Gracias por tu preferencia! 💙`;

    return msg;
  },

  waLink(customer, opts = {}) {
    const phone = this._e164ToWaPhone(customer?.phone);
    if (!phone) return "";
    const text = this.buildMessage(customer, opts);
    return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
  },

  // ===== Acciones =====
  send(customer, opts = {}) {
    const url = this.waLink(customer, opts);
    if (!url) return showAlert("Teléfono del cliente inválido.", "warning");
    navigateTo(url, {}, "NEW_WINDOW");
  },

  async copyMessage(customer, opts = {}) {
    const text = this.buildMessage(customer, opts);
    await copyToClipboard(text);
    showAlert("Mensaje copiado al portapapeles.", "success");
  },

  async copyLink(customer, opts = {}) {
    const url = this.waLink(customer, opts);
    if (!url) return showAlert("Teléfono del cliente inválido.", "warning");
    await copyToClipboard(url);
    showAlert("Enlace de WhatsApp copiado.", "success");
  },

  // ===== Conveniencias =====
  // Envía al cliente actualmente seleccionado en la UI
  sendToSelected(opts = {}) {
    const c = appsmith.store?.editingCustomer || { id: appsmith.store?.selCustomerId, phone: "" };
    return this.send(c, opts);
  },
  copyMessageToSelected(opts = {}) {
    const c = appsmith.store?.editingCustomer || { id: appsmith.store?.selCustomerId, phone: "" };
    return this.copyMessage(c, opts);
  },
  copyLinkToSelected(opts = {}) {
    const c = appsmith.store?.editingCustomer || { id: appsmith.store?.selCustomerId, phone: "" };
    return this.copyLink(c, opts);
  }
};
