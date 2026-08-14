"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NODOS = [
  { slug: "/dashboard", label: "📊 Dashboard" },
  { slug: "", label: "RUTA" },
  { slug: "/nova", label: "NOVA" },
  { slug: "/fuentes", label: "Fuentes" },
  { slug: "/objetivos", label: "Objetivos" },
  { slug: "/marco-referencial", label: "Marco Referencial" },
  { slug: "/metodologia", label: "Metodología" },
  { slug: "/impactos-delimitacion", label: "Impactos y Delimitación" },
  { slug: "/presupuesto", label: "💰 Presupuesto" },
] as const;

export default function NavegacionNodos({ projectId }: { projectId: string }) {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-10 bg-white border-b mb-6 -mx-4 px-4 sm:mx-0 sm:px-0 sm:rounded-lg sm:border sm:mb-4">
      <div className="flex items-center justify-between gap-1 overflow-x-auto py-2 px-1">
        <div className="flex items-center gap-1">
          {NODOS.map((n) => {
            const href = `/formulacion/${projectId}${n.slug}`;
            const activo = pathname === href;
            return (
              <Link
                key={n.slug}
                href={href}
                className={`text-xs px-3 py-1.5 rounded-md whitespace-nowrap font-medium transition-colors ${
                  activo
                    ? "bg-faro-navy text-white"
                    : "text-faro-navy border border-transparent hover:border-faro-navy"
                }`}
              >
                {n.label}
              </Link>
            );
          })}
        </div>
        <Link
          href="/acerca-de-faro"
          className="text-xs px-3 py-1.5 rounded-md whitespace-nowrap font-medium text-gray-400 hover:text-faro-navy"
        >
          ℹ️ Acerca de FARO
        </Link>
      </div>
    </nav>
  );
}
