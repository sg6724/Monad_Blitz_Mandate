# ERC-8004 v2.0.0: signatures TaskPay will call

Source of truth: verified implementations on Monad (see PROVENANCE.md) and `abis/*.json` in this dir.
The ABI is the same on mainnet and testnet; only the addresses differ.

| | Monad mainnet (143) | Monad testnet (10143) |
|---|---|---|
| IdentityRegistry | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| ReputationRegistry | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` | `0x8004B663056A597Dffe9eCcC1965A193B7388713` |

Selectors were computed locally with keccak256. They were sanity-checked against known values for
`Transfer` and `tokenURI`.

## IdentityRegistry (ERC-721 "AgentIdentity"/"AGENT", ERC721URIStorage, EIP-712 domain "ERC8004IdentityRegistry" v"1")

```solidity
struct MetadataEntry { string metadataKey; bytes metadataValue; }

function register() external returns (uint256 agentId);                                   // 0x1aa3a008
function register(string agentURI) external returns (uint256 agentId);                    // 0xf2c298be
function register(string agentURI, MetadataEntry[] metadata) external returns (uint256);  // 0x8ea42286
function setAgentURI(uint256 agentId, string newURI) external;                            // 0x0af28bd3
function tokenURI(uint256 agentId) external view returns (string);                        // 0xc87b56dd
function ownerOf(uint256 agentId) external view returns (address);                        // 0x6352211e
function setMetadata(uint256 agentId, string metadataKey, bytes metadataValue) external;  // 0x466648da
function getMetadata(uint256 agentId, string metadataKey) external view returns (bytes);  // 0xcb4799f2
function getAgentWallet(uint256 agentId) external view returns (address);                 // 0x00339509
function setAgentWallet(uint256 agentId, address newWallet, uint256 deadline, bytes signature) external; // 0x2d1ef5ae
function unsetAgentWallet(uint256 agentId) external;
function isAuthorizedOrOwner(address spender, uint256 agentId) external view returns (bool); // 0xd95e72be
function getVersion() external pure returns (string); // "2.0.0"
```

How it behaves (from source):
- `register*` mints to `msg.sender`. Anyone can call it and there is no fee. `agentId` starts at **0** and
  increments (`_lastId++`). Because of the `register` overloads, viem/ethers need the full signature
  (e.g. `"register(string)"`) or an explicit ABI item. Read `agentId` from the return value of a
  simulated call, or from the `Registered` / `Transfer` event in the receipt.
- `_safeMint` is used. If the caller is a contract, it must implement `onERC721Received`.
- On register, `agentWallet` metadata is set to `msg.sender`. Key `"agentWallet"` is reserved: `setMetadata` and
  the `register` metadata array revert with `"reserved key"` for it.
- `setMetadata` / `setAgentURI` / `setAgentWallet` / `unsetAgentWallet`: the caller must be the owner,
  an operator approved for all, or the token-approved address. Otherwise they revert with `"Not authorized"`.
- `setAgentWallet` signature: an EIP-712 typed-data signature **by `newWallet`** over
  `AgentWalletSet(uint256 agentId,address newWallet,address owner,uint256 deadline)`
  (typehash `0x678b53cd718d595370ab070ebf48edfdcd834beac116bf23e625fc7f4d5b7d32`), with domain
  `{name:"ERC8004IdentityRegistry", version:"1", chainId, verifyingContract: IdentityRegistry proxy}`.
  `owner` is the current token owner. The deadline must satisfy `now <= deadline <= now + 300s`. If ECDSA
  recovery fails, the contract falls back to ERC-1271 `isValidSignature` on `newWallet`.
- Transferring the NFT clears `agentWallet`.
- The agent card / registration file is just the `tokenURI` string (ipfs:// or https:// or data:). Its shape is
  defined in the spec (type, name, description, image, services[], registrations[{agentRegistry, agentId}], supportedTrust[]),
  where `agentRegistry = "eip155:<chainId>:<IdentityRegistry address>"`.

Events:
```solidity
event Registered(uint256 indexed agentId, string agentURI, address indexed owner);
// topic0 0xca52e62c367d81bb2e328eb795f7c7ba24afb478408a26c0e201d155c449bc4a
event MetadataSet(uint256 indexed agentId, string indexed indexedMetadataKey, string metadataKey, bytes metadataValue);
// topic0 0x2c149ed548c6d2993cd73efe187df6eccabe4538091b33adbd25fafdb8a1468b
event URIUpdated(uint256 indexed agentId, string newURI, address indexed updatedBy);
// topic0 0x3a2c7fffc2cba7582c690e3b82c453ea02a308326a98a3ad7576c606336409fb
event Transfer(address indexed from, address indexed to, uint256 indexed tokenId); // ERC-721
```

## ReputationRegistry

```solidity
function giveFeedback(
    uint256 agentId,
    int128  value,          // signed fixed-point, |value| <= 1e38
    uint8   valueDecimals,  // 0..18
    string  tag1,           // optional, "" allowed (indexed in event as keccak)
    string  tag2,           // optional
    string  endpoint,       // optional, emitted only (not stored)
    string  feedbackURI,    // optional, emitted only (off-chain feedback JSON)
    bytes32 feedbackHash    // optional, emitted only (keccak of feedbackURI content; 0x0 ok)
) external;                                                                                  // 0x3c036a7e

