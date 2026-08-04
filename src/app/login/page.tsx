"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const redirectTo = params.get("redirect") ?? "/";

  const [modo, setModo] = useState<"login" | "registro">("registro");
  const [nombre, setNombre] = useState("");
  const [correo, setCorreo] = useState("");
  const [password, setPassword] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registroPendienteConfirmacion, setRegistroPendienteConfirmacion] = useState(false);

  async function enviar() {
    setCargando(true);
    setError(null);
    const supabase = createClient();

    try {
      if (modo === "registro") {
        const { error: signUpError } = await supabase.auth.signUp({
          email: correo,
          password,
          options: {
            data: { nombre_completo: nombre || correo },
            emailRedirectTo: `${window.location.origin}/proyectos`,
          },
        });
        if (signUpError) throw signUpError;

        // El perfil en usuarios_plataforma lo crea automáticamente el
        // trigger on_auth_user_created (migración 0005) — no depende de
        // que haya sesión activa en el navegador en este momento.

        setRegistroPendienteConfirmacion(true);
        setCargando(false);
        return; // no hay sesión todavía — no redirigir
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: correo,
          password,
        });
        if (signInError) throw signInError;
      }

      router.push(redirectTo);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de autenticación.");
    } finally {
      setCargando(false);
    }
  }

  return (
    <main className="min-h-screen bg-faro-cream flex items-center justify-center px-6">
      <div className="max-w-sm w-full space-y-5 bg-white p-8 rounded-lg shadow-sm">
        {registroPendienteConfirmacion ? (
          <div className="text-center space-y-3">
            <h1 className="text-xl font-semibold text-faro-navy">Revise su correo</h1>
            <p className="text-sm text-gray-600">
              Le enviamos un enlace de confirmación a <strong>{correo}</strong>. Ábralo para activar su cuenta — al confirmarlo quedará dentro de la plataforma automáticamente.
            </p>
            <p className="text-xs text-gray-400">Si el enlace abre en una pestaña nueva, puede cerrar esta.</p>
          </div>
        ) : (
        <>
        <h1 className="text-xl font-semibold text-faro-navy text-center">
          {modo === "registro" ? "Crear cuenta" : "Iniciar sesión"}
        </h1>

        {modo === "registro" && (
          <input
            className="w-full border rounded-md p-2 text-gray-900 bg-white"
            placeholder="Nombre completo"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
          />
        )}
        <input
          className="w-full border rounded-md p-2 text-gray-900 bg-white"
          type="email"
          placeholder="Correo"
          value={correo}
          onChange={(e) => setCorreo(e.target.value)}
        />
        <input
          className="w-full border rounded-md p-2 text-gray-900 bg-white"
          type="password"
          placeholder="Contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <button
          className="w-full bg-faro-navy text-white rounded-md py-2.5 font-medium disabled:opacity-40"
          onClick={enviar}
          disabled={cargando || !correo || !password}
        >
          {cargando ? "Procesando..." : modo === "registro" ? "Crear cuenta" : "Entrar"}
        </button>

        <button
          className="w-full text-sm text-faro-blue"
          onClick={() => setModo(modo === "registro" ? "login" : "registro")}
        >
          {modo === "registro" ? "¿Ya tiene cuenta? Inicie sesión" : "¿No tiene cuenta? Regístrese"}
        </button>
        </>
        )}
      </div>
    </main>
  );
}
