'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { describeEntry, draftId as draftIdOf, explorerTx, findByDraft, mon, type Draft, type LocalStep, type Question } from '@taskpay/sdk';
import { useWallet, ConnectButton } from '@/components/WalletPanel';
import { TaskCard } from '@/components/TaskCard';
import { statusOf } from '@/components/MandatePanel';
import { TaskPanel } from '@/components/TaskPanel';
import { ago, friendly, rollUp } from '@/lib/friendly';
import { ArrowRight, ShieldIcon, SparkIcon } from '@/components/Icons';
import { NAMES, appendSteps, moveSteps, readChat, readSteps, readTaskMeta, saveChat, saveTaskMeta, stepsHash, useOwnerActions, type ChatMsg } from '@/lib/client';
import { pc, useMandate, useMyMandates } from '@/lib/useMandate';

const EXAMPLES = ['Get me something warm for the monsoon', 'Buy the Utility Hoodie, max 1.3 MON', 'I need a cap'];
const AGENT_ID = process.env.NEXT_PUBLIC_AGENT_ID ?? '2100';
const GREETING: ChatMsg = { role: 'agent', text: "Tell me what you need from BlockMart. I'll ask for anything missing, then you lock a budget I can't go over." };
const now = () => Math.floor(Date.now() / 1000);
/** Keeps the task in the URL without a router navigation, which would remount the page mid-run. */
const setUrl = (u: string) => window.history.replaceState(null, '', u);

function toneOf(s: LocalStep): ChatMsg['tone'] {
  if (s.kind === 'injection') return 'bad';
  if (s.kind === 'guard') return 'guard';
  if (/blocked/i.test(s.text)) return 'bad';
  if (s.text.startsWith('Paid') || s.text.startsWith('Closed')) return 'ok';
  return undefined;
}

const KIND_ICON: Record<string, string> = { search: '⌕', quote: '₥', guard: '◈', injection: '⚠', tx: '⛓', note: '•', question: '?', answer: '↳', onramp: '£' };

