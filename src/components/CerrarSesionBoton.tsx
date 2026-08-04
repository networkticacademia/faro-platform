"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function CerrarSesionBoton() {
  const router = useRouter();

  async function cerrarSesion() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <button onClick={cerrarSesion} className="text-faro-cream/70 hover:text-white transition-colors">
      Cerrar sesión
    </button>
  );
}
