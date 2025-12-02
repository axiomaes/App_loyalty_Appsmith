export default {
	// Cambia esto si la IP del kiosko es otra
	PRINT_AGENT_URL: "http://100.81.125.9:9101",

	// 1) Probar conectividad: solo hace GET y muestra la respuesta
	async ping() {
		try {
			const res = await fetch(this.PRINT_AGENT_URL, {
				method: "GET",
			});

			const text = await res.text();
			console.log("PING print-agent:", text);
			showAlert("Ping OK al print-agent: " + text, "success");
		} catch (e) {
			console.error("Error ping print-agent:", e);
			showAlert("No se pudo hacer ping al print-agent", "error");
		}
	},

	// 2) Imprimir ticket de visita (versión de prueba)
	async printVisitTicket({ visitId, customerId, paymentMethod, serviceName, priceCents }) {
		try {
			const payload = {
				type: "VISIT_TICKET",
				visitId,
				customerId,
				paymentMethod,
				serviceName,
				priceCents,
			};

			console.log("Enviando a print-agent:", payload);

			const res = await fetch(this.PRINT_AGENT_URL + "/print", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(payload),
			});

			const text = await res.text();
			console.log("Respuesta print-agent:", text);
			showAlert("Ticket enviado a la impresora.", "success");
		} catch (e) {
			console.error("Error imprimiendo en print-agent:", e);
			showAlert("No se pudo imprimir el ticket en la impresora local.", "error");
		}
	},
};
