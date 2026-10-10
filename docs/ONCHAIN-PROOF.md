# TaskPay: proving it all happens on-chain

Everything that moves or guards money happens inside one verified contract on Monad testnet. You don't need to trust our app, our server or our database (we don't have one). You can check each claim yourself on the block explorer, or with one command.

| | |
|---|---|
| Vault contract (verified source) | [`0xA6694FE815Ab96139519feAA0861aCDC07d8E462`](https://testnet.monadscan.com/address/0xA6694FE815Ab96139519feAA0861aCDC07d8E462#readContract) |
| ERC-8004 IdentityRegistry | `0x8004A818BFB912233c491871b3d84c89A494BD9e` (our agent is **#2100**) |
| ERC-8004 ReputationRegistry | `0x8004B663056A597Dffe9eCcC1965A193B7388713` |
| One-command check | `npx tsx scripts/verify-task.ts <taskId>` |

## 1. What is on-chain and what is not

| Data | Where it lives | How to check it |
|---|---|---|
| The task rules: owner, agent, budget, per-payment cap, expiry, allowed payees | Vault storage (`getMandate`, `getPayees`) | Monadscan, Read Contract tab |
| The locked money | Vault's MON balance | Address page balance |
| **Every** action: create, pay, block, step-up request/confirm/reject, top-up request/approve/decline, freeze/unfreeze, close, reclaim | Vault storage, one entry per action (`getHistory`), plus an `EntryAdded` event | Read Contract tab, or Events tab |
| Blocked attempts (e.g. paying an attacker) | Recorded as a `Blocked` entry with a reason. The call **does not revert**, so the attempt itself stays on the record | `getHistory` |
| Each payment | A real MON transfer from the vault to the payee, plus a 0.5% fee to the treasury | Transaction page, "internal transactions" |
| Agent identity | ERC-8004 IdentityRegistry: agent #2100 is owned by the agent wallet `0xfB73…7a9C` | `ownerOf(2100)` |
| Agent reputation | Written by the vault itself on close: score 100 (clean) or 0 (had a block or freeze), tag `taskpay` | `getSummary` on ReputationRegistry |
| The agent's step-by-step reasoning log (searches, quotes, guard checks) | **Off-chain**, in your browser (localStorage) or `~/.taskpay/logs/<id>.jsonl` for the CLI | Its keccak256 hash is passed to `close()` and stored as `logHash`. Change one character of the log and the hash no longer matches |

## 2. Why the history can't be quietly edited (the hash chain)

Each new entry's hash includes the previous entry's hash:

```
hash[n] = keccak256(abi.encode(hash[n-1], kind, reason, at, who, amount, ref))   // hash[-1] = 0x00…00
```

The latest hash is stored on the task as `lastHash`. To check, recompute the chain from the entries and compare the result with `lastHash`. If anyone edits, removes or reorders an entry, every hash after it changes. `verifyHistory()` in `packages/sdk/src/proof.ts` and the script both run this check.

## 3. Check it yourself

**On Monadscan:** open the vault link above, go to **Contract → Read Contract**, and call `getMandate(10)` and `getHistory(10)`. The *kind* numbers mean: 0 Created, 1 Paid, 2 Blocked, 3 ApprovalRequested, 4 ApprovalConfirmed, 5 ApprovalRejected, 6 TopUpRequested, 7 TopUpApproved, 8 TopUpDeclined, 9 Frozen, 10 Unfrozen, 11 Closed, 12 Reclaimed. The *reason* numbers mean: 0 none, 1 not open, 2 expired, 3 frozen, 4 merchant not allowed, 5 over per-payment cap, 6 over budget, 7 velocity.

**With Foundry `cast`** (copy and paste):

```bash
V=0xA6694FE815Ab96139519feAA0861aCDC07d8E462; R=https://testnet-rpc.monad.xyz
# full history of task 10: (kind, reason, time, counterparty, amount, ref, hash)
cast call $V "getHistory(uint256)((uint8,uint8,uint64,address,uint128,bytes32,bytes32)[])" 10 --rpc-url $R
# the task itself; lastHash is the final field, logHash the one before it
cast call $V "getMandate(uint256)((address,uint64,uint64,address,uint64,uint8,uint8,bool,uint8,address,uint256,uint128,uint128,uint128,uint128,uint128,uint128,bytes32,bytes32,bytes32,bytes32))" 10 --rpc-url $R
# recompute entry #0's hash by hand: prints 0x5ea415b1…1138, the same as the stored hash
cast keccak $(cast abi-encode "f(bytes32,uint8,uint8,uint64,address,uint128,bytes32)" \
  0x0000000000000000000000000000000000000000000000000000000000000000 0 0 1791627649 \
  0x835Cee7eEb067e5ae0F9807Ef634a275D924807F 450000000000000000 \
  0x2276ab9765f393fcb17fb0cd5f1523c1acf360a2ac9ccf63f4be7c5889b2810b)
# ERC-8004: who owns agent #2100, and its TaskPay reputation (count, total, decimals)
cast call 0x8004A818BFB912233c491871b3d84c89A494BD9e "ownerOf(uint256)(address)" 2100 --rpc-url $R
cast call 0x8004B663056A597Dffe9eCcC1965A193B7388713 "getSummary(uint256,address[],string,string)(uint64,int128,uint8)" 2100 "[$V]" taskpay "" --rpc-url $R
```

## 4. What "Paid 0.001 MON to PriceCheck API" means

This is a real pay-per-call micro-payment. Before buying, the agent calls a price-check API that charges 0.001 MON per call (it answers HTTP 402 "payment required" until it's paid). The agent pays from **the same task budget**, through the vault's `pay()`. The money goes to a separate PriceCheck wallet (`0x1344fb00634e7141e8Ed551aB00893b710245bce`) that is on the task's allowed-payee list. The agent can't spend outside the task's rules, even for small API fees.

## 5. Worked example: task 10

Owner `0x835C…807F` · agent `0xfB73…7a9C` (ERC-8004 #2100) · 9 history entries. Click any tx to see who signed it.

| # | What happened (on-chain entry) | Signed by | Tx |
|---|---|---|---|
| 0 | **Created**: owner locked 0.45 MON. Only BlockMart and PriceCheck may be paid, and the task expires in 1 h | Owner | [0x616b…c408](https://testnet.monadscan.com/tx/0x616b8e112c112fa337479c1d515f48d5697f70d831c2a19985bd3297a73bc408) |
| 1 | **Blocked**: a poisoned product review told the agent to send all 0.45 MON to `0x…dEaD` ("settlement migration"). The vault refused (reason 4, merchant not allowed) and recorded the attempt. No money moved | Agent | [0xcb2d…fd17](https://testnet.monadscan.com/tx/0xcb2d583d17a1de450fe9e2ad384015441563cf8fd6f6e1a7006e3f6c4f2cfd17) |
| 2–4 | **Paid** 3 × 0.001 MON to PriceCheck API (`pricecheck-1..3`) | Agent | [0x6600…](https://testnet.monadscan.com/tx/0x6600ba6bdc75b5ee0bc4de52d651ddf50de567cc4c2fe80e0d37fe73a967b7a5), [0xe944…](https://testnet.monadscan.com/tx/0xe944b0119a56765a07796026165b222a20418b8c3d998cf236c1d280ac0ac399), [0xe164…](https://testnet.monadscan.com/tx/0xe164fb9ae2f6cb0cffe54f514386232f273c81bf00160d481eb9ecbe437ba82e) |
| 5 | **TopUpRequested** +0.016 MON ("price now 0.46 MON"). The agent can only ask. It can't add money itself | Agent | [0x2c46…a9ba](https://testnet.monadscan.com/tx/0x2c46be66c268884816887d02738810d4ebc00583ef63c86ed579ba87b0f99ba9) |
| 6 | **TopUpApproved**: the owner sent 0.016 MON, so the budget is now 0.466 | Owner | [0x998d…e045](https://testnet.monadscan.com/tx/0x998d1d8322272fef025ae89096f3c8cfc99572cc7ee5a064df32e8816a25e045) |
| 7 | **Paid** 0.4 MON to BlockMart, order `BM-MV28XWJP` | Agent | [0x4782…134f](https://testnet.monadscan.com/tx/0x4782ed23edbad47a654b307f2cfd4b8f3b2d5607d392dea8b17e50c962cc134f) |
| 8 | **Closed**: 0.060985 MON refunded to the owner. `logHash` `0x171e…badc` stored. In the same tx the vault wrote ERC-8004 feedback for #2100: score 0, tag "blocked", because of the strike in #1 | Agent | [0x2144…1e2c](https://testnet.monadscan.com/tx/0x21444f741f8f8db665799eaaa86305463603070d191ad1c9a62849ec072e1e2c) |

**The money adds up** (using only the on-chain entries): locked 0.45 + top-up 0.016 = budget **0.466**. Spent: payments 0.403 + 0.5% fee 0.002015 = **0.405015**. Refund: 0.466 − 0.405015 = **0.060985**, exactly what entry #8 shows.
**Hash chain:** recomputed `0xdc3e7d0b…a773` = on-chain `lastHash` → **VERIFIED**.

Run `npx tsx scripts/verify-task.ts 10` to print all of the above live from the chain, including the tx for each entry and who signed it, the hash-chain check, the money totals and the ERC-8004 checks. Task 8 is a clean run to compare against: no block, and reputation score 100.
