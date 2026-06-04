import { Sidebar } from "@/components/Sidebar";
import { getCurrentAccount } from "@/lib/account";
import { isLiveMode } from "@/lib/freelancer";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { account } = await getCurrentAccount();
  return (
    <div className="flex min-h-screen">
      <div className="hidden w-56 shrink-0 md:block">
        <div className="fixed h-screen w-56">
          <Sidebar accountName={account.name} mode={isLiveMode() ? "live" : "mock"} />
        </div>
      </div>
      <main className="flex-1 px-4 py-6 sm:px-8">{children}</main>
    </div>
  );
}
