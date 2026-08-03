import { createClient } from "@/lib/supabase/server";
import DiagnosticoForm from "./DiagnosticoForm";

export default async function DiagnosticoPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <main className="min-h-screen bg-faro-cream py-12 px-6">
      <DiagnosticoForm autenticado={!!user} />
    </main>
  );
}
