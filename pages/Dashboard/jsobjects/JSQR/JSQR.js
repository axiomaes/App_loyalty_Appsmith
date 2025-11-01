export default {
  _timer: null,

  // Caso onSubmit (pistola envía Enter)
  async onSubmit(raw) {
    const text = String(raw || "").replace(/[\r\n\t]+$/g, "").trim();
    if (!text) return;
    try {
      await VisitAdd.fromQr(text);
      await storeValue("_lastScanRaw", text);
    } finally {
      ScanInput.setValue("");
      // Intentar recuperar foco para siguiente escaneo
      try { ScanInput.focus && ScanInput.focus(); } catch(_) {}
    }
  },

  // Caso onTextChanged (si la pistola no envía Enter)
  onType(raw) {
    const text = String(raw || "").trim();
    if (!text) return;
    clearTimeout(this._timer);
    // Si el lector es muy rápido, con 120–200 ms basta
    this._timer = setTimeout(async () => {
      try {
        await VisitAdd.fromQr(text);
        await storeValue("_lastScanRaw", text);
      } finally {
        ScanInput.setValue("");
        try { ScanInput.focus && ScanInput.focus(); } catch(_) {}
      }
    }, 150);
  },
};
