export default {
  // === Generador de contraseñas seguras ===
  genPwd(len = 10) {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789@#%";
    let s = "";
    for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  },

  // === Resetear contraseña ===
  async resetPassword(userId) {
    if (!userId) return showAlert("Falta ID de usuario", "error");

    try {
      const newPass = this.genPwd(10);

      // 1) Actualiza hash en BD
      await q_reset_password.run({ user_id: userId, new_pass: newPass });

      // 2) Guarda la contraseña temporal en el store (mapa por userId)
      const prev = appsmith.store.tempPassMap || {};
      await storeValue("tempPassMap", { ...prev, [userId]: newPass });

      // 3) Refresca la lista
      await q_users.run();

      showAlert("Contraseña reseteada correctamente.", "success");
    } catch (e) {
      console.error("resetPassword error:", e);
      showAlert("Error al resetear contraseña.", "error");
    }
  },

  // === Crear nuevo usuario (usa flags del q_create_user recomendado) ===
  async createUser() {
    const email = (InputEmail.text || "").trim().toLowerCase();
    const role  = ((SelectRole.selectedOptionValue || "BARBER").trim().toUpperCase());

    // Validaciones básicas en UI
    if (!email) return showAlert("Ingresa un correo.", "warning");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return showAlert("Correo inválido.", "warning");
    }
    if (!["BARBER","ADMIN","OWNER","SUPERADMIN"].includes(role)) {
      return showAlert("Rol no permitido.", "warning");
    }

    try {
      const tempPass = this.genPwd(12);

      // Ejecuta el query con parámetros
      const res = await q_create_user.run({
        email,
        role,
        new_pass: tempPass,
      });

      // El query recomendado devuelve flags simples:
      // ok_email, ok_pass, ok_role, inserted, duplicate_email, row
      if (!res?.ok_email) return showAlert("Correo no válido.", "error");
      if (!res?.ok_pass)  return showAlert("La contraseña debe tener al menos 8 caracteres.", "error");
      if (!res?.ok_role)  return showAlert("Rol no permitido.", "error");

      if (res.inserted && res.row?.id) {
        // Guarda la pass temporal asociada al nuevo usuario
        const prev = appsmith.store.tempPassMap || {};
        await storeValue("tempPassMap", { ...prev, [res.row.id]: tempPass });

        // Refresca la tabla / limpia formulario / cierra modal
        await q_users.run();
        showAlert(`Usuario creado: ${email}`, "success");
        if (typeof closeModal === "function" && Modal_CreateUser?.name) {
          closeModal(Modal_CreateUser.name);
        }
        if (typeof resetWidget === "function") {
          resetWidget("InputEmail");
          resetWidget("InputPassword"); // si lo usas
          resetWidget("SelectRole");
        }
        return;
      }

      if (res.duplicate_email) {
        return showAlert("Ese correo ya está registrado.", "info");
      }

      // Si no insertó y no marcó duplicado, algo inesperado
      showAlert("No se pudo crear el usuario.", "error");
    } catch (e) {
      console.error("createUser error:", e);
      const msg = e?.message || "Error al crear usuario.";
      if (/duplicate/i.test(msg)) {
        showAlert("Ese correo ya existe.", "warning");
      } else {
        showAlert(msg, "error");
      }
    }
  },

  // === Obtener la contraseña temporal (para columna en tabla) ===
  tempPassFor(userId) {
    return (appsmith.store.tempPassMap || {})[userId] || "";
  }
};
