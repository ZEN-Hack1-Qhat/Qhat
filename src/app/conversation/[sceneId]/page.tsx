import { notFound } from "next/navigation";
import { getScene } from "@/lib/scenes";
import { ConversationClient } from "./ConversationClient";

export default function ConversationPage({
  params,
}: {
  params: { sceneId: string };
}) {
  const scene = getScene(params.sceneId);
  if (!scene) notFound();
  return <ConversationClient scene={scene} />;
}
