import { ChatView } from "@/components/ChatView";

// Full-screen agent workspace, opened in its own tab from the dashboard. No
// dashboard chrome — the conversation gets the room, with a right-side panel
// (Chats · Workflows · Knowledge). Auth is enforced by middleware.
export default async function AgentWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main className="h-screen w-screen overflow-hidden">
      <ChatView agentId={id} standalone />
    </main>
  );
}
