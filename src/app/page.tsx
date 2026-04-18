import { DebateApp } from "@/components/debate-app";
import { listSessions } from "@/lib/persistence";

export default async function Home() {
  const initialSessions = await listSessions();

  return <DebateApp initialSessions={initialSessions} />;
}