function revokeFeedback(uint256 agentId, uint64 feedbackIndex) external;                     // 0x4ab3ca99
function appendResponse(uint256 agentId, address clientAddress, uint64 feedbackIndex,
                        string responseURI, bytes32 responseHash) external;                  // 0xc2349ab2

function getSummary(uint256 agentId, address[] clientAddresses, string tag1, string tag2)
    external view returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals);   // 0x81bbba58
function readFeedback(uint256 agentId, address clientAddress, uint64 feedbackIndex)
    external view returns (int128 value, uint8 valueDecimals, string tag1, string tag2, bool isRevoked); // 0x232b0810
function readAllFeedback(uint256 agentId, address[] clientAddresses, string tag1, string tag2, bool includeRevoked)
    external view returns (address[] clients, uint64[] feedbackIndexes, int128[] values,
                           uint8[] valueDecimals, string[] tag1s, string[] tag2s, bool[] revokedStatuses); // 0xd9d84224
function getClients(uint256 agentId) external view returns (address[]);                       // 0x42dd519c
function getLastIndex(uint256 agentId, address clientAddress) external view returns (uint64); // 0xf2d81759
function getResponseCount(uint256 agentId, address clientAddress, uint64 feedbackIndex, address[] responders) external view returns (uint64);
function getIdentityRegistry() external view returns (address);                               // 0xbc4d861b
```

### Who must sign what for feedback to be accepted

**No feedbackAuth and no signature in v2.0.0.** (Older drafts had a mandatory `feedbackAuth` signed by the
agent. It was removed and does not exist in the deployed ABI.) `giveFeedback` is a plain tx from the client:
- `msg.sender` is the client (rater). Feedback is keyed by `(agentId, msg.sender)`.
- The tx reverts with `"Self-feedback not allowed"` if `msg.sender` is the agent's owner, an approved-for-all
  operator, or the token-approved address (checked via `IdentityRegistry.isAuthorizedOrOwner`).
  **So the agent's owner wallet cannot rate its own agent. The rater must be a different address.**
- It reverts with `ERC721NonexistentToken(agentId)` if the agent doesn't exist.
- It reverts with `"too many decimals"` if `valueDecimals > 18`, and `"value too large"` if `|value| > 1e38`.
- `feedbackIndex` is 1-based per (agentId, client) and increments on each call. Only the original client can revoke.
- Anti-spam is entirely the reader's job: `getSummary` **reverts with `"clientAddresses required"`** if the
  array is empty. Pass the set of client addresses you trust (e.g. TaskPay's escrow/payer addresses);
  `getClients(agentId)` lists everyone who rated.

### getSummary semantics

It averages non-revoked feedback from the given clients. A filter tag of `""` matches everything. Values are normalised to
18 decimals, averaged, then rescaled to the **most common** `valueDecimals` among the matching entries.
For example, three entries of 90, 80, 100 with decimals 0 give `(3, 90, 0)`. Gas grows with the total number of entries,
so keep it to view calls only.

Events:
```solidity
event NewFeedback(uint256 indexed agentId, address indexed clientAddress, uint64 feedbackIndex, int128 value,
    uint8 valueDecimals, string indexed indexedTag1, string tag1, string tag2, string endpoint,
    string feedbackURI, bytes32 feedbackHash);
// topic0 0x6a4a61743519c9d648a14e6493f47dbe3ff1aa29e7785c96c8326a205e58febc
event FeedbackRevoked(uint256 indexed agentId, address indexed clientAddress, uint64 indexed feedbackIndex);
// topic0 0x25156fd3288212246d8b008d5921fde376c71ed14ac2e072a506eb06fde6d09d
event ResponseAppended(uint256 indexed agentId, address indexed clientAddress, uint64 feedbackIndex,
    address indexed responder, string responseURI, bytes32 responseHash);
// topic0 0xb1c6be0b5b8aef6539e2fac0fd131a2faa7b49edf8e505b5eb0ad487d56051d4
```
