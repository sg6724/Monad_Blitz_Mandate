# TaskPay implementation plan

Updated 10 Oct 2026, ~13:15 IST. Code freeze is **17:30**; submit on the Devnads portal by **17:45**. The product spec is `docs/PRD-TaskPay.md`; this file covers how we build it. **Building starts only after the team says go.**

## 0. Decisions and setup

| Item | Decision / status |
|---|---|
| Payment money | **Native MON** on Monad testnet (chain 10143). There's no test token. The vault also accepts an ERC-20 per mandate, for USDC on mainnet later. |
| Owner wallet | **MetaMask only**. One confirmation per action (lock, top-up, step-up, cancel, freeze). The app asks MetaMask to add or switch to Monad testnet. |
| On-ramp | **Transak test mode** ("Buy MON with card"). Our server checks the order with Transak's API, then the OPS wallet sends up to 1 MON. A "Get test MON" button is the backup. |
| LLM | **Gemini `gemini-3.5-flash`** (key tested). Used for the web agent, card drafting and the TaskGuard classifier. In MCP, the client's own model does the reasoning. |
| ERC-8004 | The official testnet registries, used directly. Identity `0x8004A818BFB912233c491871b3d84c89A494BD9e`, Reputation `0x8004B663056A597Dffe9eCcC1965A193B7388713`. Notes are in `vendor/erc-8004/`. |
| Logs | Money events are kept on-chain in a hash-chained history per mandate. Step logs stay local: `~/.taskpay/logs/*.jsonl` for MCP, localStorage for the web app. |
| Keeper | `/api/keeper?key=`, called every minute by `scripts/keeper-loop.sh` (local), with cron-job.org optional. Reclaim also runs when a page opens, and there's a Reclaim button. |
| Git | This folder tracks `origin/main` of `github.com/sg6724/Monad_Blitz_Mandate`. Ask before the first push. |
| Tools | Foundry 1.8.5 (`export PATH="$PATH:$HOME/.foundry/bin"`), Node 22 + npm, Vercel CLI (logged in). Monskills are in `.claude/skills/`. |
| Secrets | `secrets/wallets.env` and `secrets/api.env` (gitignored): Gemini, Transak staging key + secret. |
| No Artifacts | All docs stay as local files. |

**Wallets (testnet):**

| Wallet | Address | MON | Job |
|---|---|---|---|
| DEPLOYER | `0x29592c9465B9dE7FFa1f3E102b73f75F53565e76` | ~11 | Deploys the vault, receives the 0.5% fee |
| AGENT | `0xfB7373E3aE843F6Fe5956fb5464841C52dC57a9C` | ~20 | The web agent's key. Asks the vault to pay; MON only for its fees |
| OPS | `0xb2ADb5734803379f64f8117931e812Ebd3a00d96` | ~22 | Keeper, Transak credits, "Get test MON" |
| STORE | `0x27dd67D92c1754D3F30b9D7965D8Cf6cf2B3D0be` | ~0 | DemoStore payout address; only receives |

**Monad reserve rule (tested):** a normal wallet below 10 MON can't send money transfers back to back (2 of 3 failed in our test). Single transfers work, and contracts are exempt. So the owner sends one transaction per action, the vault makes every payment, and AGENT and OPS stay above 10 MON. The UI warns owners who are below 10 MON.

**Demo amounts** stay small so our MON lasts: chargers cost 0.4–1.2 MON, a typical budget is 0.8 MON, and a price-check call costs 0.001 MON.

## 1. Repo layout (one npm workspace)

```
contracts/     Foundry: TaskPayVault.sol, tests, deploy script
packages/sdk/  shared TypeScript: ABIs, addresses, drafts, TaskGuard, tx helper, timeline
mcp/           MCP server + `taskpay` CLI
web/           Next.js 16 app (wagmi 3, viem 2.57, Tailwind): dashboard, store, APIs
scripts/       keeper-loop.sh
docs/  vendor/  secrets/ (gitignored)
```

## 2. Contract: TaskPayVault (solc 0.8.28, OpenZeppelin 5.x)

- **Money:** `token == address(0)` means native MON. `createMandate` and `increaseBudget` are `payable` and must receive exactly the amount. An ERC-20 mandate uses `transferFrom` instead. Payouts and refunds go through one internal `_send(token, to, amount)` with a reentrancy guard.
- **Mandate fields:** owner, agent, token, agentId, budget, originalBudget, spent, perPaymentCap, expiry, purposeHash, draftId, status, frozen, blocked count, pendingTopUp, toppedUp, the pending step-up payment, windowStart/windowCount, logHash, lastHash.

