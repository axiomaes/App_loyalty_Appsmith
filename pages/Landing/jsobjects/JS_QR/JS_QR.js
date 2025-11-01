export default {
  // URL de imagen (PNG) del API — ya existe
  pngUrl(id, size = 300) {
    if (!id) return "";
    return "https://axioma-api.loyalty.axioma-creativa.es/public/customers/" +
           encodeURIComponent(id) + "/qr.png?size=" + size;
  },

  // Landing en Appsmith (opcional). Página pública "QR_Landing"
  pageUrl(id) {
    if (!id) return "";
    // abre la página QR_Landing de TU app con ?cid=<id>
    return window.location.origin + "/app/" + appsmith.app.name + "/QR_Landing?cid=" + encodeURIComponent(id);
  }
};
