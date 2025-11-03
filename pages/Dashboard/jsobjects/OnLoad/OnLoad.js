export default {
	async run() {
		try {
			// 1) Sesión / negocio
			if (!(Auth?.isLoggedIn?.() && Auth?.hasBusiness?.())) {
				showAlert("Sesión inválida. Vuelve a iniciar sesión.", "error");
				await Auth?.logout?.();
				navigateTo("Login");
				return;
			}

			const bid =
						(typeof Auth?.businessId === "function" && Auth.businessId()) ||
						appsmith.store?.businessId ||
						null;

			// 2) Lee ?cid si viene (pero NO bloquea el flujo si no hay selección)
			const urlCid = appsmith.URL.queryParams?.cid || null;
			if (urlCid && urlCid !== appsmith.store?.selCustomerId) {
				await storeValue("selCustomerId", urlCid);
			}

			// 3) Refresca SIEMPRE el listado de clientes (para ver nuevos al instante)
			if (typeof q_clientes_listado?.run === "function") {
				await q_clientes_listado.run({ bid });
			}

			// 4) Si hay cliente seleccionado, refresca sus datos auxiliares
			const cid = appsmith.store?.selCustomerId || urlCid || null;
			if (cid) {
				await Promise.allSettled([
					getClientVisitsQuery?.run?.(),
					getFallbackVisitsCount?.run?.()
				]);
				try {
					const ui = await visitsLogic?.processData?.();
					if (ui) await storeValue("visitsUI", ui);
				} catch (e) {
					console.warn("visits UI build warn:", e);
				}
			}
		} catch (e) {
			console.error("OnLoad.run error:", e);
			showAlert("Error cargando la página.", "error");
		}
	}
};
