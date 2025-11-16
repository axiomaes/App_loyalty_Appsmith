export default {
  async sendQrToSelected() {
    const id   = appsmith.store.selCustomerId;
    const tel  = appsmith.store.clienteTelefono;
    const name = appsmith.store.clienteNombre || "cliente";

    if (!id || !tel) {
      showAlert("Falta el ID o el teléfono del cliente.", "warning");
      return;
    }

    try {
      const res = await API_WA.run();  // API_WA ya usa to/customerId/etc

      if (res && res.ok) {
        showAlert(`Código enviado a ${name} por WhatsApp ✅`, "success");
      } else {
        showAlert("No se pudo enviar el WhatsApp (respuesta no OK).", "error");
        console.log("WA response:", res);
      }
    } catch (e) {
      console.error("Error al enviar WA:", e);
      showAlert("Error al enviar el WhatsApp.", "error");
    }
  }
};
