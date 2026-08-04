import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import CerrarSesionBoton from "./CerrarSesionBoton";

export default async function Navbar() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let nombre: string | null = null;
  if (user) {
    const { data: perfil } = await supabase
      .from("usuarios_plataforma")
      .select("nombre_completo")
      .eq("id", user.id)
      .single();
    nombre = perfil?.nombre_completo ?? user.email ?? null;
  }

  return (
    <nav className="bg-faro-navy text-faro-cream border-b border-white/10">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link href="/" className="font-semibold tracking-wide text-sm">
          FARO
        </Link>

        <div className="flex items-center gap-5 text-sm">
          {user ? (
            <>
              <Link href="/proyectos" className="hover:text-faro-blue transition-colors">
                Mis proyectos
              </Link>
              <Link href="/diagnostico" className="hover:text-faro-blue transition-colors">
                Nuevo diagnóstico
              </Link>
              <span className="text-faro-cream/50 hidden sm:inline">{nombre}</span>
              <CerrarSesionBoton />
            </>
          ) : (
            <>
              <Link href="/login" className="hover:text-faro-blue transition-colors">
                Iniciar sesión
              </Link>
              <Link
                href="/login"
                className="bg-faro-blue text-white px-3 py-1.5 rounded-md hover:opacity-90 transition-opacity"
              >
                Crear cuenta
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
