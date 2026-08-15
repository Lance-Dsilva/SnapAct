import MemoryClient from "@/components/MemoryClient";

export default async function MemoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <MemoryClient memoryId={id} />;
}
