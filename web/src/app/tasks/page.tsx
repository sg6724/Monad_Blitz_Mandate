import { redirect } from 'next/navigation';

/** Tasks now live in the AI Shopper workspace. */
export default function TasksPage() {
  redirect('/agent');
}
