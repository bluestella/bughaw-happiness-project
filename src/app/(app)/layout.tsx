import { Sidebar } from "@/components/Sidebar";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole } from "@/utils/supabase/role";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const role = await getCurrentUserRole(supabase);

  return (
    <div className="lg:flex min-h-screen">
      <Sidebar role={role} email={user?.email} />
      <div className="flex-1 min-w-0">
        {/* Desktop header — account controls; mobile has its own top bar in Sidebar */}
        <header className="hidden lg:flex sticky top-0 z-10 items-center justify-end gap-3 border-b border-line bg-paper/90 px-6 py-2.5 backdrop-blur">
          <span className="truncate text-xs text-ink-soft">{user?.email}</span>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="rounded-md border border-line bg-white px-3 py-1.5 text-xs font-semibold text-ink shadow-card transition-colors hover:border-ink-soft"
            >
              Sign out
            </button>
          </form>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      </div>
    </div>
  );
}
