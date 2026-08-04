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

  async function enviar() {
    setCargando(true);
    setError(null);
    const supabase = createClient();

    try {
      if (modo === "registro") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: correo,
          password,
        });
        if (signUpError) throw signUpError;

        // Crear el perfil en usuarios_plataforma (RLS permite insert propio)
        if (data.user) {
          await supabase.from("usuarios_plataforma").insert({
            id: data.user.id,
            nombre_completo: nombre || correo,
            correo,
          });
        }
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
      </div>
    </main>
  );
}
