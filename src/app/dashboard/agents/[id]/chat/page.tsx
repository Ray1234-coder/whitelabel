import { ChatView } from "@/components/ChatView";

export default async function AgentChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ChatView agentId={id} />;
}
