export default {
  // --- Config ---------------------------------------------------------------
  API_BASE: "https://axioma-api.loyalty.axioma-creativa.es/public/customers",

  // --- Utils ----------------------------------------------------------------
  _isUuid(s) {
    return typeof s === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
  },
  _normId(id) {
    const s = String(id || "").trim();
    return s && this._isUuid(s) ? s : "";
  },
  _normSize(size, def = 300) {
    const n = Number(size);
    return Number.isFinite(n) ? Math.max(64, Math.min(1024, Math.trunc(n))) : def;
  },

  // --- URLs -----------------------------------------------------------------
  /** URL del PNG del QR generado por el API */
  pngUrl(id, size = 300) {
    const cid = this._normId(id);
    if (!cid) return "";
    const sz = this._normSize(size);
    return `${this.API_BASE}/${encodeURIComponent(cid)}/qr.png?size=${sz}`;
  },

  /** URL de la landing pública de Appsmith (página QR_Landing?cid=...) */
  pageUrl(id) {
    const cid = this._normId(id);
    if (!cid) return "";
    const appName = encodeURIComponent(appsmith.app.name);
    return `${window.location.origin}/app/${appName}/QR_Landing?cid=${encodeURIComponent(cid)}`;
  },

  // --- Acciones -------------------------------------------------------------
  /** Copia al portapapeles la URL pública de la landing */
  async copyLandingUrl(id) {
    const url = this.pageUrl(id);
    if (!url) return showAlert("Cliente inválido.", "warning");
    await copyToClipboard(url);
    showAlert("Enlace copiado al portapapeles.", "success");
  },

  /** Abre la landing en una pestaña nueva */
  openLanding(id) {
    const url = this.pageUrl(id);
    if (!url) return showAlert("Cliente inválido.", "warning");
    window.open(url, "_blank", "noopener,noreferrer");
  },

  /** Copia al portapapeles la URL del PNG (por si lo necesitas) */
  async copyPngUrl(id, size = 300) {
    const url = this.pngUrl(id, size);
    if (!url) return showAlert("Cliente inválido.", "warning");
    await copyToClipboard(url);
    showAlert("URL del QR copiada.", "success");
  }
};
