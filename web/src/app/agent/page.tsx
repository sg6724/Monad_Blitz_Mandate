'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { draftId as draftIdOf, findByDraft, type Draft, type LocalStep, type Question } from '@taskpay/sdk';
import { useWallet, ConnectButton } from '@/components/WalletPanel';
import { TaskCard } from '@/components/TaskCard';
import { MandatePanel } from '@/components/MandatePanel';
import { Timeline } from '@/components/Timeline';
import { ArrowRight, ShieldIcon, SparkIcon } from '@/components/Icons';
import { appendSteps, moveSteps, readSteps, saveTaskMeta, stepsHash, useOwnerActions } from '@/lib/client';
import { pc, useMandate } from '@/lib/useMandate';

type Msg = { role: 'user' | 'agent'; text: string; tone?: 'ok' | 'bad' | 'warn' | 'guard' };

const EXAMPLES = ['Get me something warm for the monsoon', 'Buy the Utility Hoodie, max 1.3 MON', 'I need a cap'];

function toneOf(s: LocalStep): Msg['tone'] {
  if (s.kind === 'injection') return 'bad';
  if (s.kind === 'guard') return 'guard';
  if (s.text.includes('blocked') || s.text.includes('Blocked')) return 'bad';
  if (s.text.startsWith('Paid')) return 'ok';
  return undefined;
}

