import { notFound } from "next/navigation";
import { getScene } from "@/lib/scenes";
import { ReviewClient } from "./ReviewClient";

export default function ReviewPage({
  params,
}: {
  params: { sceneId: string };
}) {
  const scene = getScene(params.sceneId);
  if (!scene) notFound();
  return <ReviewClient scene={scene} />;
}
