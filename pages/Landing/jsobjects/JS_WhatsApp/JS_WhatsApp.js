export default {
  businessName() {
    return (
      (typeof Auth?.businessName === "function" && Auth.businessName()) ||
      appsmith.store?.businessName ||
      "Tu barbería"
    );
  },

  message(customer) {
    const name = customer?.name || "cliente";
    const page = JS_QR.pageUrl(customer?.id);       // landing Appsmith (opcional)
    const png  = JS_QR.pngUrl(customer?.id, 300);   // imagen para preview
    
    // Si no quieres landing, quita la línea del "page" y deja solo png
    return `Hola ${name}! 👋
Te damos la bienvenida a *${this.businessName()}*.
Aquí tienes tu tarjeta de fidelización:
${page}

Si no se muestra la vista previa, usa esta imagen del QR:
${png}

📲 Muestra el QR en tu visita para sumar y canjear.
¡Gracias por tu preferencia! 💙`;
  },

  link(customer) {
    const phone = String(customer?.phone || "").replace(/\D/g, "");
    return "https://wa.me/" + phone + "?text=" + encodeURIComponent(this.message(customer));
  },

  send(customer) {
    // Siempre nueva pestaña / ventana
    navigateTo(this.link(customer), {}, "NEW_WINDOW");
  }
};