/** One agent log line, shown inline in the chat. Lines with a tx hash were settled on Monad. */
function LogRow({ m }: { m: ChatMsg }) {
  const color = m.tone === 'bad' ? 'text-[var(--color-bad)]' : m.tone === 'ok' ? 'text-[var(--color-ok)]' : m.tone === 'guard' || m.tone === 'warn' ? 'text-[var(--color-warn)]' : 'text-neutral-500';
  return (
    <div className="rise grid grid-cols-[52px_16px_1fr] items-start gap-2 py-1 font-mono text-[11.5px] leading-relaxed">
      <span className="text-neutral-400 tabular-nums">{m.at ? new Date(m.at * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''}</span>
      <span className={`text-center ${color}`}>{KIND_ICON[m.kind ?? 'note'] ?? '•'}</span>
      <span className="text-neutral-800">
        {m.text}
        {m.source === 'chain' ? (
          <span className="ml-2 rounded bg-black px-1.5 py-px text-[9.5px] font-semibold uppercase tracking-wide text-white">on-chain</span>
        ) : m.txHash ? (
          <a href={explorerTx(m.txHash as `0x${string}`)} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-1 rounded bg-black px-1.5 py-px text-[9.5px] font-semibold uppercase tracking-wide text-white hover:bg-neutral-700">
            on-chain ↗
          </a>
        ) : (
          <span className="ml-2 rounded bg-[var(--color-fog)] px-1.5 py-px text-[9.5px] font-semibold uppercase tracking-wide text-neutral-500">agent log</span>
        )}
      </span>
    </div>
  );
}

/** Consecutive log rows become one card: plain-language steps first, the raw record behind "Proof on Monad". */
function groupMsgs(msgs: ChatMsg[]) {
  const out: (ChatMsg | ChatMsg[])[] = [];
  for (const m of msgs) {
    const last = out[out.length - 1];
    if (m.role === 'log') {
      if (Array.isArray(last)) last.push(m);
      else out.push([m]);
    } else out.push(m);
  }
  return out;
}

const TONE_CLS: Record<string, string> = {
  ok: 'text-neutral-900',
  safe: 'rounded-lg bg-emerald-50 px-2 py-1 -mx-2 text-emerald-900',
  warn: 'rounded-lg bg-amber-50 px-2 py-1 -mx-2 text-amber-900',
  bad: 'rounded-lg bg-red-50 px-2 py-1 -mx-2 text-red-900',
};

function ActivityCard({ rows }: { rows: ChatMsg[] }) {
  const [proof, setProof] = useState(false);
  const lines = rollUp(rows.map((r) => friendly(r.text, r.kind) && { ...friendly(r.text, r.kind)!, at: r.at }).filter(Boolean) as any);
  const onchain = rows.filter((r) => r.txHash || r.source === 'chain').length;
  return (
    <div className="rise ml-10 max-w-[86%] rounded-2xl border border-[var(--color-fog)] bg-white p-4">
      <div className="label mb-2 text-neutral-500">What the agent did</div>
      <ul className="space-y-1.5">
        {lines.map((l, i) => (
          <li key={i} className={`flex items-start gap-2.5 text-[13px] leading-snug ${TONE_CLS[l.tone ?? ''] ?? 'text-neutral-700'}`}>
            <span className="w-5 shrink-0 text-center">{l.icon}</span>
            <span className="flex-1">{l.text}</span>
            <span className="shrink-0 text-[11px] text-neutral-400">{ago(l.at)}</span>
          </li>
        ))}
      </ul>
      {onchain > 0 && (
        <button className="mt-3 text-[11.5px] font-semibold text-neutral-500 underline" onClick={() => setProof((p) => !p)}>
          {proof ? 'Hide proof' : `Proof on Monad · ${onchain} recorded step${onchain === 1 ? '' : 's'}`}
        </button>
      )}
      {proof && (
        <div className="mt-2 rounded-xl bg-[var(--color-mist)] px-3 py-2">
          {rows.map((r, i) => (
            <LogRow key={i} m={r} />
          ))}
        </div>
      )}
    </div>
  );
}

function Bubble({ m }: { m: ChatMsg }) {
  if (m.role === 'log') return <LogRow m={m} />;
  const agentCls =
    m.tone === 'bad'
      ? 'border-l-2 border-[var(--color-bad)] bg-red-50'
      : m.tone === 'ok'
        ? 'border-l-2 border-[var(--color-ok)] bg-emerald-50'
        : m.tone === 'warn'
          ? 'border-l-2 border-[var(--color-warn)] bg-amber-50'
          : 'bg-[var(--color-mist)]';
  return (
    <div className={`rise flex gap-2.5 py-1 ${m.role === 'user' ? 'justify-end' : ''}`}>
      {m.role === 'agent' && (
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-black text-[var(--color-volt)]">
          <SparkIcon className="h-3.5 w-3.5" />
        </span>
      )}
      <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-[13.5px] leading-relaxed ${m.role === 'user' ? 'rounded-br-md bg-black text-white' : `rounded-tl-md ${agentCls}`}`}>{m.text}</div>
    </div>
  );
}

function TaskList({ selected, onSelect, onNew }: { selected: string | null; onSelect: (id: string) => void; onNew: () => void }) {
  const w = useWallet();
  const { data, isLoading } = useMyMandates(w.address);
  return (
    <div className="flex h-full flex-col">
      <div className="p-4">
        <button className="btn w-full" onClick={onNew}>
          + New task
        </button>
      </div>
      <div className="label px-4 pb-2 text-neutral-500">Your tasks</div>
      <div className="flex-1 space-y-1.5 overflow-y-auto px-3 pb-4 pt-1">
        {!w.isConnected ? (
          <p className="px-2 text-[12px] text-neutral-500">Connect your wallet to see the tasks you funded.</p>
        ) : isLoading ? (
          <p className="px-2 text-[12px] text-neutral-500">Loading from Monad…</p>
        ) : !data?.length ? (
          <p className="px-2 text-[12px] text-neutral-500">No tasks yet.</p>
        ) : (
          data.map((m) => {
            const id = m.id.toString();
            const st = statusOf(m);
            const meta = readTaskMeta(id);
            return (
              <button
                key={id}
                onClick={() => onSelect(id)}
                className={`relative w-full overflow-hidden rounded-xl border px-3 py-2.5 text-left transition ${selected === id ? 'border-neutral-300 bg-white shadow-sm' : 'border-transparent hover:bg-white/70'}`}
              >
                {selected === id && <span className="absolute inset-y-0 left-0 w-1 bg-[var(--color-volt)]" />}
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[13px] font-semibold">{meta?.item ?? `Task #${id}`}</span>
                  <span className={`label shrink-0 rounded px-1.5 py-0.5 text-[9px] ${st.cls}`}>{st.label}</span>
                </div>
                <div className="mt-1 flex justify-between text-[11px] text-neutral-500 tabular-nums">
                  <span>#{id}</span>
                  <span>
                    {mon(m.spent)} / {mon(m.budget)}
                  </span>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function AgentInner() {
  const params = useSearchParams();
  const w = useWallet();
  const owner = useOwnerActions();
  const [msgs, setMsgs] = useState<ChatMsg[]>([GREETING]);
  const [input, setInput] = useState('');
  const [partial, setPartial] = useState<Partial<Draft> | undefined>();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [mandateId, setMandateId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [compromised, setCompromised] = useState(false);
  const [surge, setSurge] = useState(false);
  const [fromChain, setFromChain] = useState(false);
  const [, force] = useState(0);
  const { data } = useMandate(mandateId ? BigInt(mandateId) : undefined);
  const scroller = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [msgs, questions, busy]);
  useEffect(() => {
    if (mandateId) saveChat(mandateId, msgs);
  }, [msgs, mandateId]);
  // A task that ran in another browser has no local agent log: show its on-chain record instead.
  useEffect(() => {
    if (!fromChain || !data?.m || !mandateId) return;
    const names = { ...NAMES, [data.m.owner.toLowerCase()]: 'you' };
    setMsgs([
      { role: 'agent', text: `There's no agent log for task #${mandateId} in this browser (it may have run elsewhere, e.g. from MCP). Here's its on-chain record from the vault.` },
      ...data.h.map((e) => {
        const l = describeEntry(e, data.m!, names);
        return { role: 'log' as const, text: l.text, at: l.at, kind: 'tx' as const, source: 'chain' as const, tone: l.tone === 'info' ? undefined : l.tone === 'warn' ? ('warn' as const) : l.tone };
      }),
    ]);
    setFromChain(false);
  }, [fromChain, data, mandateId]);
  useEffect(() => {
    if (started.current) return;
    started.current = true; // only the URL the page was opened with; later URL updates are our own
    const t = params.get('task');
    const id = params.get('id');
    if (id) openTask(id);
    else if (t) send(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const say = (...m: ChatMsg[]) => setMsgs((x) => [...x, ...m]);
  const logMsgs = (events: LocalStep[]): ChatMsg[] => events.map((e) => ({ role: 'log', text: e.text, tone: toneOf(e), at: e.at, kind: e.kind, txHash: e.txHash }));

  function openTask(id: string) {
    setDraft(null);
    setQuestions([]);
    setPartial(undefined);
    setMandateId(id);
    const saved = readChat(id);
    const steps = readSteps(id);
    if (saved?.length) setMsgs(saved);
    else if (steps.length) setMsgs([{ role: 'agent', text: `Task #${id}. Here's everything the agent logged.` }, ...logMsgs(steps)]);
    else {
      setMsgs([{ role: 'agent', text: `Loading task #${id} from Monad…` }]);
      setFromChain(true);
    }
    setUrl(`/agent?id=${id}`);
  }

  function reset() {
    setMsgs([{ role: 'agent', text: 'New task. What do you need?' }]);
    setPartial(undefined);
    setQuestions([]);
    setDraft(null);
    setMandateId(null);
    setUrl('/agent');
  }

  async function send(text: string, answers?: Record<string, string>) {
    if (!text.trim() || busy) return;
    const next: ChatMsg[] = [...msgs, { role: 'user', text }];
    setMsgs(next);
    setInput('');
    setQuestions([]);
    setBusy('Thinking');
    try {
      const r = await fetch('/api/agent/plan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: next.filter((m) => m.role !== 'log').map(({ role, text }) => ({ role, text })), partial, answers }),
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
      const sid = (await findByDraft(pc, did)).toString();
      const first: LocalStep = { at: now(), kind: 'note', text: `Drafted "${draft.task}" · ${draft.item} · up to ${draft.budget} MON` };
      appendSteps(did, [first]);
      moveSteps(did, sid);
      saveTaskMeta(sid, { item: draft.item!, purpose: `${draft.task} — ${draft.item}`, draftId: did, surge, compromised });
      setMandateId(sid);
      setUrl(`/agent?id=${sid}`);
      say({ role: 'agent', text: `Locked ${draft.budget} MON in task #${sid} (confirmed in ${(r.ms / 1000).toFixed(1)} s). Shopping now…`, tone: 'ok' }, { role: 'log', text: `Task #${sid} created in the vault`, kind: 'tx', at: now(), txHash: r.hash });
      await runPhase(sid, 'shop');
    } catch {
      setBusy(null);
    }
  }

  async function runPhase(id: string, phase: 'shop' | 'resume' | 'close') {
    setBusy(phase === 'close' ? 'Closing the task' : 'Agent is shopping');
    const meta = readTaskMeta(id);
    try {
      const r = await fetch('/api/agent/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mandateId: id,
          item: draft?.item ?? meta?.item,
          purpose: draft ? `${draft.task} — ${draft.item}` : meta?.purpose,
          // Demo switches are fixed per task when it's locked, so a resumed task behaves the same way.
          compromised: meta?.compromised ?? compromised,
          surge: meta?.surge ?? surge,
          phase,
          logHash: phase === 'close' ? stepsHash(id) : undefined,
        }),
      }).then((x) => x.json());
      if (r.error) throw new Error(r.error);
      const events: LocalStep[] = r.events ?? [];
      appendSteps(id, events);
      force((n) => n + 1);
      say(...logMsgs(events));
      if (r.outcome === 'paid') {
        await runPhase(id, 'close');
        return;
      }
      if (r.outcome === 'closed') say({ role: 'agent', text: 'Done. Your order is placed and the unspent MON is back in your wallet.', tone: 'ok' });
      if (r.outcome === 'need_topup') say({ role: 'agent', text: 'The price went up. Approve or decline the top-up in the task panel. I can’t raise the budget myself.', tone: 'warn' });
      if (r.outcome === 'need_confirm') say({ role: 'agent', text: 'TaskGuard wants your OK before this payment. Confirm or reject it in the task panel.', tone: 'warn' });
      if (r.outcome === 'blocked') say({ role: 'agent', text: 'TaskGuard blocked the payment. Cancel the task to get your MON back.', tone: 'bad' });
    } catch (e: any) {
      say({ role: 'agent', text: `Agent error: ${e.message}`, tone: 'bad' });
    } finally {
      setBusy(null);
    }
  }

  function onOwnerAction(what: string, hash: string) {
    if (!mandateId) return;
    const text: Record<string, string> = {
      topup: 'I approved the top-up.',
      decline: 'I declined the top-up.',
      confirm: 'I confirmed the payment.',
      reject: 'I rejected the payment.',
      cancel: 'I cancelled the task. Unspent MON refunded.',
      freeze: 'I froze the agent. All its open tasks were refunded.',
      reclaim: 'Expired task refunded.',
      unfreeze: 'I unfroze the task.',
    };
    appendSteps(mandateId, [{ at: now(), kind: 'note', text: `Owner: ${text[what] ?? what}`, txHash: hash as `0x${string}` }]);
    say({ role: 'user', text: text[what] ?? what }, { role: 'log', text: `Owner action recorded: ${what}`, kind: 'tx', at: now(), txHash: hash });
    if (what === 'topup') setTimeout(() => runPhase(mandateId, 'resume'), 1200);
    if (what === 'confirm') setTimeout(() => runPhase(mandateId, 'close'), 1200);
  }

  const locked = !!mandateId;
  const taskOpen = data?.m?.status === 'Open';

  return (
    <div className="border-t border-[var(--color-fog)] lg:grid lg:h-[calc(100dvh-78px)] lg:grid-cols-[264px_minmax(0,1fr)_400px]">
      {/* Tasks */}
      <aside className="hidden border-r border-[var(--color-fog)] bg-[var(--color-mist)] lg:block lg:overflow-hidden">
        <div className="flex h-full flex-col">
          <div className="min-h-0 flex-1">
            <TaskList selected={mandateId} onSelect={openTask} onNew={reset} />
          </div>
          <div className="space-y-2.5 border-t border-[var(--color-fog)] p-4">
            <div className="label text-neutral-500">Demo switches</div>
            <label className="flex cursor-pointer items-center justify-between gap-2 text-[12px]">
              <span>Surge pricing (+15%)</span>
              <input type="checkbox" className="accent-black" checked={surge} onChange={(e) => setSurge(e.target.checked)} />
            </label>
            <label className="flex cursor-pointer items-center justify-between gap-2 text-[12px]">
              <span className="text-[var(--color-bad)]">Compromised agent</span>
              <input type="checkbox" className="accent-black" checked={compromised} onChange={(e) => setCompromised(e.target.checked)} />
            </label>
          </div>
        </div>
      </aside>

      {/* Chat */}
      <section className="flex min-h-[70vh] flex-col lg:min-h-0">
        <div className="flex items-center justify-between border-b border-[var(--color-fog)] px-5 py-3">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black text-[var(--color-volt)]">
              <SparkIcon className="h-4 w-4" />
            </span>
            <div>
              <div className="text-[14px] font-bold">BlockMart shopping agent</div>
              <div className="text-[11px] text-neutral-500">ERC-8004 agent #{AGENT_ID} · spends only through TaskPay</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {mandateId && <span className="label rounded bg-[var(--color-mist)] px-2 py-1">Task #{mandateId}</span>}
            <button className="label text-neutral-500 lg:hidden" onClick={reset}>
              New
            </button>
          </div>
        </div>

        <div ref={scroller} className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-5 py-5">
          {groupMsgs(msgs).map((g, i) => (Array.isArray(g) ? <ActivityCard key={i} rows={g} /> : <Bubble key={i} m={g} />))}
          {questions.map((q) => (
            <div key={q.field} className="rise pl-10 pt-1">
              <div className="label mb-2 text-neutral-500">{q.text}</div>
              <div className="flex flex-wrap gap-2">
                {q.options.map((o) => (
                  <button key={o} className="rounded-full border border-black px-3.5 py-1.5 text-[12px] hover:bg-black hover:text-white" onClick={() => send(o, { [q.field]: o })}>
                    {o}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {busy && (
            <div className="flex items-center gap-2 pl-10 pt-1 text-[12px] text-neutral-500">
              <span className="inline-flex gap-1">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-400" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-400 [animation-delay:120ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-400 [animation-delay:240ms]" />
              </span>
              {busy}
            </div>
          )}
        </div>

        {!draft && !locked && (
          <div className="flex flex-wrap gap-2 px-5 pb-2">
            {EXAMPLES.map((e) => (
              <button key={e} className="rounded-full bg-[var(--color-mist)] px-3 py-1.5 text-[11.5px] text-neutral-700 hover:bg-[var(--color-fog)]" onClick={() => send(e)}>
                {e}
              </button>
            ))}
          </div>
        )}
        <form
          className="m-4 mt-2 flex items-center gap-2 rounded-2xl border border-[var(--color-fog)] p-1.5 pl-4 focus-within:border-black"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <input
            className="h-10 flex-1 bg-transparent text-[14px] outline-none"
            placeholder={locked ? (taskOpen ? 'The agent is working on this task. Use the task panel to act on it.' : 'This task is finished. Click “New task” to buy something else.') : 'e.g. buy me a black hoodie under 1.3 MON'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={!!busy || locked}
          />
          <button className="flex h-10 w-10 items-center justify-center rounded-xl bg-black text-white disabled:opacity-30" disabled={!!busy || locked || !input.trim()} aria-label="Send">
            <ArrowRight className="h-4 w-4" />
          </button>
        </form>
      </section>

      {/* Task panel */}
      <aside className="border-t border-[var(--color-fog)] lg:overflow-y-auto lg:border-l lg:border-t-0">
        <div className="space-y-6 p-5">
          {!draft && !mandateId && (
            <>
              <div>
                <div className="label">How it works</div>
                <ol className="mt-4 space-y-3 text-[13px]">
                  {[
                    'Say what you want. The agent asks for anything missing.',
                    'A task card appears: store, item, budget, deadline.',
                    'Lock the budget in MetaMask. One confirmation.',
                    'The agent can only pay BlockMart, under the cap, before the deadline.',
                    'Unspent MON comes back to you.',
                  ].map((t, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="display text-[16px]">0{i + 1}</span>
                      <span>{t}</span>
                    </li>
                  ))}
                </ol>
              </div>
              <div className="rounded-xl bg-[var(--color-mist)] p-4 text-[12px] leading-relaxed">
                <div className="label mb-2">What gets logged where</div>
                <p>
                  <span className="mr-1 rounded bg-black px-1.5 py-px text-[9.5px] font-semibold uppercase text-white">on-chain</span>
                  Every money event in the vault: task created, paid, blocked (with reason), top-up asked/approved/declined, step-up confirmations, freezes, closed and refunded. Hash-chained, so it can’t be edited.
                </p>
                <p className="mt-2">
                  <span className="mr-1 rounded bg-[var(--color-fog)] px-1.5 py-px text-[9.5px] font-semibold uppercase text-neutral-600">agent log</span>
                  The agent’s reasoning: searches, questions, TaskGuard risk scores and injection flags, quotes. Kept in this browser; its hash is written on-chain when the task closes.
                </p>
              </div>
              {!w.isConnected && <ConnectButton className="btn w-full" />}
            </>
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
                    {w.mon !== undefined && w.mon < Number(draft.budget) + 0.08 && (
                      <p className="text-[12px] text-[var(--color-bad)]">You have {w.mon.toFixed(3)} MON. You need the budget plus about 0.08 MON for gas. Get test MON from the wallet menu (top right).</p>
                    )}
                    {owner.error && <p className="text-[12px] text-[var(--color-bad)]">{owner.error}</p>}
                  </div>
                )
              }
            />
          )}

          {mandateId && !data?.m && <p className="text-[13px] text-neutral-500">Loading task #{mandateId} from Monad…</p>}
          {mandateId && data?.m && (
            <>
              <TaskPanel m={data.m} entries={data.h} steps={readSteps(mandateId)} busy={!!busy} onAction={onOwnerAction} />
            </>
          )}

          <div className="space-y-2 border-t border-[var(--color-fog)] pt-4 lg:hidden">
            <label className="flex items-center justify-between text-[12px]">
              Surge pricing (+15%) <input type="checkbox" checked={surge} onChange={(e) => setSurge(e.target.checked)} />
            </label>
            <label className="flex items-center justify-between text-[12px] text-[var(--color-bad)]">
              Compromised agent <input type="checkbox" checked={compromised} onChange={(e) => setCompromised(e.target.checked)} />
            </label>
          </div>
        </div>
      </aside>
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
