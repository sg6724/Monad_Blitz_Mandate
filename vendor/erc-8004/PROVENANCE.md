# ERC-8004 vendored contracts: provenance

Retrieved 2026-10-10 for TaskPay (Monad Blitz Pune V3). Reference copy only. The official
deployments already exist on **both** Monad mainnet and Monad testnet (see below), so these files
are for reading, ABI reference and local testing. We do not have to deploy them.

## Source

- Repo: https://github.com/erc-8004/erc-8004-contracts
- Commit cloned (HEAD of default branch): `b9e466c250744a7e06b13dff9d3c2844ed64f825` (2026-08-15)
- Last commit touching the two registry contracts: `27caef926f8529491256da5b86804cf827d44b93`
  (2026-01-24, "remove default set"). HEAD contents of both files are identical to the
  **Sourcify exact_match verified source** of the Monad implementations (diff only a trailing newline).
- Contract version: `getVersion()` returns `"2.0.0"` (on-chain on both chains as well).
- Spec: https://eips.ethereum.org/EIPS/eip-8004 (Draft). The repo also has a copy in ERC8004SPEC.md, not vendored.

## License

- The repo has **no LICENSE file**. README says "CC0 - Public Domain".
- SPDX headers in the vendored `.sol` files say `MIT`.
- OpenZeppelin dependencies are MIT.
- Either way it is permissive. Keep the SPDX headers as-is.

## Files in this directory

| File | Origin | Notes |
|---|---|---|
| `contracts/IdentityRegistryUpgradeable.sol` | repo `contracts/` | ERC-721 agent identity (UUPS) |
| `contracts/ReputationRegistryUpgradeable.sol` | repo `contracts/` | feedback registry (UUPS) |
| `contracts/ERC1967Proxy.sol` | repo `contracts/` | re-export of OZ ERC1967Proxy (the proxy actually deployed) |
| `contracts/HardhatMinimalUUPS.sol` | repo `contracts/` | placeholder impl, owner = msg.sender (use this for a self-deploy) |
| `contracts/MinimalUUPS.sol` | repo `contracts/` | placeholder impl used by official testnet deploy; **owner hard-coded to 0x547289319C3e6aedB179C0b8e8aF0B5ACd062603**, so do NOT use it for our own deploy |
| `abis/IdentityRegistry.json` | Sourcify (MonadVision) verified ABI of impl `0x7274e874...9c02` | authoritative ABI. The repo's `abis/IdentityRegistry.json` is stale: it lacks `isAuthorizedOrOwner` and the ECDSA errors |
| `abis/ReputationRegistry.json` | Sourcify verified ABI of impl `0x16e0fa7f...da34` | identical to repo `abis/ReputationRegistry.json` |

Not vendored: ValidationRegistryUpgradeable.sol (spec still in flux), MinimalUUPSMainnet.sol,
SingletonFactory.sol, plus scripts, tests and hardhat config (not reviewed for execution and not needed).

Review: all Solidity files above were read in full. Nothing malicious was found: no selfdestruct, no
arbitrary delegatecall, no hidden owners other than the documented hard-coded owner in MinimalUUPS.
Upgrades are gated by `onlyOwner` (`_authorizeUpgrade`).

## What is deployed on Monad (checked via RPC 2026-10-10)

Both chains use the same proxy pattern: an OZ `ERC1967Proxy` (Sourcify name
`project/contracts/ERC1967Proxy.sol:ERC1967Proxy`, solc 0.8.24) pointing at a UUPS
implementation. The implementation slot is the standard EIP-1967 slot
`0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc`.
(The slot ending in `...cc7453e8ddb6ad3f6e0a0f86` returns 0. It is not the EIP-1967 slot.)

