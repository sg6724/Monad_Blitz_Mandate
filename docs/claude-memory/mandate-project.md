---
name: mandate-project
description: "The team's Blitz Pune V3 project \"TaskPay\" (was \"Mandate\") — per-task on-chain budgets for AI agents; final scope decisions and PRD link"
metadata:
  node_type: memory
  type: project
  originSessionId: 5f164f98-6550-45c0-9997-b8a28c70cbbc
  modified: 2026-10-10T06:18:57.772Z
---

Team of 2 building **TaskPay** at Monad Blitz Pune V3 on 10 Oct 2026. PRD (Claude Doc): https://claude.ai/code/artifact/ad4d1556-a3ec-420f-90b4-ceb8ca71a825

Final decisions (locked 10 Oct 2026):
- Surfaces: hosted web app + MCP server (both must work).
- Payments in TestUSDC (tUSDC, public mint + server mint); testnet MON (~50) only for gas. Monad 10 MON reserve-balance floor: keep demo owner and agent wallets above 10 MON.
- Announced features: follow-up questions for vague prompts → mandate card → pay → blocked attack with reason → top-up (agent asks, owner approves) → freeze-and-refund → close/refund. Unused funds always return to the owner (on completion, cancel, expiry via scheduled reclaim job, freeze). Clear timeline logging (on-chain events + app step log, explorer links, CSV).
- Merchants identified via the store's /.well-known/taskpay.json; no admin/merchant registry contract.
- Card funding: Transak sandbox (only on-ramp whose staging lists MON on Monad testnet 10143; self-serve staging key, needs a work email; use UK identity + GBP, test card 4242…, 3DS pw Checkout1!). Sandbox doesn't deliver MON, so after verifying the order via Get Order API our server mints tUSDC. Fallback: Crossmint staging. Stripe dropped (no Monad, invite-only in India).
- Monad features shown: eth_sendRawTransactionSync instant receipts, ERC-8004 identity + reputation, pay-per-call micro-payments.
- ERC-8004 v2.0.0 official registries exist on BOTH networks (different addresses). Testnet: Identity 0x8004A818BFB912233c491871b3d84c89A494BD9e, Reputation 0x8004B663056A597Dffe9eCcC1965A193B7388713. Mainnet: 0x8004A169…a432 / 0x8004BAa1…b63. No self-deploy. giveFeedback has no signature, but agent owner can't rate own agent → vault contract rates on close. Details in vendor/erc-8004/.
- Local docs/PRD-TaskPay.md is the source of truth now; the online Claude Doc is read-only from the cs-team1 account.
- Testnet wallets in secrets/wallets.env (gitignored): DEPLOYER 0x2959…5e76, AGENT 0xfB73…7a9C, OPS 0xb2AD…0d96 (keeper+minter), 1 MON each from devnads faucet.
- Git: repo dir initialised, tracking origin/main of github.com/sg6724/Monad_Blitz_Mandate. Foundry 1.8.5 installed at ~/.foundry/bin (not on PATH by default).

- LLM: Claude Sonnet via the team's local LiteLLM gateway (litellm/ in repo, port 4000); MCP server built/tested in Claude Code CLI first, web later.
- Hijack demo: web "compromised agent" switch + CLI `taskpay attack` command (agent key pays unknown address → blocked on-chain).
- Logs: money events on-chain (contract keeps per-mandate history array; Monad testnet RPC eth_getLogs limited to 100 blocks so don't rely on log scans); step log local (MCP: ~/.taskpay/logs/<id>.jsonl, web: browser localStorage + export); log hash recorded on close.
- Expiry refunds: permissionless reclaimExpired; keeper = cron-job.org (free, 1/min) → secret-protected Vercel /api/keeper, local cron backup; no VM needed. Also reclaim on dashboard/MCP open.
- Build in public: user's friend owns LinkedIn/X posts, demo video, ad video. Claude owns everything else.
- Domain: subdomain of team's existing domain for now. Mainnet deploy: ask user later (needs ~0.5 real MON).
- Repo: user says the GitHub repo is the current directory (no .git yet; sync-to-github.sh points at github.com/sg6724/Monad_Blitz_Mandate, branch jainam-chats for chats; teammate works on main).

Monskills (Monad dev skills) installed project-only in .claude/skills (commit 3f8efd2, hooks not installed).

**Why:** context for continuing build/pitch work across sessions.
**How to apply:** align scope with [[blitz-pune-v3-scoring-rubric]]; don't add unannounced features to the pitch.