| Function | Caller | Rule |
|---|---|---|
| `createMandate(agent, token, budget, perPaymentCap, expiry, payees[], purposeHash, draftId, agentId)` | owner (payable) | Locks the budget and stores the payees |
| `pay(id, payee, amount, ref) returns (bool)` | agent | Reverts only for a non-agent caller. Any other failure records a `Blocked` entry with a reason and returns false. |
| `requestApproval(id, payee, amount, ref)` / `confirmPayment(id)` / `rejectPayment(id)` | agent / owner / owner | TaskGuard step-up. The rules are re-checked at confirmation. |
| `requestTopUp(id, amount, ref)` / `increaseBudget(id)` (payable) / `declineTopUp(id)` | agent / owner / owner | One pending top-up at a time; all top-ups together may add at most 50% of `originalBudget` |
| `close(id, logHash)` | owner or agent | Refunds the rest to the owner, stores `logHash`, gives ERC-8004 feedback (inside try/catch) |
| `reclaimExpired(id)` | anyone | Only after expiry; the money still goes only to the owner |
| `setFrozen(agent, bool)` / `freezeAndRefund(agent)` | owner | Per owner and agent pair |
| `getMandate`, `getHistory`, `mandatesOf`, `mandatesOfAgent`, `findByDraft`, `openExpired(max)` | view | Feed the timeline, polling and the keeper |

- **On-chain TaskGuard:**
  - A mandate freezes itself after 3 blocked attempts.
  - At most 20 payments per 60 s per mandate.
  - History entries are hash-chained: `lastHash = keccak256(lastHash, entry)`.
- **Fee:** 0.5% (`feeBps = 50`), taken from the budget and sent to the treasury (DEPLOYER). The store receives the full amount.
- **Reason codes:** NOT_OPEN, EXPIRED, FROZEN, MERCHANT_NOT_ALLOWED, OVER_PAYMENT_CAP, OVER_BUDGET, VELOCITY.
- **ERC-8004 feedback on close:** `giveFeedback(agentId, 100 or 0, 0, "taskpay", "completed"/"blocked", "", "", logHash)`. The vault is the client, which is allowed because it isn't the agent's owner.
- **Tests:** happy path with refund; each block reason; auto-freeze; top-up approve, decline and cap; stranger reclaim after expiry; `freezeAndRefund`; fee math; hash chain; reentrancy on refund.
- **Deploy and verify:** `forge script` with DEPLOYER on 10143. Verify through `agents.devnads.com/v1/verify` (see `.claude/skills/scaffold/SKILL.md`), with Sourcify as the fallback. Write the address into `packages/sdk/src/addresses.json`. Monad charges for the gas *limit*, so set tight limits (`.claude/skills/gas/SKILL.md`).

## 3. Shared SDK (`packages/sdk`)

- `addresses.json`, ABIs (from forge output + `vendor/erc-8004/abis`), chain config.
- `draft.ts`: the draft schema, `missingFields()` (at most 3 questions with suggested answers), `purposeHash`, `encodeDraft`/`decodeDraft` for the approve link.
- `merchants.ts`: reads and validates the store's `/.well-known/taskpay.json`.
- `guard.ts` (TaskGuard, off-chain):
  - a quarantine wrapper for untrusted content;
  - an injection detector (regex rules + address/payment-verb check, escalating to Gemini);
  - `riskScore()`: intent 30 + amount z-score 20 + injection exposure 30 + merchant trust 10 + velocity 10. Below 30 pays, 30–60 needs owner step-up, above 60 is blocked, with reasons.
- `tx.ts`: sends through `eth_sendRawTransactionSync` and measures the settle time, falling back to `waitForTransactionReceipt`.
- `timeline.ts`: merges on-chain history and the local log, adds explorer links, exports CSV.

## 4. MCP server + CLI (`mcp/`, @modelcontextprotocol/sdk 1.32)

- **Tools:**
  - `request_mandate`: returns either `needs_info` questions, or a card + approve link, then polls `findByDraft`.
  - `get_mandate`.
  - `pay`: runs TaskGuard, then pays, requests approval, or refuses.
  - `request_topup`, `close_mandate`, `list_mandates`.
