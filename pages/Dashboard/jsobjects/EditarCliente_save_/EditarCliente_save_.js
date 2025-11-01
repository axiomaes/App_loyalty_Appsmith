export default {
  async save() {
    const c = appsmith.store.editingCustomer;
    if (!c?.id) {
      showAlert("Falta cliente a editar", "error");
      return;
    }

    // ==== Normalizaciones =====================================================
    const name = (InpEditName.text || "").trim();
    const email = (InputEmail_edit.text || "").trim() || null;
    const notes = (InpEditNotes.text || "").trim() || null;

    // Teléfono → +34 + 9 dígitos
    const raw = (InpEditPhone.text || "").trim();
    const phoneDigits = raw.replace(/\D/g, "").slice(-9);
    const phone = phoneDigits ? `+34${phoneDigits}` : null;

    // Fecha cumple
    let birthday = DateEditBirthday.selectedDate || null;
    if (birthday) {
      try {
        const d = new Date(birthday);
        if (!isNaN(d)) birthday = d.toISOString();
      } catch {
        birthday = null;
      }
    }

    // Tag → enum o null
    const tagVal = SelectEditTag.selectedOptionValue;
    const tag = tagVal && String(tagVal).trim().length ? tagVal : null;

    // ==== Validaciones ========================================================
    if (!name) return showAlert("El nombre es obligatorio.", "warning");
    if (!phone || phone.length < 10) return showAlert("Teléfono inválido.", "warning");

    // ==== Query de actualización =============================================
    try {
      const res = await q_update_customer.run({
        id: c.id,
        name,
        phone,
        email,
        notes,
        birthday,
        tag
      });

      const row = res?.[0];
      if (!row) {
        showAlert("No se actualizó ninguna fila (¿negocio diferente o ID inválido?)", "warning");
        return;
      }

      // ==== Post-acción =======================================================
      showAlert("Datos del cliente actualizados.", "success");

      // Rehidrata el store
      await storeValue("editingCustomer", row);

      // Refresca la ficha del cliente + listado
      await Promise.allSettled([
        q_cliente_detalle.run({ id: c.id }),
        q_clientes_listado.run({ bid: Auth.businessId() })
      ]);

      // Cierra modal de edición
      try {
        closeModal(Modal_editar_cliente.name);
      } catch { /* modal ya cerrado */ }

    } catch (e) {
      const msg = String(e?.message || e);
      if (/invalid input syntax for type uuid/i.test(msg)) {
        showAlert("Negocio inválido en la sesión. Vuelve a iniciar sesión.", "error");
      } else if (/enum|CustomerTag/i.test(msg)) {
        showAlert("Etiqueta inválida.", "error");
      } else {
        showAlert("Error al guardar los datos del cliente.", "error");
      }
      console.error("q_update_customer error:", e);
    }
  }
};
