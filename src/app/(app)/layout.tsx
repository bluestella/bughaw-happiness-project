import { Sidebar } from "@/components/Sidebar";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 min-w-0">
        <header className="sticky top-0 z-10 flex items-center justify-end gap-3 border-b border-line bg-paper/90 backdrop-blur px-6 py-2.5">
          <span className="text-xs text-ink-soft truncate">{user?.email}</span>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="text-xs border border-line rounded-md px-3 py-1.5 text-ink hover:border-ink-soft"
            >
              Sign out
            </button>
          </form>
        </header>
        <main className="px-6 py-8 max-w-6xl mx-auto">{children}</main>
      </div>
    </div>
  );
}
