import { BoardPanel } from "@/components/BoardPanel";
import { Chat } from "@/components/Chat";
import { Nav } from "@/components/site/Nav";

export const metadata = {
  title: "Console — Skylark BI",
};

export default function Console() {
  return (
    <div className="relative z-[1] flex h-dvh flex-col">
      <Nav variant="app" />
      <div className="mx-auto flex min-h-0 w-full max-w-[1180px] flex-1 flex-col gap-6 px-5 py-6 lg:flex-row lg:gap-9">
        <BoardPanel />
        <main className="flex min-h-0 flex-1 flex-col">
          <Chat />
        </main>
      </div>
    </div>
  );
}
