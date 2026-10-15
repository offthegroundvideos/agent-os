import { redirect } from "next/navigation";

// OTG-OS opens on its dashboard; the agent workspace lives at /agents.
export default function Home() {
  redirect("/os");
}
