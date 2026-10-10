import { redirect } from 'next/navigation';

/** Old task links open the task inside the AI Shopper workspace. */
export default async function MandatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/agent?id=${encodeURIComponent(id)}`);
}
