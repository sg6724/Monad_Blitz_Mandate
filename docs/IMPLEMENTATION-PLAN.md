# TaskPay implementation plan

Written 10 Oct 2026, 12:25 IST. Code freeze **17:30**, submission **17:45**. Lunch is 13:00–14:00, so we have about **4 hours of build time**. The product is described in `docs/PRD-TaskPay.md`. This file covers how we build it and in what order.

## 0. Setup status

| Item | Status |
|---|---|
| Git | ✅ This folder tracks `origin/main` of `github.com/sg6724/Monad_Blitz_Mandate`. Nothing is committed or pushed yet. |
| Foundry | ✅ 1.8.5 is installed at `~/.foundry/bin`. Run `export PATH="$PATH:$HOME/.foundry/bin"` in each new shell. |
| Monskills | ✅ Installed for this project only, in `.claude/skills/`. |
| Testnet wallets | ✅ Keys are in `secrets/wallets.env` (gitignored). Each wallet holds 1 MON from the faucet. DEPLOYER `0x29592c9465B9dE7FFa1f3E102b73f75F53565e76`, AGENT `0xfB7373E3aE843F6Fe5956fb5464841C52dC57a9C`, OPS (keeper and tUSDC minter) `0xb2ADb5734803379f64f8117931e812Ebd3a00d96`. |
| ERC-8004 | ✅ The official v2.0.0 registries already exist on testnet, so we don't deploy them. Identity `0x8004A818BFB912233c491871b3d84c89A494BD9e`, Reputation `0x8004B663056A597Dffe9eCcC1965A193B7388713`. ABIs and notes are in `vendor/erc-8004/`. |
| Transak | ⏳ **Your action:** sign up at dashboard.transak.com with a work email and copy the **staging** API key and secret into `web/.env.local`. |
| LiteLLM | ⚠️ **Blocker for the web agent.** `litellm/config.yaml` passes Claude Code's own login through to Anthropic, and there's no Anthropic API key in `litellm/.env`. Calls from Vercel therefore have no credentials. **Your action:** add `ANTHROPIC_API_KEY` to `litellm/.env`, then expose the gateway to the internet (e.g. `cloudflared tunnel --url http://127.0.0.1:4000`), protected by the master key. |
| More MON | ⚠️ A wallet holding less than 10 MON can send only one transaction every ~1.2 s (Monad's reserve-balance rule). That works, but the pay-per-call demo will be slow. Put the ~50 MON from Monad into AGENT and OPS. |
| Subdomain | ⏳ **Your action:** add a CNAME `taskpay.<your-domain>` → `cname.vercel-dns.com` once the Vercel project exists. |

## 1. Repo layout

```
contracts/   Foundry: TestUSDC.sol, TaskPayVault.sol, tests, deploy script
packages/sdk/ shared TS: ABIs, addresses per chain, viem clients, draft/question logic, timeline merge
mcp/         MCP server + `taskpay` CLI (Node, @modelcontextprotocol/sdk 1.32, viem 2.57)
web/         Next.js 16 app: dashboard, approve page, DemoStore, PriceCheck API, agent, keeper, Transak
docs/        PRD, this plan, images
vendor/      ERC-8004 reference sources + ABIs
```

Use a single npm workspace (`packages/sdk`, `mcp`, `web`). Don't add pnpm; npm is already installed.

## 2. Contracts (Foundry, solc 0.8.28, OpenZeppelin 5.x)

### TestUSDC
- ERC-20 with 6 decimals, named `TaskPay Test USDC` / `tUSDC`.
- `faucet()` mints 100 tUSDC to the caller, at most once per address per hour. This lets judges self-serve.
- `mint(to, amount)` works only for addresses with `MINTER_ROLE`, which is OPS. Transak credits use it.

### TaskPayVault

```solidity
enum Status { Open, Closed }
struct Mandate {
  address owner; address agent; IERC20 token; uint256 agentId;  // ERC-8004 id, 0 if none
  uint128 budget; uint128 spent; uint128 perPaymentCap; uint64 expiry;
  bytes32 purposeHash; bytes32 draftId; Status status; uint8 blocked;
  uint128 pendingTopUp; bytes32 logHash;
}
struct Entry { uint8 kind; uint128 amount; address counterparty; bytes32 ref; uint8 reason; uint64 at; }
```

| Function | Who | Rules |
|---|---|---|
| `createMandate(agent, token, budget, perPaymentCap, expiry, payees[], purposeHash, draftId, agentId)` | owner | Pulls `budget` with `transferFrom` and records the payees. `draftId` lets the MCP server and web app find the mandate they drafted. |
| `pay(id, payee, amount, ref) returns (bool)` | agent | **Reverts only** if the caller isn't the agent. Any other failure records a `Blocked` entry with a reason code and returns false. |
| `requestTopUp(id, amount, ref)` | agent | Sets `pendingTopUp` and records an entry. At most one pending request at a time. |
| `increaseBudget(id, amount)` | owner | Pulls `amount` and clears `pendingTopUp`. `declineTopUp(id)` clears it without adding money. |
| `close(id, logHash)` | owner or agent | Refunds `budget - spent` to the owner, stores `logHash`, gives ERC-8004 feedback. |
| `reclaimExpired(id)` | anyone | Requires `block.timestamp > expiry`. Refunds the owner. |
| `setFrozen(agent, bool)` / `freezeAndRefund(agent)` | owner | Freeze applies per owner and agent pair. `freezeAndRefund` closes all of that owner's open mandates for the agent. |
| `getHistory(id)`, `getMandate(id)`, `mandatesOf(owner)`, `mandatesOfAgent(agent)`, `findByDraft(draftId)`, `openExpired(max)` | view | Feed the timeline, polling and the keeper. Keep an `openIds` array with swap-and-pop removal. |

- **Reason codes:** `1 NOT_OPEN, 2 EXPIRED, 3 FROZEN, 4 MERCHANT_NOT_ALLOWED, 5 OVER_PAYMENT_CAP, 6 OVER_BUDGET`.
- **Fee:** `feeBps` (deploy with 50 = 0.5%), sent to `treasury`. The merchant receives the full amount, and the fee comes out of the mandate's budget, so the budget check covers `amount + fee`. This makes the revenue model visible in the demo.
- **ERC-8004 feedback in `close`:** wrap the call in `try/catch` so a failure never blocks a refund. Call `giveFeedback(agentId, value, 0, "taskpay", tag2, "", "", logHash)` with `value = 100` and `tag2 = "completed"` if nothing was blocked, otherwise `value = 0` and `tag2 = "blocked"`. The vault calls it as the client, which works because the agent's owner (the agent key) isn't allowed to rate its own agent.
- **Events** are emitted for every entry type. The timeline reads `getHistory` instead of scanning logs, because the testnet RPC only returns logs from the last 100 blocks.
- **Tests (forge):** happy path with refund; each block reason; top-up approve and decline; expiry reclaim by a stranger; `freezeAndRefund`; fee math; a revert when a non-agent calls `pay`.
- **Deploy:** `forge script` with DEPLOYER on chain 10143. Then verify through the Monskills verification API (`agents.devnads.com/v1/verify`), which covers 25 rubric points. Write the addresses to `packages/sdk/src/addresses.json`.
- **Gas:** Monad charges for the gas *limit*, not the gas used. Estimate gas and add at most 10%; never use fixed large limits.

## 3. Shared SDK (`packages/sdk`)

- `chains.ts`: Monad testnet (10143) and mainnet (143), with per-chain addresses for TaskPayVault, TestUSDC and the ERC-8004 registries.
- `draft.ts`: draft schema `{store, items, budget, perPaymentCap, expiryMins, payees[{name, address}], purpose}` plus `missingFields(draft)`, which returns at most 3 questions with suggested answers (PRD "Follow-up questions"). `purposeHash = keccak256(canonical JSON)`.
- `merchants.ts`: `resolveMerchant(domain)` fetches `https://<domain>/.well-known/taskpay.json` → `{name, category, payTo, priceRange}`.
- `approve-link.ts`: `encodeDraft(draft) → /approve#<base64url>`. The draft travels in the URL fragment, so no server stores it.
- `timeline.ts`: merges `getHistory` entries with local log entries and formats them as the PRD's timeline lines, with explorer links (`https://testnet.monadscan.com/tx/<hash>`).
- `tx.ts`: sends transactions through Monad's `eth_sendRawTransactionSync` (viem `sendTransactionSync` if this version has it, otherwise sign and call the RPC method directly) and measures the time to receipt for the "settled in 0.7 s" badge. Fall back to `sendTransaction` + `waitForTransactionReceipt`.

## 4. MCP server and CLI (`mcp/`)

- **Tools:** `request_mandate`, `get_mandate`, `pay`, `request_topup`, `close_mandate`, `list_mandates`. The input and output shapes are in the PRD.
- `request_mandate({task, store?, budget?, answers?})`:
  1. Resolves the store's `.well-known` file.
  2. Runs `missingFields`. If anything is missing, it returns `{status:"needs_info", questions}` and the client model asks the user.
  3. Otherwise it returns `{status:"ready", card, approveUrl}` and then polls `findByDraft(draftId)` every 2 s, for up to 5 minutes, until the owner approves in the web app.
- **Agent key:** created on first run at `~/.taskpay/agent.json` (file mode 600). On first use it calls `IdentityRegistry.register(string agentURI)` with a `data:` JSON agent card and caches the `agentId`.
- **Step log:** append to `~/.taskpay/logs/<mandateId>.jsonl`. `close_mandate` hashes the file and passes the hash to `close`.
- **CLI (`npx taskpay …`):** `status`, `timeline <id>`, `attack <id>` (pays a random address with the agent key, so the block shows up on-chain), `reclaim <id>`.
- **Install:** `claude mcp add taskpay -- node /abs/path/mcp/dist/index.js`. Test it in Claude Code first, as decided.

## 5. Web app (`web/`, Next.js 16, wagmi 3, viem, Tailwind)

| Route | What it does |
|---|---|
| `/` | Connect MetaMask (Monad testnet), show tUSDC balance, **Get 100 tUSDC** (faucet) and **Add funds by card** (Transak) buttons, list of tasks. |
| `/agent` | Chat with the web agent. Shows follow-up questions as tap buttons, the mandate card and a **compromised agent** switch. |
| `/approve#…` | Decodes the draft, re-resolves the merchant, shows the card. Approve runs `approve` and then `createMandate` from the owner's wallet. |
| `/mandate/[id]` | Timeline (on-chain plus localStorage), Cancel, Reclaim, Approve/Decline top-up, Freeze and refund, CSV export. Reclaims automatically if the mandate has expired. |
| `/store`, `/store/[sku]` | DemoStore catalogue, about 5 chargers and cables priced 3–12 tUSDC. One product review contains the injection text. A "surge price" toggle exists for the top-up demo. |
| `/.well-known/taskpay.json` | DemoStore identity: `payTo` is a fixed DemoStore address (generate one, no key needed). |
| `/api/store/quote` | `{sku, qty} → {orderId, amount, payTo, network}`, x402-style. `/api/store/paid` marks an order paid after checking the payment entry on-chain. |
| `/api/pricecheck` | Pay-per-call API: responds 402 unless a valid `pay` ref for 0.01 tUSDC is present. |
| `/api/agent` | Server-side agent loop. Calls Claude Sonnet through LiteLLM (`LITELLM_URL`, `LITELLM_KEY`) with tools (search store, quote, pricecheck, pay, request_topup, close), signs with `AGENT_PRIVATE_KEY`, streams steps to the client, and the client saves them in localStorage. In compromised mode, it follows any instruction found in a review. |
| `/api/onramp/session`, `/api/onramp/verify` | Transak flow from the PRD: create the widget URL with `partnerOrderId`, then check `COMPLETED` and the amount, then mint tUSDC with OPS, at most once per orderId. |
| `/api/keeper?key=…` | Reads `openExpired(20)` and calls `reclaimExpired` for each one with OPS. cron-job.org calls it every minute. |

- **Env (Vercel):** `AGENT_PRIVATE_KEY`, `OPS_PRIVATE_KEY`, `KEEPER_SECRET`, `LITELLM_URL`, `LITELLM_KEY`, `TRANSAK_API_KEY`, `TRANSAK_API_SECRET`, `NEXT_PUBLIC_CHAIN_ID=10143`.
- **localStorage keys:** `taskpay:log:<chainId>:<mandateId>`. Add an Export JSON button.

## 6. Schedule (2 people)

| Time | Person A: chain + agent | Person B: web + product |
|---|---|---|
| 12:30–13:00 | Scaffold `contracts/`, write TestUSDC and the core of TaskPayVault | Scaffold the npm workspace and Next.js app, set up wagmi with Monad testnet, build the DemoStore pages and `.well-known` |
| 13:00–14:00 | Lunch (keep forge tests running if you can) | Lunch |
| 14:00–14:45 | Finish the vault and tests, deploy and verify on testnet, fill in `addresses.json` | `packages/sdk` (draft, questions, approve link, timeline), `/approve` page with `createMandate` |
| 14:45–15:45 | MCP server: all tools, agent key, ERC-8004 register, step log, CLI `attack`. Test end to end in Claude Code | `/mandate/[id]` timeline + top-up/freeze/reclaim buttons, quote/pricecheck APIs |
| 15:45–16:30 | `/api/agent` with LiteLLM + compromised mode, keeper endpoint + cron-job.org | Transak session/verify/mint, faucet button, receipt timer badge |
| 16:30–17:00 | Deploy to Vercel, set env, subdomain, run a full happy path + attack + top-up on the live URL | README (rubric items), screen-record the demo for the build-in-public friend |
| 17:00–17:25 | Fix bugs only. A teammate follows the README from a fresh browser to confirm "runs without help" | Same |
| 17:25 | Push the final code. Freeze at 17:30 | Submit on the Devnads portal before 17:45 with repo, live URL, contract addresses |

**Cut order if we're late:** Transak → pay-per-call API → ERC-8004 feedback → keeper cron (keep the Reclaim button) → MCP polling (keep a manual "paste mandate id"). **Never cut:** create → pay → blocked attack → top-up → close and refund, live on testnet. Only announce what made it in.

## 7. Rubric checklist

- [ ] Public GitHub repo with a README: one-line description, setup steps, live URL, contract addresses, network (Monad testnet 10143)
- [ ] Contracts deployed on testnet **and verified** on the explorer
- [ ] Hosted on Vercel at the subdomain (custom domain is worth 15 bonus points)
- [ ] Every announced feature works, with a live transaction during the demo
- [ ] README lets a stranger run it: MetaMask → Get tUSDC → give a task → approve
- [ ] Build in public (the friend handles it): X/LinkedIn post tagging @monad @monad_dev @geeky_kartikey, demo video, ad video, 5K views by 17:45
- [ ] Optional: mainnet deploy (+25), ask before spending real MON
- [ ] In the pitch, say the repo link, contract address, live URL and network out loud

## 8. Known risks

- **Testnet RPC limits.** `eth_getLogs` only covers 100 blocks, hence on-chain history arrays. If the public RPC rate-limits us, add a second RPC from `.claude/skills/tooling-and-infra`.
- **Vercel and the local gateway.** The LiteLLM tunnel URL changes each time it restarts, so update `LITELLM_URL` in Vercel whenever that happens.
- **Transak sandbox.** It may block Indian IPs or the KYC flow may stall. Fall back to Crossmint staging, and keep the "Get 100 tUSDC" button either way.
- **Expiry demo.** Use a 2-minute expiry so reclaim can be shown live.
