export default {
	async run() {
		try {
			// 0) Sesión válida
			if (!(Auth?.isLoggedIn?.() && Auth?.hasBusiness?.())) {
				showAlert("Sesión inválida. Vuelve a iniciar sesión.", "error");
				await Auth?.logout?.();
				navigateTo("Login");
				return;
			}

			// 1) businessId en store (antes de pintar nada)
			let bid =
					(typeof Auth?.businessId === "function" && Auth.businessId()) ||
					appsmith.store?.businessId || null;

			if (!bid) {
				const wait = (ms) => new Promise(r => setTimeout(r, ms));
				const t0 = Date.now();
				while (!bid && Date.now() - t0 < 3000) {
					bid =
						(typeof Auth?.businessId === "function" && Auth.businessId()) ||
						appsmith.store?.businessId || null;
					if (bid) break;
					await wait(120);
				}
			}
			await storeValue("businessId", bid);

			// 2) Cargar configuración de WhatsApp (mini-tabla -> store)
			//    No falla si aún no existen las queries; hace fallback a defaults.
			try {
				if (typeof JS_WaSettings?.load === "function") {
					await JS_WaSettings.load();
				} else {
					// Fallback ultra seguro por si el JS no está cargado todavía
					await storeValue("ownerPhone", appsmith.store?.ownerPhone || "+34682686605");
					await storeValue("wa_mode",     appsmith.store?.wa_mode     || "vip");
					await storeValue("wa_bi_approved", appsmith.store?.wa_bi_approved ?? false);
				}
			} catch (e) {
				console.warn("WA settings load warn:", e);
				// defaults para no bloquear la página
				await storeValue("ownerPhone", appsmith.store?.ownerPhone || "+34682686605");
				await storeValue("wa_mode",     appsmith.store?.wa_mode     || "vip");
				await storeValue("wa_bi_approved", appsmith.store?.wa_bi_approved ?? false);
			}

			// 3) Refrescos de datos principales
			if (typeof q_clientes_listado?.run === "function") {
				await q_clientes_listado.run({ bid });
			}
			if (typeof q_kpi_total_clientes?.run === "function") {
				await q_kpi_total_clientes.run({ bid });
			}

			// (Opcional) cualquier otro preload que ya uses…
			// if (typeof q_algo_mas?.run === "function") { await q_algo_mas.run({ bid }); }

		} catch (e) {
			console.error("OnLoad.run error:", e);
			showAlert("Error cargando la página.", "error");
		}
	}
};
