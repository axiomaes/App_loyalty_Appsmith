export default {
	login: async () => {
		try {
			const res = await API_KioskLogin.run();

			if (!res || !res.access_token) {
				showAlert("Credenciales incorrectas o usuario no permitido", "error");
				return;
			}

			const token = res.access_token;
			const user  = res.user || {};

			// Guardar sesión completa
			await Promise.all([
				storeValue("jwt", token),
				storeValue("userId", user.id || null),
				storeValue("role", (user.role || "STAFF").toUpperCase()),
				storeValue("userEmail", user.email || null),
				storeValue("businessId", user.businessId || null),
				storeValue("businessName", user.businessName || null),
				storeValue("selectedBusinessId", null)
			]);

			showAlert(`Bienvenido a ${user.businessName}`, "success");
			navigateTo("Dashboard");

		} catch (e) {
			showAlert("Error de conexión con el servidor", "error");
			console.error(e);
		}
	}
};
