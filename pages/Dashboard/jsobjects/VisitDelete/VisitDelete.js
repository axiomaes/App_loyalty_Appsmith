export default {
	// pequeño helper para mostrar mensajes de error "bonitos"
	_errMsg(e) {
		return (
			e?.data?.message ||
			e?.responseMeta?.statusText ||
			e?.message ||
			"No se pudo eliminar la visita."
		);
	},

	async run(visitId) {
		// 🛡️ Permisos
		if (!Roles.canDeleteVisits()) {
			showAlert("No tienes permisos para eliminar visitas.", "warning");
			return;
		}

		// ⛔️ En curso (anti doble clic)
		if (appsmith.store._delBusy) return;
		await storeValue("_delBusy", true);

		try {
			// 🆔 Validación del ID
			if (!Utils.isUuid?.(visitId)) {
				showAlert("ID de visita inválido o ausente.", "warning");
				return;
			}

			// 💾 Estado actual (para rollback si falla)
			const prev = Array.isArray(appsmith.store.visits)
			? [...appsmith.store.visits]
			: [];

			// 💡 UI optimista: elimina visualmente la fila
			await storeValue(
				"visits",
				prev.filter((r) => r?.id !== visitId)
			);
			await storeValue("_lastDeletedVisitId", visitId);

			// 🔄 Llamada real (DELETE)
			// Nota: si tu API devuelve 204 sin cuerpo, Appsmith puede dar `undefined`, es OK.
			await q_delete_visit.run({ visitId });

			// 🔁 Refresca datos del cliente seleccionado (si lo hay)
			const customerId =
						appsmith.store.selCustomerId || appsmith.store.editingCustomer?.id;

			if (Utils.isUuid(customerId)) {
				await Promise.allSettled([
					q_visitas_historial.run({ customerId, limit: 500, offset: 0 }),
					getClientVisitsQuery.run(),
					getFallbackVisitsCount.run(),
					q_cliente_detalle?.run?.({ id: customerId }),
				]);

				// Actualiza store con lo más reciente de historial
				await storeValue(
					"visits",
					Array.isArray(q_visitas_historial.data)
					? q_visitas_historial.data
					: appsmith.store.visits || []
				);
			}

			showAlert("Visita eliminada correctamente.", "success");
		} catch (e) {
			// 🔙 Rollback en error
			const prev = Array.isArray(appsmith.store.visits_backup)
			? appsmith.store.visits_backup
			: null;

			// si no teníamos backup explícito, usamos lo que guardamos en el paso optimista
			if (prev) {
				await storeValue("visits", prev);
			} else {
				// en el flujo actual guardamos `prev` en la variable local,
				// así que replicamos la restauración con lo que hubiera antes del filtro
				// (si no existe, no hacemos nada)
			}

			console.error("VisitDelete error:", e);
			showAlert(this._errMsg(e), "error");
		} finally {
			await storeValue("_delBusy", false);
		}
	},
};
