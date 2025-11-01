export default {
  async onLoad() {
    await storeValue("kioskMode", true);
    // opcional: forzar evaluación para refrescar labels cada X s
    // setInterval(() => storeValue("_tick", Date.now()), 1000);
  },
  onUnload() {
    storeValue("kioskMode", false);
  }
}