| | Monad mainnet (143) | Monad testnet (10143) |
|---|---|---|
| IdentityRegistry proxy | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| ReputationRegistry proxy | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` | `0x8004B663056A597Dffe9eCcC1965A193B7388713` |
| ValidationRegistry proxy | n/a | `0x8004Cb1BF31DAf7788923b405b754f57acEB4272` (impl `0xdb31f5d9...7f99`) |
| Identity impl | `0x7274e874CA62410a93Bd8bf61c69d8045E399c02` | same address, identical bytecode |
| Reputation impl | `0x16e0FA7f7C56B9a767E34B192B51f921BE31dA34` | same address, identical bytecode |
| owner() (both proxies) | `0x547289319C3e6aedB179C0b8e8aF0B5ACd062603` | same |
| Reputation `getIdentityRegistry()` (slot 0) | `0x8004A169...a432` | `0x8004A818...BD9e` |
| Identity `_lastId` (agents registered) | 0x2858 = 10328 | 0x834 = 2100 |

The 0x8004A169/0x8004BAa1 pair is the **mainnet** vanity set. The 0x8004A818/0x8004B663 pair is
the **testnet** vanity set (same as Sepolia, Base Sepolia, etc.). Both sets were deployed via CREATE2
through the Safe singleton factory `0x914d7Fec6aaC8cd542e72Bca78B30650d45643d7` with different
placeholder salts. Implementations use salts 0x..05 (identity) and 0x..06 (reputation), which is why
the impl addresses are the same on every chain.

**Implication for TaskPay:** use a per-chain address map. The ABI is identical on both networks.
No self-deployment is needed.

## Verification status

MonadVision Sourcify (`https://sourcify-api-monad.blockvision.org/v2/contract/<chain>/<addr>`):
- Identity impl `0x7274...9c02`: chain 143 runtime `exact_match`; chain 10143 creation and runtime `exact_match`.
- Reputation impl `0x16e0...da34`: chain 143 runtime `exact_match`; chain 10143 creation and runtime `exact_match`.
- Mainnet identity proxy `0x8004A169...`: `match` (ERC1967Proxy).
- Testnet proxies `0x8004A818...` and `0x8004B663...`: not verified on Sourcify. Bytecode is byte-identical
  to the verified mainnet proxy runtime, and the impl slot points to the verified impls.
- sourcify.dev (main instance): not verified for any of these addresses.

Compiler settings (from verified metadata): solc `0.8.24+commit.e11b9ed9`, optimizer enabled runs=200,
`viaIR: true`, `evmVersion: shanghai`.

## Dependencies to compile

- `@openzeppelin/contracts-upgradeable@5.4.0`
- `@openzeppelin/contracts@5.4.0` (ECDSA, IERC1271, ERC1967Proxy)
- Foundry remappings (if used):
  ```
  @openzeppelin/contracts-upgradeable/=lib/openzeppelin-contracts-upgradeable/contracts/
  @openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/
  ```
  (Use tag v5.4.0 of both OZ repos. The upgradeable repo's own `lib/` submodule also provides the non-upgradeable package.)
- foundry.toml: `solc = "0.8.24"`, `via_ir = true`, `optimizer = true`, `optimizer_runs = 200`, `evm_version = "shanghai"`.
  viaIR is required to avoid stack-too-deep errors in `readAllFeedback` and `getSummary` (UNVERIFIED locally; matches upstream config).

## Upgradeability / initializer requirements (for a self-deploy, if ever needed)

- Both impl constructors call `_disableInitializers()`, so they take no constructor args.
- `IdentityRegistryUpgradeable.initialize()` is `reinitializer(2) onlyOwner`.
- `ReputationRegistryUpgradeable.initialize(address identityRegistry_)` is `reinitializer(2) onlyOwner`.
- Because the initializers are `onlyOwner` at version 2, **you cannot point a fresh proxy straight at
  the real impl**. Owner must first be set by a version-1 placeholder (`HardhatMinimalUUPS.initialize`,
  which runs `__Ownable_init(msg.sender)`). After that, upgrade with `upgradeToAndCall`.
- `ReputationRegistry` stores `_identityRegistry` in plain slot 0. The placeholder writes the same slot.
- Upgrade authority: `owner()` via `_authorizeUpgrade(...) onlyOwner`.

Self-deploy order (testnet, for reference only; the official one already exists):
1. Deploy `HardhatMinimalUUPS` impl (no args) → `M`.
2. Deploy `ERC1967Proxy(M, abi.encodeCall(HardhatMinimalUUPS.initialize, (address(0))))` → `IdP` (owner = deployer EOA).
3. Deploy `ERC1967Proxy(M, abi.encodeCall(HardhatMinimalUUPS.initialize, (IdP)))` → `RepP`.
4. Deploy `IdentityRegistryUpgradeable` impl (no args) → `IdI`; deploy `ReputationRegistryUpgradeable` impl → `RepI`.
5. As owner: `IdP.upgradeToAndCall(IdI, abi.encodeCall(IdentityRegistryUpgradeable.initialize, ()))`.
6. As owner: `RepP.upgradeToAndCall(RepI, abi.encodeCall(ReputationRegistryUpgradeable.initialize, (IdP)))`.
7. Check: `IdP.name()=="AgentIdentity"`, `IdP.getVersion()=="2.0.0"`, `RepP.getIdentityRegistry()==IdP`.
