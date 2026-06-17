import ArchivePageClient from "./ArchivePageClient";
import { getPublicMessages } from "@/lib/messages";

export default async function Home() {
  const messages = await getPublicMessages();

  return <ArchivePageClient messages={messages} />;
}
