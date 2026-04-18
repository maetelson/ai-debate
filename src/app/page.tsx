import { DebateApp } from "@/components/debate-app";
import { listStoredSessions } from "@/lib/storage/app-storage";

export default async function Home() {
  const initialSessions = await listStoredSessions();

  return <DebateApp initialSessions={initialSessions} />;
}
