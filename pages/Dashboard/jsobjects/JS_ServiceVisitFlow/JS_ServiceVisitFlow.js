export default {
	// ================== Abrir flujo para un cliente (después de escanear QR o desde ficha) ==================
	async openForCustomer(customerId) {
		try {
			if (!customerId) {
				showAlert("Cliente no definido.", "error");
				return;
			}

			// guardamos el cliente seleccionado en el store
			await storeValue("selCustomerId", customerId);

			// cargamos detalle del cliente
			const det = await q_cliente_detalle.run({ id: customerId });
			const detalle = Array.isArray(det) ? det[0] || {} : det || {};

			await storeValue("scannedCustomer", detalle);
			await storeValue("clienteDetalle", detalle);

			// abrimos el modal con la lista de servicios
			showModal(Modal_ServiceConfirm.name);
		} catch (e) {
			console.error("openForCustomer error:", e);
			showAlert("No se pudo cargar los datos del cliente.", "error");
		}
	},

	// ================== Paso 1: elegir servicio ==================
	async pickService(row) {
		try {
			// servicio desde el parámetro o desde la tabla (por si acaso)
			const svc =
						row ||
						Table_Services?.triggeredRow ||
						Table_Services?.selectedRow ||
						null;

			if (!svc) {
				showAlert("Selecciona un servicio válido.", "error");
				return;
			}

			const id = svc.id || svc.serviceId || svc.service_id || null;
			const name = svc.name || svc.serviceName || svc.nombre || "";

			if (!id || !name) {
				showAlert("Servicio inválido o incompleto.", "error");
				return;
			}

			// cliente que se cargó en openForCustomer
			const customer =
						appsmith.store.scannedCustomer ||
						appsmith.store.clienteDetalle ||
						null;

			if (!customer) {
				showAlert("Cliente no cargado.", "error");
				return;
			}

			const phone = (customer.phone || "").toString();
			const last3 = phone.slice(-3) || "";

			// precio en céntimos → robusto
			const priceCents =
						svc.priceCents != null
			? Number(svc.priceCents)
			: svc.price_cents != null
			? Number(svc.price_cents)
			: 0;

			const priceEuros = (priceCents / 100).toFixed(2);

			// 📦 NUEVO: Capturar productId si existe
			const productId = svc.productId || svc.product_id || null; 

			// guardamos el servicio pendiente de confirmar
			await storeValue("pendingService", {
				id,
				name,
				priceCents,
				productId, // ⬅️ GUARDAMOS PRODUCT ID
			});

			// teléfono enmascarado para roles no privilegiados
			const role = (appsmith.store.role || "").toUpperCase();
			const isPrivileged = ["ADMIN", "OWNER", "SUPERADMIN"].includes(role);
			const maskedPhone =
						!phone
			? ""
			: isPrivileged
			? phone
			: "******" + last3;

			// datos formateados para el modal de confirmación
			await storeValue("pendingServicePreview", {
				customerName: customer.name || "",
				last3,
				maskedPhone,
				serviceName: name,
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

			// regla VIP / bloqueo como antes
			const canVisit = await VIP.mustBeActiveBeforeVisit(customerId);
			if (!canVisit) return;

			// llamamos a tu API POST /customers/:id/visits/with-progress
			// 💥 IMPORTANTE: Aquí se usa el endpoint atómico blindado
			const res = await q_visit_with_progress.run({
				customerId,          
				serviceId: service.id,
				serviceName: service.name,
				priceCents,
				notes: VisitAdd.motive(), // ⬅️ CORRECCIÓN: Se envían las notas
				productId: service.productId || null, // ⬅️ NUEVO: Se envía el productId
			});

			const data = Array.isArray(res) ? res[0] : res;
			if (!data?.customer) {
				showAlert("No se pudo registrar la visita.", "error");
				return;
			}

			// refrescos que ya existían (ajusta nombres si hace falta)
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

			await storeValue("pendingService", null);
			await storeValue("pendingServicePreview", null);

			closeModal(Modal_ConfirmService.name);
			closeModal(Modal_ServiceConfirm.name);

			showAlert("Visita registrada.", "success");
		} catch (e) {
			console.error("confirmService error:", e);
			// Muestra el mensaje de error específico del backend (ej. STOCK_INSUFFICIENTE)
			const errorMessage = e?.message || "No se pudo registrar la visita.";
			showAlert(errorMessage, "error");
		}
	},

	// ================== Cancelar confirmación ==================
	async cancelConfirm() {
		await storeValue("pendingService", null);
		await storeValue("pendingServicePreview", null);
		closeModal(Modal_ConfirmService.name);
	},
};