- **Agent key:** `~/.taskpay/agent.json`, registered in the ERC-8004 IdentityRegistry on first run. It needs MON, so the CLI prints the address to fund, or claims "Get test MON".
- **Step log:** `~/.taskpay/logs/<id>.jsonl`; its hash is sent with `close`.
- **CLI:** `taskpay status | timeline <id> | attack <id> | reclaim <id> | approve <draft>`. `approve` uses a local test owner key so the flow can be tested without a browser.
- **Install:** `claude mcp add taskpay -- node <abs>/mcp/dist/index.js`, tested in Claude Code first.

## 5. Web app (`web/`)

| Route | Purpose |
|---|---|
| `/` | Connect MetaMask, MON balance (with a below-10 warning), **Buy MON with card** (Transak), **Get test MON**, task list |
| `/agent` | Gemini agent chat: tap-to-answer follow-ups, TaskGuard risk badges, **compromised agent** switch (turns off layers 1–3 to show the contract still blocks) |
| `/approve#draft` | Shows the card; one MetaMask confirmation: `createMandate{value}` |
| `/mandate/[id]` | Timeline, top-up / step-up confirm, cancel, reclaim, freeze-and-refund, CSV export |
| `/store` | DemoStore: about 5 chargers/cables, one poisoned review, surge-price toggle |
| `/.well-known/taskpay.json`, `/api/store/quote`, `/api/store/paid` | Merchant identity, x402-style quote, paid check |
| `/api/pricecheck` | Returns 402 unless a 0.001 MON payment is shown |
| `/api/agent` | Gemini tool loop signed with `AGENT_PRIVATE_KEY`; streams steps (the browser saves them in localStorage) |
| `/api/onramp/session` | Transak: refresh-token (`api-secret`) → session (`access-token`, `x-api-key`, `x-user-ip`) → widget URL |
| `/api/onramp/verify` | Checks the order is `COMPLETED` and the amount matches, then OPS sends ≤1 MON, once per order |
| `/api/faucet` | OPS sends 1 MON once per wallet per day (backup for Transak) |
| `/api/keeper?key=` | `openExpired(20)` → `reclaimExpired` from OPS |

## 6. Schedule

| Time | Work |
|---|---|
| Go → +45 min | Vault contract and tests, deploy and verify on testnet |
| +45 → +1h30 | SDK (draft, guard, tx, timeline) and MCP server + CLI; tested in Claude Code against testnet |
| +1h30 → +2h45 | Web app: approve, timeline, store, agent (Gemini), faucet, keeper |
| +2h45 → +3h15 | Transak (session, widget, verify, send MON) |
| +3h15 → 17:00 | Vercel deploy (env from `secrets/`), subdomain, keeper loop, README; hand a screen recording to the build-in-public friend |
| 17:00–17:25 | Fix bugs only. Run the README from a fresh browser. Push. |
| 17:25–17:45 | Freeze and submit (repo, live URL, contract address, network) |

**Cut order if late:** pay-per-call → ERC-8004 feedback → step-up confirm → keeper loop (keep the Reclaim button) → MCP polling. If Transak breaks, the "Get test MON" button stays. **Never cut:** lock → pay → blocked attack → top-up → close and refund, live on testnet.

## 7. Verification

- `forge test -vv` passes. After deploy, `cast call getMandate/getHistory` works and the contract shows as verified on the explorer.
- **CLI on testnet:** draft → `taskpay approve` → `pay` → `taskpay attack` is blocked (MERCHANT_NOT_ALLOWED) → 3 attacks freeze the mandate → top-up → close refunds the owner (check balances) → a 2-minute expiry is reclaimed by the keeper.
- **MCP in Claude Code:** "buy a charger" → follow-ups → approve link → payment → refund.
- **Web with MetaMask:** Transak test card → MON arrives → agent task → one confirmation → payment → compromised attack blocked on-chain → top-up → refund, with explorer links in the timeline.
- A teammate runs it from the README in a fresh browser profile.

## 8. Rubric checklist

- [ ] Public repo + README (description, setup, live URL, contract address, network)
- [ ] Contract on testnet, verified
- [ ] Hosted on Vercel at a subdomain (+15)
- [ ] Every announced feature works; a live transaction during the demo
- [ ] Runs from the README without help
- [ ] Build in public: handled by the friend (posts tag @monad @monad_dev @geeky_kartikey, demo video, ad video, 5K views by 17:45)
- [ ] Optional: mainnet deploy (+25), ask first
- [ ] In the pitch, say the repo, contract address, live URL and network out loud