function AgentInner() {
  const params = useSearchParams();
  const w = useWallet();
  const owner = useOwnerActions();
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: 'agent', text: "Tell me what you need from NEXUS. I'll ask for anything missing, then you lock a budget I can't go over." },
  ]);
  const [input, setInput] = useState('');
  const [partial, setPartial] = useState<Partial<Draft> | undefined>();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [mandateId, setMandateId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [compromised, setCompromised] = useState(false);
  const [surge, setSurge] = useState(false);
  const [, force] = useState(0);
  const { data } = useMandate(mandateId ? BigInt(mandateId) : undefined);
  const bottom = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  useEffect(() => bottom.current?.scrollIntoView({ behavior: 'smooth' }), [msgs, questions, draft]);
  useEffect(() => {
    const t = params.get('task');
    if (t && !started.current) {
      started.current = true;
      send(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const say = (m: Msg) => setMsgs((x) => [...x, m]);

  async function send(text: string, answers?: Record<string, string>) {
    if (!text.trim() || busy) return;
    const next = [...msgs, { role: 'user' as const, text }];
    setMsgs(next);
    setInput('');
    setQuestions([]);
    setBusy('Thinking');
    try {
      const r = await fetch('/api/agent/plan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: next.map(({ role, text }) => ({ role, text })), partial, answers }),
      }).then((x) => x.json());
      if (r.error) throw new Error(r.error);
      setPartial(r.partial);
      say({ role: 'agent', text: r.reply });
      setQuestions(r.questions ?? []);
      if (r.draft) setDraft(r.draft);
    } catch (e: any) {
      say({ role: 'agent', text: `Something went wrong: ${e.message}`, tone: 'bad' });
    } finally {
      setBusy(null);
    }
  }

  async function lock() {
    if (!draft) return;
    try {
      setBusy('Waiting for MetaMask');
      const r = await owner.lock(draft);
      const did = draftIdOf(draft);
      const id = await findByDraft(pc, did);
      const sid = id.toString();
      appendSteps(did, [{ at: Math.floor(Date.now() / 1000), kind: 'note', text: `Drafted "${draft.task}" · ${draft.item} · up to ${draft.budget} MON` }]);
      moveSteps(did, sid);
      saveTaskMeta(sid, { item: draft.item!, purpose: `${draft.task} — ${draft.item}`, draftId: did });
      setMandateId(sid);
      say({ role: 'agent', text: `Locked ${draft.budget} MON in task #${sid} (confirmed in ${(r.ms / 1000).toFixed(1)} s). Shopping now…`, tone: 'ok' });
      await runPhase(sid, 'shop');
    } catch {
      setBusy(null);
    }
  }

  async function runPhase(id: string, phase: 'shop' | 'resume' | 'close') {
    setBusy(phase === 'close' ? 'Closing the task' : 'Agent is shopping');
    try {
      const r = await fetch('/api/agent/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mandateId: id,
          item: draft?.item,
          purpose: `${draft?.task} — ${draft?.item}`,
          compromised,
          surge,
          phase,
          logHash: phase === 'close' ? stepsHash(id) : undefined,
        }),
      }).then((x) => x.json());
      const events: LocalStep[] = r.events ?? [];
      appendSteps(id, events);
      force((n) => n + 1);
      for (const e of events) say({ role: 'agent', text: e.text, tone: toneOf(e) });
      if (r.outcome === 'paid') {
        await runPhase(id, 'close');
        return;
      }
      if (r.outcome === 'closed') say({ role: 'agent', text: 'Done. Your order is placed and the unspent MON is back in your wallet.', tone: 'ok' });
      if (r.outcome === 'need_topup') say({ role: 'agent', text: 'Approve or decline the top-up on the right. I can’t raise the budget myself.', tone: 'warn' });
      if (r.outcome === 'need_confirm') say({ role: 'agent', text: 'TaskGuard wants your OK before this payment. Confirm or reject it on the right.', tone: 'warn' });
      if (r.outcome === 'blocked') say({ role: 'agent', text: 'TaskGuard blocked the payment. Cancel the task to get your MON back.', tone: 'bad' });
    } catch (e: any) {
      say({ role: 'agent', text: `Agent error: ${e.message}`, tone: 'bad' });
    } finally {
      setBusy(null);
    }
  }

  function onOwnerAction(what: string) {
    if (!mandateId) return;
    const t = Math.floor(Date.now() / 1000);
    const text: Record<string, string> = {
      topup: 'You approved the top-up. Retrying the purchase.',
      decline: 'You declined the top-up.',
      confirm: 'You confirmed the payment.',
      reject: 'You rejected the payment.',
      cancel: 'You cancelled the task. Unspent MON refunded.',
      freeze: 'You froze the agent. All its open tasks were refunded.',
      reclaim: 'Expired task refunded.',
      unfreeze: 'You unfroze the task.',
    };
    appendSteps(mandateId, [{ at: t, kind: 'note', text: text[what] ?? what }]);
    say({ role: 'user', text: text[what] ?? what });
    if (what === 'topup') setTimeout(() => runPhase(mandateId, 'resume'), 1500);
    if (what === 'confirm') setTimeout(() => runPhase(mandateId, 'close'), 1500);
  }

  function reset() {
    setMsgs([{ role: 'agent', text: 'New task. What do you need?' }]);
    setPartial(undefined);
    setQuestions([]);
    setDraft(null);
    setMandateId(null);
  }

  return (
    <div className="mx-auto max-w-[1280px] px-6 py-10 md:px-10">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <div className="label">AI Shopper · TaskPay</div>
          <h1 className="display mt-3 text-[46px] md:text-[60px]">Give your AI a task,<br />not your wallet.</h1>
        </div>
        <div className="flex flex-col gap-2 text-[12px]">
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={surge} onChange={(e) => setSurge(e.target.checked)} />
            <span className="label">Surge pricing (+15%)</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={compromised} onChange={(e) => setCompromised(e.target.checked)} />
            <span className="label text-[var(--color-bad)]">Compromised agent (TaskGuard off)</span>
          </label>
        </div>
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1.1fr_1fr]">
        {/* Chat */}
        <section className="flex min-h-[560px] flex-col border border-black">
          <div className="flex items-center justify-between border-b border-black px-5 py-3">
            <span className="label inline-flex items-center gap-2">
              <SparkIcon className="h-4 w-4" /> NEXUS shopping agent
            </span>
            <button className="label text-neutral-500" onClick={reset}>
              New task
            </button>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto p-5" style={{ maxHeight: 620 }}>
            {msgs.map((m, i) => (
              <div key={i} className={`rise flex ${m.role === 'user' ? 'justify-end' : ''}`}>
                <div
                  className={`max-w-[88%] px-4 py-2.5 text-[13px] leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-black text-white'
                      : m.tone === 'bad'
                        ? 'border-l-2 border-[var(--color-bad)] bg-red-50'
                        : m.tone === 'ok'
                          ? 'border-l-2 border-[var(--color-ok)] bg-emerald-50'
                          : m.tone === 'warn'
                            ? 'border-l-2 border-[var(--color-warn)] bg-amber-50'
                            : m.tone === 'guard'
                              ? 'border-l-2 border-black bg-[var(--color-mist)]'
                              : 'bg-[var(--color-mist)]'
                  }`}
                >
                  {m.tone === 'guard' && <ShieldIcon className="mr-1.5 inline h-3.5 w-3.5 -translate-y-px" />}
                  {m.text}
                </div>
              </div>
            ))}
            {questions.map((q) => (
              <div key={q.field} className="rise">
                <div className="label mb-2 text-neutral-500">{q.text}</div>
                <div className="flex flex-wrap gap-2">
                  {q.options.map((o) => (
                    <button key={o} className="border border-black px-3 py-1.5 text-[12px] hover:bg-black hover:text-white" onClick={() => send(o, { [q.field]: o })}>
                      {o}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {busy && <div className="label animate-pulse text-neutral-500">{busy}…</div>}
            <div ref={bottom} />
          </div>
          <form
            className="flex border-t border-black"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <input className="field h-12 border-0" placeholder="e.g. buy me a black hoodie under 1.3 MON" value={input} onChange={(e) => setInput(e.target.value)} disabled={!!busy || !!mandateId} />
            <button className="flex w-14 items-center justify-center bg-black text-white disabled:opacity-40" disabled={!!busy || !!mandateId} aria-label="Send">
              <ArrowRight className="h-5 w-5" />
            </button>
          </form>
          {!draft && (
            <div className="flex flex-wrap gap-2 border-t border-[var(--color-fog)] p-3">
              {EXAMPLES.map((e) => (
                <button key={e} className="text-[11px] text-neutral-600 underline" onClick={() => send(e)}>
                  {e}
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Card / mandate */}
        <section className="space-y-6">
          {!draft && !mandateId && (
            <div className="bg-[var(--color-mist)] p-8">
              <div className="label">How it works</div>
              <ol className="mt-5 space-y-4 text-[13px]">
                {[
                  'You say what you want. The agent asks for anything missing.',
                  'A task card appears: store, item, budget, deadline.',
                  'You lock the budget in MetaMask. One confirmation.',
                  'The agent can only pay NEXUS, within the cap, before the deadline.',
                  'Unspent MON comes back. Every step is on the timeline.',
                ].map((t, i) => (
                  <li key={i} className="flex gap-4">
                    <span className="display text-[20px]">0{i + 1}</span>
                    <span className="pt-1">{t}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {draft && !mandateId && (
            <TaskCard
              draft={draft}
              action={
                !w.isConnected || w.wrongChain ? (
                  <ConnectButton className="btn w-full" />
                ) : (
                  <div className="space-y-2">
                    <button className="btn w-full" disabled={!!busy} onClick={lock}>
                      {owner.pending === 'lock' ? 'Confirm in MetaMask…' : `Lock ${draft.budget} MON`}
                    </button>
                    {w.mon !== undefined && w.mon < Number(draft.budget) + 0.05 && (
                      <p className="text-[12px] text-[var(--color-bad)]">You have {w.mon.toFixed(3)} MON. Add funds from the wallet menu (top right).</p>
                    )}
                    {owner.error && <p className="text-[12px] text-[var(--color-bad)]">{owner.error}</p>}
                  </div>
                )
              }
            />
          )}

          {mandateId && data?.m && (
            <div className="space-y-8 border border-black p-6">
              <MandatePanel m={data.m} onAction={onOwnerAction} />
              <Timeline m={data.m} entries={data.h} steps={readSteps(mandateId)} />
              <Link href={`/mandate/${mandateId}`} className="label inline-flex items-center gap-2">
                Open task page <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default function AgentPage() {
  return (
    <Suspense>
      <AgentInner />
    </Suspense>
  );
}
