export default {
	// ----- permisos: solo OWNER/ADMIN/SUPERADMIN pueden crear/editar
	_canManage() {
		return Roles.isOneOf('OWNER', 'ADMIN', 'SUPERADMIN');
	},

	// ----- abrir en modo crear
	async openCreate() {
		if (!this._canManage()) {
			showAlert('No tienes permisos para gestionar usuarios.', 'warning');
			return;
		}
		await storeValue('editingUser', null);
		// Limpia campos
		InputEmail.setValue('');
		SelectRole.setSelectedOption('STAFF');
		InputFirst.setValue('');
		InputLast.setValue('');
		PhoneInput_user.setValue('');
		SwitchActive.setSwitchedOn(true);
		openModal('Modal_CreateUser');
	},

	// ----- abrir en modo editar (row = fila de q_user)
	async openEdit(row) {
		if (!this._canManage()) {
			showAlert('No tienes permisos para gestionar usuarios.', 'warning');
			return;
		}
		const u = row || Table_users?.selectedRow || {};
		if (!u?.id) {
			showAlert('Selecciona un usuario.', 'warning'); return;
		}
		await storeValue('editingUser', u);
		InputEmail.setValue(u.email || '');
		SelectRole.setSelectedOption(u.role || 'STAFF');
		InputFirst.setValue(u.firstName || '');
		InputLast.setValue(u.lastName || '');
		PhoneInput_user.setValue(u.phone || '');
		SwitchActive.setSwitchedOn(u.isActive !== false);
		openModal('Modal_CreateUser');
	},

	// ----- validaciones simples
	_validate() {
		const email = (InputEmail.text || '').trim().toLowerCase();
		const role  = SelectRole.selectedOptionValue;
		if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			showAlert('Email inválido.', 'error'); return false;
		}
		if (!role) {
			showAlert('Selecciona un rol.', 'error'); return false;
		}
		return true;
	},

	async save() {
		try {
			if (!this._canManage()) {
				showAlert('Sin permisos.', 'warning'); return;
			}
			if (!this._validate()) return;

			// Duplicados
			const dup = await q_user_email_exists.run();
			if (Array.isArray(dup) && dup.length > 0) {
				showAlert('Ese email ya existe en este negocio.', 'warning'); return;
			}

			const editing = appsmith.store.editingUser?.id;
			if (editing) {
				await q_user_update.run();
			} else {
				await q_user_insert.run();
			}
			await q_user.run();
			closeModal('Modal_CreateUser');
			showAlert('Usuario guardado.', 'success');
		} catch (e) {
			console.error('User save error:', e);
			showAlert(e?.message || 'No se pudo guardar.', 'error');
		}
	},

	cancel() {
		closeModal('Modal_CreateUser');
	}
};
