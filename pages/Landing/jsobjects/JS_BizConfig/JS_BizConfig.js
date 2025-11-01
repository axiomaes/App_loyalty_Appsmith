export default {
  async load() {
    await storeValue('biz', {
      name: "La Cubierta Barbería",
      logoUrl: "https://…/logo.png",
      color: "#0D47A1",
      promo: "Muestra este QR y suma visitas para descuentos 🎉",
      website: "https://lacubiertabarberia.com",
      mapsUrl: "https://maps.google.com/?q=La+Cubierta+Barberia",
      tiktok: "lacubierta.barberia"
    });
  }
};
