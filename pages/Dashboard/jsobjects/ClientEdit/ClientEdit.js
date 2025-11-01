export default {
  // Helpers
  _normTag(raw) {
    const v = String(raw ?? '').trim().toUpperCase();
    if (!v) return 'NONE';
    // Acepta exactamente los códigos de tu select
    const allowed = new Set([
      'VIP',
      'BONO_FAMILIA',
      'ESPORADICO',
      'BONO_VIP_A',
      'BONO_VIP_B',
      'BONO_VIP_C',
      'BONO_TARJETA',
      'NONE',
    ]);
    return allowed.has(v) ? v : v; // si llega algo fuera de catálogo, lo dejamos tal cual
  },
  _isVipTag(tag) {
    return /VIP/.test(String(tag || '').toUpperCase()); // VIP o BONO_VIP_*
  },

  // ---- Guardar cambios del cliente ----
  async save() {
    const id = appsmith.store.selCustomerId;
    if (!id) {
      showAlert("No hay cliente seleccionado.", "warning");
      return;
    }

    // Tag previo (del modal ya cargado o del último detalle)
    const prevTag =
      appsmith.store.clienteDetalle?.tag ??
      q_cliente_detalle.data?.[0]?.tag ??
      'NONE';

    // Construir tag desde el Select
    const selectedTag =
      SelectEditTag.selectedOptionValue ??
      SelectEditTag.selectedOption?.value ??
      SelectEditTag.selectedOptionLabel ??
      null;

    const nextTag = this._normTag(selectedTag);

    const payload = {
      id,
      name: InpEditName.text?.trim(),
      phone: InpEditPhone.text?.trim(),
      birthday: DateEditBirthday.selectedDate || null,
      notes: InpEditNotes.text?.trim() || null,
      tag: nextTag,
    };

    const wasVip = this._isVipTag(prevTag);
    const willVip = this._isVipTag(nextTag);
    const vipBoundaryChanged = wasVip !== willVip;

    try {
      // 1) Actualizar cliente
      const res = await q_update_customer.run(payload);

      const updated =
        Boolean(res?.updated) ||
        Boolean(res?.[0]?.updated) ||
        // muchos queries devuelven el propio registro actualizado:
        Boolean(res?.[0]?.id);

      if (!updated) {
        showAlert("No hubo cambios en los datos.", "info");
      } else {
        showAlert("Cliente actualizado correctamente.", "success");
      }

      // 2) Si cambió el estado VIP (regla del negocio: reiniciar progreso del plan)
      if (vipBoundaryChanged) {
        // Si tienes un query SQL para resetear ciclo/recompensas, lo llamamos:
        if (typeof q_reset_cycle_on_tag_change?.run === 'function') {
          try {
            await q_reset_cycle_on_tag_change.run({
              customerId: id,
              toVip: willVip,
              plan: nextTag,
            });
            showAlert(
              willVip
                ? "Se cambió a VIP y se reinició el progreso del plan."
                : "Se salió de VIP y se reinició el progreso del plan.",
              "info"
            );
          } catch (e) {
            console.error("q_reset_cycle_on_tag_change error:", e);
            // No bloqueamos el flujo si falla el reset; solo avisamos.
            showAlert("No se pudo reiniciar el ciclo. Revisa el query de reset.", "warning");
          }
        } else {
          // Si aún no tienes el query, al menos avisamos y forzamos el recálculo del UI.
          showAlert(
            "Cambio de estado VIP detectado. Asegúrate de tener un query de reseteo de ciclo si es necesario.",
            "warning"
          );
        }
      }

      // 3) Refrescar detalle, historial y tarjeta de visitas (UI)
      const [det, hist] = await Promise.all([
        q_cliente_detalle.run({ id }),
        q_visitas_historial.run({
          customerId: id,
          limit: Table_visitas.pageSize || 50,
          offset: 0,
        }),
      ]);
      await storeValue("clienteDetalle", det?.[0] || {});
      await storeValue("clienteHistorial", hist || []);

      // Recalcular tarjeta (getClientVisits + fallback + visitsLogic)
      if (typeof getClientVisitsQuery?.run === 'function') {
        await getClientVisitsQuery.run();
      }
      if (typeof getFallbackVisitsCount?.run === 'function') {
        await getFallbackVisitsCount.run();
      }
      if (typeof visitsLogic?.processData === 'function') {
        const ui = await visitsLogic.processData();
        await storeValue('visitsUI', ui);
      }

      // Si tienes listado principal, refrescarlo también
      if (typeof q_clientes_listado?.run === 'function') {
        q_clientes_listado.run();
      }

      // 4) Cerrar edición y reabrir detalle
      await closeModal(Modal_editar_cliente.name);
      await showModal(Modal_datos_clientes.name);
    } catch (e) {
      console.error("ClientEdit.save() error:", e);
      showAlert(e?.message || "No se pudo actualizar el cliente.", "error");
    }
  },
};
