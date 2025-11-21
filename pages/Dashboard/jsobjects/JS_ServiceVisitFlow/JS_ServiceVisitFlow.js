export default {
	// ================== Abrir flujo para un cliente (después de escanear QR) ==================
	async openForCustomer(customerId) {
		try {
			if (!customerId) {
				showAlert("Cliente no definido.", "error");
				return;
			}

			// guardamos el cliente seleccionado en el store
			await storeValue("selCustomerId", customerId);

			// cargamos detalle del cliente (ya lo usas en otras pantallas)
			const detalle = await q_cliente_detalle.run({ id: customerId });
			await storeValue("scannedCustomer", detalle?.[0] || detalle);

			// abrimos el modal con la lista de servicios
			showModal(Modal_ServiceConfirm.name);
		} catch (e) {
			console.error("openForCustomer error:", e);
			showAlert("No se pudo cargar los datos del cliente.", "error");
		}
	},

	// ================== Paso 1: elegir servicio ==================
	async pickService(service) {
		try {
			const customer = appsmith.store.scannedCustomer;
			if (!customer) {
				showAlert("Cliente no cargado.", "error");
				return;
			}

			const phone = (customer.phone || "").toString();
			const last3 = phone.slice(-3) || "";

			const priceCents =
						service?.priceCents != null ? Number(service.priceCents) : 0;
			const priceEuros = (priceCents / 100).toFixed(2);

			// guardamos el servicio pendiente de confirmar
			await storeValue("pendingService", {
				id: service.id,
				name: service.name,
				priceCents,
			});

			// datos ya formateados para mostrar en el modal de confirmación
			await storeValue("pendingServicePreview", {
				customerName: customer.name || "",
				last3,
				serviceName: service.name || "",
				priceLabel: priceEuros,
			});

			// abrimos el modal de confirmación
			showModal(Modal_ConfirmService.name);
		} catch (e) {
			console.error("pickService error:", e);
			showAlert("No se pudo preparar la confirmación.", "error");
		}
	},

	// ================== Paso 2: confirmar servicio ==================
	async confirmService() {
		try {
			const customerId = appsmith.store.selCustomerId;
			const service = appsmith.store.pendingService;

			if (!customerId || !service) {
				showAlert("Faltan datos para registrar la visita.", "error");
				return;
			}

			const priceCents =
						service.priceCents != null ? Number(service.priceCents) : 0;

			// llamamos a tu API POST /customers/:id/visits/with-progress
			const res = await q_visit_with_progress.run({
				customerId,          // usado en la URL: {{ this.params.customerId }}
				serviceId: service.id,
				serviceName: service.name,
				priceCents,
			});

			// si quieres, puedes validar un poco la respuesta
			const data = Array.isArray(res) ? res[0] : res;
			if (!data?.customer) {
				showAlert("No se pudo registrar la visita.", "error");
				return;
			}

			// refresco de datos relacionados (si existen esos queries)
			try {
				if (typeof q_clientes_por_dia?.run === "function") {
					await q_clientes_por_dia.run();
				}

				if (typeof q_visitas_historial?.run === "function") {
					await q_visitas_historial.run({
						customerId,
						limit: 500,
						offset: 0,
					});
				}
			} catch (e) {
				console.warn("refresh after confirmService error:", e);
			}

			// limpiamos estado temporal
			await storeValue("pendingService", null);
			await storeValue("pendingServicePreview", null);

			// cerramos modales
			closeModal(Modal_ConfirmService.name);
			closeModal(Modal_ServiceConfirm.name);

			// toast final
			showAlert("Visita registrada.", "success");
		} catch (e) {
			console.error("confirmService error:", e);
			showAlert(e?.message || "No se pudo registrar la visita.", "error");
		}
	},

	// ================== Cancelar confirmación ==================
	async cancelConfirm() {
		await storeValue("pendingService", null);
		await storeValue("pendingServicePreview", null);
		closeModal(Modal_ConfirmService.name);
	},
};
