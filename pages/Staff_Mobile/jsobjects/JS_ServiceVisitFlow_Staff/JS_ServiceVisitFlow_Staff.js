export default {

	WALKIN_CUSTOMER_ID: "8ba48fd7-e956-4163-b4e8-91f09b0bf01a",
	// ================== Flujo antiguo (QR / ficha) ==================
	async openForCustomer(customerId) {
		try {
			if (!customerId) {
				showAlert("Cliente no definido.", "error");
				return;
			}

			await storeValue("selCustomerId", customerId);

			const det = await q_cliente_detalle.run({ id: customerId });
			const detalle = Array.isArray(det) ? det[0] || {} : det || {};

			await storeValue("scannedCustomer", detalle);
			await storeValue("clienteDetalle", detalle);

			showModal(Modal_ServiceConfirm.name);
		} catch (e) {
			console.error("openForCustomer error:", e);
			showAlert("No se pudo cargar los datos del cliente.", "error");
		}
	},

	// ================== Paso 1 (flujo antiguo): elegir servicio ==================
	async pickService(row) {
		try {
			const svc =
						row ||
						Table1?.triggeredRow ||
						Table1?.selectedRow ||
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

			const priceCents =
						svc.priceCents != null
			? Number(svc.priceCents)
			: svc.price_cents != null
			? Number(svc.price_cents)
			: 0;

			const priceEuros = (priceCents / 100).toFixed(2);

			const productId = svc.productId || svc.product_id || null;

			await storeValue("pendingService", {
				id,
				name,
				priceCents,
				productId,
			});

			const role = (appsmith.store.role || "").toUpperCase();
			const isPrivileged = ["ADMIN", "OWNER", "SUPERADMIN"].includes(role);
			const maskedPhone = !phone
			? ""
			: isPrivileged
			? phone
			: "******" + last3;

			await storeValue("pendingServicePreview", {
				customerName: customer.name || "",
				last3,
				maskedPhone,
				serviceName: name,
				priceLabel: priceEuros,
			});

			showModal(Modal_ConfirmService.name);
		} catch (e) {
			console.error("pickService error:", e);
			showAlert("No se pudo preparar la confirmación.", "error");
		}
	},

	// ==============================================================
	// NUEVO FLUJO: staff elige primero servicio, luego cliente
	// ==============================================================

	// 1) Staff hace click en un servicio en la pestaña del personal
	async startFromServiceStaff(row) {
		try {
			// Ajusta el nombre del widget si no es List_visits_1
			const svc =
						row ||
						List_visits_1?.triggeredItem || // cards de la lista
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

			const priceCents =
						svc.priceCents != null
			? Number(svc.priceCents)
			: svc.price_cents != null
			? Number(svc.price_cents)
			: 0;

			const productId = svc.productId || svc.product_id || null;

			// Guardamos SOLO el servicio, sin cliente aún
			await storeValue("pendingService", {
				id,
				name,
				priceCents,
				productId,
			});

			// limpiamos preview anterior por si acaso
			await storeValue("pendingServicePreview", null);

			// abrimos modal para buscar/seleccionar cliente
			showModal(Modal_SelectCustomer.name);
		} catch (e) {
			console.error("startFromServiceStaff error:", e);
			showAlert("No se pudo iniciar el flujo de servicio.", "error");
		}
	},

	// 2) Staff selecciona un cliente en el modal de búsqueda
	async pickCustomerForPending(row) {
		try {
			const service = appsmith.store.pendingService;
			if (!service) {
				showAlert("No hay un servicio pendiente.", "error");
				return;
			}

			// Ajusta el nombre del widget si usas otro (Table/Lista de clientes)
			const cli =
						row ||
						Table1?.triggeredRow ||
						Table1?.selectedRow ||
						null;

			if (!cli) {
				showAlert("Selecciona un cliente.", "error");
				return;
			}

			const customerId = cli.id || cli.customerId || cli.customer_id;
			if (!customerId) {
				showAlert("Cliente inválido.", "error");
				return;
			}

			// Guardamos ID y cargamos detalle para tener el teléfono, etc.
			await storeValue("selCustomerId", customerId);

			const det = await q_cliente_detalle.run({ id: customerId });
			const customer = Array.isArray(det) ? det[0] || {} : det || {};

			await storeValue("scannedCustomer", customer);
			await storeValue("clienteDetalle", customer);

			const phone = (customer.phone || "").toString();
			const last3 = phone.slice(-3) || "";

			const priceCents =
						service.priceCents != null ? Number(service.priceCents) : 0;
			const priceEuros = (priceCents / 100).toFixed(2);

			const role = (appsmith.store.role || "").toUpperCase();
			const isPrivileged = ["ADMIN", "OWNER", "SUPERADMIN"].includes(role);
			const maskedPhone = !phone
			? ""
			: isPrivileged
			? phone
			: "******" + last3;

			await storeValue("pendingServicePreview", {
				customerName: customer.name || "",
				last3,
				maskedPhone,
				serviceName: service.name,
				priceLabel: priceEuros,
			});

			// Cerramos modal de selección y abrimos el de confirmación
			closeModal(Modal_SelectCustomer.name);
			showModal(Modal_ConfirmService.name);
		} catch (e) {
			console.error("pickCustomerForPending error:", e);
			showAlert("No se pudo seleccionar el cliente.", "error");
		}
	},

	// 2.b) Botón "CLIENTE FINAL" en el modal (cliente no quiere registrarse)

	async useWalkinCustomer() {
		try {
			const id = this.WALKIN_CUSTOMER_ID; // <-- usamos el UUID tal cual (string)

			if (!id) {
				showAlert(
					"Configura el ID de CLIENTE FINAL en JS_ServiceVisitFlow_Staff.",
					"error"
				);
				return;
			}

			// Reutilizamos la lógica de selección de cliente
			await this.pickCustomerForPending({ id });
		} catch (e) {
			console.error("useWalkinCustomer error:", e);
			showAlert("No se pudo usar el cliente genérico.", "error");
		}
	},


	// ================== Paso 3: confirmar servicio ==================
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

			// 👇 NO aplicar la regla VIP al cliente genérico "CLIENTE FINAL"
			const isWalkin =
						String(customerId) === String(this.WALKIN_CUSTOMER_ID);

			if (!isWalkin) {
				const canVisit = await VIP.mustBeActiveBeforeVisit(customerId);
				if (!canVisit) return;
			}

			const res = await q_visit_with_progress.run({
				customerId,
				serviceId: service.id,
				serviceName: service.name,
				priceCents,
				notes: VisitAdd.motive(),
				productId: service.productId || null,
			});

			const data = Array.isArray(res) ? res[0] : res;
			if (!data?.customer) {
				showAlert("No se pudo registrar la visita.", "error");
				return;
			}

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
			closeModal(Modal_SelectCustomer.name);

			showAlert("Visita registrada.", "success");
		} catch (e) {
			console.error("confirmService error:", e);
			const errorMessage =
						e?.message || "No se pudo registrar la visita.";
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
