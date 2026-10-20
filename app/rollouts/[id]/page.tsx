import { RolloutDetail } from "@/components/rollout-detail";
export default async function RolloutPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <RolloutDetail id={id} />; }
