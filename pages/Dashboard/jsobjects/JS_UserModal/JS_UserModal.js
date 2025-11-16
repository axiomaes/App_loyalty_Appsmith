export default {
	// ----- permisos: solo OWNER/ADMIN/SUPERADMIN
	_canManage() {
		return Roles.isOneOf("OWNER", "ADMIN", "SUPERADMIN");
	},

	// helpers de widgets (compat CE 1.89)
	_safeSetValue(w, v) {
		try {
			if (w && typeof w.setValue === "function") {
				w.setValue(v);
			}
		} catch (_) {}
	},

	// ⚠️ solo usamos setSelectedOption, nada de setValue (para que el linter no se queje)
	_safeSelectRole(value, label) {
		try {
			if (typeof SelectRole?.setSelectedOption === "function") {
				// en Select clásico suele bastar con pasar el value
				// si tu widget espera { label, value }, también funciona:
				SelectRole.setSelectedOption({ value, label: label || value });
			}
		} catch (_) {}
	},

	_switchGetValue(sw) {
		try {
			if (!sw) return true;
			if (typeof sw.isSwitchedOn !== "undefined") return !!sw.isSwitchedOn;
			if (typeof sw.value !== "undefined")       return !!sw.value;
			return true;
		} catch (_) {
			return true;
		}
	},

	// ----- abrir en modo crear
	async openCreate() {
		if (!this._canManage()) {
			showAlert("No tienes permisos para gestionar usuarios.", "warning");
			return;
		}

		await storeValue("editingUser", null);

		this._safeSetValue(InputEmail, "");
		this._safeSelectRole("STAFF", "Staff");
		this._safeSetValue(InputFirst, "");
		this._safeSetValue(InputLast, "");
		this._safeSetValue(PhoneInput_user, "");
		this._safeSetValue(SwitchActive, true);

		showModal(Modal_CreateUser.name);
	},

	// ----- abrir en modo editar (row = fila de q_users)
	async openEdit(row) {
		if (!this._canManage()) {
			showAlert("No tienes permisos para gestionar usuarios.", "warning");
			return;
		}

		const u = row || Table_users?.selectedRow || {};
		if (!u?.id) {
			showAlert("Selecciona un usuario.", "warning");
			return;
		}

		await storeValue("editingUser", u);

		this._safeSetValue(InputEmail, u.email || "");
		this._safeSelectRole(u.role || "STAFF", u.role || "Staff");
		this._safeSetValue(
			InputFirst,
			u.first_name || u.firstName || ""
		);
		this._safeSetValue(
			InputLast,
			u.last_name || u.lastName || ""
		);
		this._safeSetValue(PhoneInput_user, u.phone || "");
		this._safeSetValue(SwitchActive, u.isActive !== false);

		showModal(Modal_CreateUser.name);
	},

	// ----- validaciones simples
	_validate() {
		const email = (InputEmail?.text || "").trim().toLowerCase();
		const role =
					SelectRole?.selectedOptionValue ||
					SelectRole?.value ||
					"STAFF";

		if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			showAlert("Email inválido.", "error");
			return null;
		}
		if (!role) {
			showAlert("Selecciona un rol.", "error");
			return null;
		}

		const first    = (InputFirst?.text || "").trim();
		const last     = (InputLast?.text  || "").trim();
		const phone    = (PhoneInput_user?.text || PhoneInput_user?.value || "").trim();
		const isActive = this._switchGetValue(SwitchActive);

		return { email, role, first, last, phone, isActive };
	},

	async save() {
		try {
			if (!this._canManage()) {
				showAlert("Sin permisos.", "warning");
				return;
			}

			const data = this._validate();
			if (!data) return;

			// Duplicados
			const dup = await q_user_email_exists.run({ email: data.email });
			if (
				Array.isArray(dup) &&
				dup.length > 0 &&
				!appsmith.store?.editingUser?.id
			) {
				showAlert("Ese email ya existe en este negocio.", "warning");
				return;
			}

			const editingId = appsmith.store?.editingUser?.id;

			if (editingId) {
				// EDITAR
				await q_user_update.run({
					id: editingId,
					role: data.role,
					first_name: data.first,
					last_name: data.last,
					phone: data.phone,
					is_active: data.isActive,
					updated_by_email:
					appsmith.store?.userEmail || appsmith.user?.email || ""
				});
			} else {
				// CREAR
				const newPass = (InputPassword?.text || "").trim();
				if (!newPass || newPass.length < 8) {
					showAlert(
						"Define una contraseña de al menos 8 caracteres.",
						"warning"
					);
					return;
				}

				await q_create_user.run({
					email: data.email,
					new_pass: newPass,
					role: data.role,
					first_name: data.first,
					last_name: data.last,
					phone: data.phone,
					created_by_email:
					appsmith.store?.userEmail || appsmith.user?.email || ""
				});
			}

			if (typeof q_users?.run === "function") {
				await q_users.run();
			}

			closeModal(Modal_CreateUser.name);
			await storeValue("editingUser", null);
			showAlert("Usuario guardado.", "success");
		} catch (e) {
			console.error("User save error:", e);
			showAlert(e?.message || "No se pudo guardar.", "error");
		}
	},

	cancel() {
		closeModal(Modal_CreateUser.name);
	}
};
