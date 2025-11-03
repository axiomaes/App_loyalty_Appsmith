export default {
	async run() {
		try {
			// 1) Valida sesión/negocio (si tienes Auth.*)
			if (!(Auth?.isLoggedIn?.() && Auth?.hasBusiness?.())) {
				showAlert("Sesión inválida. Vuelve a iniciar sesión.", "error");
				await Auth?.logout?.();
				navigateTo("Login");
				return;
			}

			// 2) Asegura selCustomerId (desde ?cid si viene)
			const urlCid = appsmith.URL.queryParams?.cid;
			if (urlCid && urlCid !== appsmith.store.selCustomerId) {
				await storeValue('selCustomerId', urlCid);
			}

			if (!appsmith.store.selCustomerId) {
				showAlert("Selecciona un cliente.", "warning");
				return;
			}

			// 3) Ejecuta las queries necesarias (SIN auto-run)
			await getClientVisitsQuery.run();
			await getFallbackVisitsCount.run();

			// 4) Construye el estado de la tarjeta y guárdalo
			const ui = await visitsLogic.processData(); // tu JS actual
			await storeValue('visitsUI', ui);
		} catch (e) {
			console.error("OnLoad.run error:", e);
			showAlert("Error cargando la página.", "error");
		}
	}
}
