// Generated from contracts/out and vendor/erc-8004/abis. Do not edit by hand.
export const vaultAbi = [
 {
  "type": "constructor",
  "inputs": [
   {
    "name": "treasury_",
    "type": "address",
    "internalType": "address"
   },
   {
    "name": "feeBps_",
    "type": "uint16",
    "internalType": "uint16"
   },
   {
    "name": "reputation_",
    "type": "address",
    "internalType": "address"
   }
  ],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "MAX_BLOCKED",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "uint8",
    "internalType": "uint8"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "MAX_PAYEES",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "uint8",
    "internalType": "uint8"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "NO_AGENT",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "TOPUP_MAX_BPS",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "uint16",
    "internalType": "uint16"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "VELOCITY_MAX",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "uint8",
    "internalType": "uint8"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "VELOCITY_WINDOW",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "uint64",
    "internalType": "uint64"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "agentFrozen",
  "inputs": [
   {
    "name": "",
    "type": "address",
    "internalType": "address"
   },
   {
    "name": "",
    "type": "address",
    "internalType": "address"
   }
  ],
  "outputs": [
   {
    "name": "",
    "type": "bool",
    "internalType": "bool"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "check",
  "inputs": [
   {
    "name": "id",
    "type": "uint256",
    "internalType": "uint256"
   },
   {
    "name": "payee",
    "type": "address",
    "internalType": "address"
   },
   {
    "name": "amount",
    "type": "uint128",
    "internalType": "uint128"
   }
  ],
  "outputs": [
   {
    "name": "",
    "type": "uint8",
    "internalType": "enum TaskPayVault.Reason"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "close",
  "inputs": [
   {
    "name": "id",
    "type": "uint256",
    "internalType": "uint256"
   },
   {
    "name": "logHash",
    "type": "bytes32",
    "internalType": "bytes32"
   }
  ],
  "outputs": [],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "confirmPayment",
  "inputs": [
   {
    "name": "id",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "outputs": [
   {
    "name": "",
    "type": "bool",
    "internalType": "bool"
   }
  ],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "createMandate",
  "inputs": [
   {
    "name": "agent",
    "type": "address",
    "internalType": "address"
   },
   {
    "name": "token",
    "type": "address",
    "internalType": "address"
   },
   {
    "name": "budget",
    "type": "uint128",
    "internalType": "uint128"
   },
   {
    "name": "perPaymentCap",
    "type": "uint128",
    "internalType": "uint128"
   },
   {
    "name": "expiry",
    "type": "uint64",
    "internalType": "uint64"
   },
   {
    "name": "payees",
    "type": "address[]",
    "internalType": "address[]"
   },
   {
    "name": "purposeHash",
    "type": "bytes32",
    "internalType": "bytes32"
   },
   {
    "name": "draftId",
    "type": "bytes32",
    "internalType": "bytes32"
   },
   {
    "name": "agentId",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "outputs": [
   {
    "name": "id",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "stateMutability": "payable"
 },
 {
  "type": "function",
  "name": "declineTopUp",
  "inputs": [
   {
    "name": "id",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "outputs": [],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "feeBps",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "uint16",
    "internalType": "uint16"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "feeFor",
  "inputs": [
   {
    "name": "amount",
    "type": "uint128",
    "internalType": "uint128"
   }
  ],
  "outputs": [
   {
    "name": "",
    "type": "uint128",
    "internalType": "uint128"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "findByDraft",
  "inputs": [
   {
    "name": "",
    "type": "bytes32",
    "internalType": "bytes32"
   }
  ],
  "outputs": [
   {
    "name": "",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "freezeAndRefund",
  "inputs": [
   {
    "name": "agent",
    "type": "address",
    "internalType": "address"
   }
  ],
  "outputs": [],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "getHistory",
  "inputs": [
   {
    "name": "id",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "outputs": [
   {
    "name": "",
    "type": "tuple[]",
    "internalType": "struct TaskPayVault.Entry[]",
    "components": [
     {
      "name": "kind",
      "type": "uint8",
      "internalType": "enum TaskPayVault.Kind"
     },
     {
      "name": "reason",
      "type": "uint8",
      "internalType": "enum TaskPayVault.Reason"
     },
     {
      "name": "at",
      "type": "uint64",
      "internalType": "uint64"
     },
     {
      "name": "counterparty",
      "type": "address",
      "internalType": "address"
     },
     {
      "name": "amount",
      "type": "uint128",
      "internalType": "uint128"
     },
     {
      "name": "ref",
      "type": "bytes32",
      "internalType": "bytes32"
     },
     {
      "name": "hash",
      "type": "bytes32",
      "internalType": "bytes32"
     }
    ]
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "getMandate",
  "inputs": [
   {
    "name": "id",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "outputs": [
   {
    "name": "",
    "type": "tuple",
    "internalType": "struct TaskPayVault.Mandate",
    "components": [
     {
      "name": "owner",
      "type": "address",
      "internalType": "address"
     },
     {
      "name": "expiry",
      "type": "uint64",
      "internalType": "uint64"
     },
     {
      "name": "createdAt",
      "type": "uint64",
      "internalType": "uint64"
     },
     {
      "name": "agent",
      "type": "address",
      "internalType": "address"
     },
     {
      "name": "windowStart",
      "type": "uint64",
      "internalType": "uint64"
     },
     {
      "name": "windowCount",
      "type": "uint8",
      "internalType": "uint8"
     },
     {
      "name": "blocked",
      "type": "uint8",
      "internalType": "uint8"
     },
     {
      "name": "frozen",
      "type": "bool",
      "internalType": "bool"
     },
     {
      "name": "status",
      "type": "uint8",
      "internalType": "enum TaskPayVault.Status"
     },
     {
      "name": "token",
      "type": "address",
      "internalType": "address"
     },
     {
      "name": "agentId",
      "type": "uint256",
      "internalType": "uint256"
     },
     {
      "name": "budget",
      "type": "uint128",
      "internalType": "uint128"
     },
     {
      "name": "spent",
      "type": "uint128",
      "internalType": "uint128"
     },
     {
      "name": "perPaymentCap",
      "type": "uint128",
      "internalType": "uint128"
     },
     {
      "name": "originalBudget",
      "type": "uint128",
      "internalType": "uint128"
     },
     {
      "name": "toppedUp",
      "type": "uint128",
      "internalType": "uint128"
     },
     {
      "name": "pendingTopUp",
      "type": "uint128",
      "internalType": "uint128"
     },
     {
      "name": "purposeHash",
      "type": "bytes32",
      "internalType": "bytes32"
     },
     {
      "name": "draftId",
      "type": "bytes32",
      "internalType": "bytes32"
     },
     {
      "name": "logHash",
      "type": "bytes32",
      "internalType": "bytes32"
     },
     {
      "name": "lastHash",
      "type": "bytes32",
      "internalType": "bytes32"
     }
    ]
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "getPayees",
  "inputs": [
   {
    "name": "id",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "outputs": [
   {
    "name": "",
    "type": "address[]",
    "internalType": "address[]"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "historyLength",
  "inputs": [
   {
    "name": "id",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "outputs": [
   {
    "name": "",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "increaseBudget",
  "inputs": [
   {
    "name": "id",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "outputs": [],
  "stateMutability": "payable"
 },
 {
  "type": "function",
  "name": "isPayee",
  "inputs": [
   {
    "name": "",
    "type": "uint256",
    "internalType": "uint256"
   },
   {
    "name": "",
    "type": "address",
    "internalType": "address"
   }
  ],
  "outputs": [
   {
    "name": "",
    "type": "bool",
    "internalType": "bool"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "mandateCount",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "mandatesOf",
  "inputs": [
   {
    "name": "owner",
    "type": "address",
    "internalType": "address"
   }
  ],
  "outputs": [
   {
    "name": "",
    "type": "uint256[]",
    "internalType": "uint256[]"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "mandatesOfAgent",
  "inputs": [
   {
    "name": "agent",
    "type": "address",
    "internalType": "address"
   }
  ],
  "outputs": [
   {
    "name": "",
    "type": "uint256[]",
    "internalType": "uint256[]"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "openExpired",
  "inputs": [
   {
    "name": "max",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "outputs": [
   {
    "name": "ids",
    "type": "uint256[]",
    "internalType": "uint256[]"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "pay",
  "inputs": [
   {
    "name": "id",
    "type": "uint256",
    "internalType": "uint256"
   },
   {
    "name": "payee",
    "type": "address",
    "internalType": "address"
   },
   {
    "name": "amount",
    "type": "uint128",
    "internalType": "uint128"
   },
   {
    "name": "ref",
    "type": "bytes32",
    "internalType": "bytes32"
   }
  ],
  "outputs": [
   {
    "name": "",
    "type": "bool",
    "internalType": "bool"
   }
  ],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "pendingPayment",
  "inputs": [
   {
    "name": "",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "outputs": [
   {
    "name": "payee",
    "type": "address",
    "internalType": "address"
   },
   {
    "name": "amount",
    "type": "uint128",
    "internalType": "uint128"
   },
   {
    "name": "ref",
    "type": "bytes32",
    "internalType": "bytes32"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "reclaimExpired",
  "inputs": [
   {
    "name": "id",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "outputs": [],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "rejectPayment",
  "inputs": [
   {
    "name": "id",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "outputs": [],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "remaining",
  "inputs": [
   {
    "name": "id",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "outputs": [
   {
    "name": "",
    "type": "uint128",
    "internalType": "uint128"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "reputation",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "address",
    "internalType": "contract IReputationRegistry"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "requestApproval",
  "inputs": [
   {
    "name": "id",
    "type": "uint256",
    "internalType": "uint256"
   },
   {
    "name": "payee",
    "type": "address",
    "internalType": "address"
   },
   {
    "name": "amount",
    "type": "uint128",
    "internalType": "uint128"
   },
   {
    "name": "ref",
    "type": "bytes32",
    "internalType": "bytes32"
   }
  ],
  "outputs": [
   {
    "name": "",
    "type": "bool",
    "internalType": "bool"
   }
  ],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "requestTopUp",
  "inputs": [
   {
    "name": "id",
    "type": "uint256",
    "internalType": "uint256"
   },
   {
    "name": "amount",
    "type": "uint128",
    "internalType": "uint128"
   },
   {
    "name": "ref",
    "type": "bytes32",
    "internalType": "bytes32"
   }
  ],
  "outputs": [],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "setFrozen",
  "inputs": [
   {
    "name": "agent",
    "type": "address",
    "internalType": "address"
   },
   {
    "name": "frozen",
    "type": "bool",
    "internalType": "bool"
   }
  ],
  "outputs": [],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "treasury",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "address",
    "internalType": "address"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "unfreezeMandate",
  "inputs": [
   {
    "name": "id",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "outputs": [],
  "stateMutability": "nonpayable"
 },
 {
  "type": "event",
  "name": "EntryAdded",
  "inputs": [
   {
    "name": "id",
    "type": "uint256",
    "indexed": true,
    "internalType": "uint256"
   },
   {
    "name": "index",
    "type": "uint256",
    "indexed": false,
    "internalType": "uint256"
   },
   {
    "name": "kind",
    "type": "uint8",
    "indexed": false,
    "internalType": "enum TaskPayVault.Kind"
   },
   {
    "name": "reason",
    "type": "uint8",
    "indexed": false,
    "internalType": "enum TaskPayVault.Reason"
   },
   {
    "name": "counterparty",
    "type": "address",
    "indexed": false,
    "internalType": "address"
   },
   {
    "name": "amount",
    "type": "uint128",
    "indexed": false,
    "internalType": "uint128"
   },
   {
    "name": "ref",
    "type": "bytes32",
    "indexed": false,
    "internalType": "bytes32"
   },
   {
    "name": "hash",
    "type": "bytes32",
    "indexed": false,
    "internalType": "bytes32"
   }
  ],
  "anonymous": false
 },
 {
  "type": "event",
  "name": "MandateCreated",
  "inputs": [
   {
    "name": "id",
    "type": "uint256",
    "indexed": true,
    "internalType": "uint256"
   },
   {
    "name": "owner",
    "type": "address",
    "indexed": true,
    "internalType": "address"
   },
   {
    "name": "agent",
    "type": "address",
    "indexed": true,
    "internalType": "address"
   },
   {
    "name": "token",
    "type": "address",
    "indexed": false,
    "internalType": "address"
   },
   {
    "name": "budget",
    "type": "uint128",
    "indexed": false,
    "internalType": "uint128"
   },
   {
    "name": "draftId",
    "type": "bytes32",
    "indexed": false,
    "internalType": "bytes32"
   }
  ],
  "anonymous": false
 },
 {
  "type": "error",
  "name": "BadParams",
  "inputs": []
 },
 {
  "type": "error",
  "name": "BadValue",
  "inputs": []
 },
 {
  "type": "error",
  "name": "DraftUsed",
  "inputs": []
 },
 {
  "type": "error",
  "name": "NotAgent",
  "inputs": []
 },
 {
  "type": "error",
  "name": "NotExpired",
  "inputs": []
 },
 {
  "type": "error",
  "name": "NotOpen",
  "inputs": []
 },
 {
  "type": "error",
  "name": "NotOwner",
  "inputs": []
 },
 {
  "type": "error",
  "name": "NotOwnerOrAgent",
  "inputs": []
 },
 {
  "type": "error",
  "name": "NothingPending",
  "inputs": []
 },
 {
  "type": "error",
  "name": "PendingExists",
  "inputs": []
 },
 {
  "type": "error",
  "name": "ReentrancyGuardReentrantCall",
  "inputs": []
 },
 {
  "type": "error",
  "name": "SafeERC20FailedOperation",
  "inputs": [
   {
    "name": "token",
    "type": "address",
    "internalType": "address"
   }
  ]
 },
 {
  "type": "error",
  "name": "TopUpLimit",
  "inputs": []
 },
 {
  "type": "error",
  "name": "TransferFailed",
  "inputs": []
 }
] as const;

export const identityAbi = [
 {
  "name": "Registered",
  "type": "event",
  "inputs": [
   {
    "name": "agentId",
    "type": "uint256",
    "indexed": true,
    "internalType": "uint256"
   },
   {
    "name": "agentURI",
    "type": "string",
    "indexed": false,
    "internalType": "string"
   },
   {
    "name": "owner",
    "type": "address",
    "indexed": true,
    "internalType": "address"
   }
  ],
  "anonymous": false
 },
 {
  "name": "Transfer",
  "type": "event",
  "inputs": [
   {
    "name": "from",
    "type": "address",
    "indexed": true,
    "internalType": "address"
   },
   {
    "name": "to",
    "type": "address",
    "indexed": true,
    "internalType": "address"
   },
   {
    "name": "tokenId",
    "type": "uint256",
    "indexed": true,
    "internalType": "uint256"
   }
  ],
  "anonymous": false
 },
 {
  "name": "getAgentWallet",
  "type": "function",
  "inputs": [
   {
    "name": "agentId",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "outputs": [
   {
    "name": "",
    "type": "address",
    "internalType": "address"
   }
  ],
  "stateMutability": "view"
 },
 {
  "name": "ownerOf",
  "type": "function",
  "inputs": [
   {
    "name": "tokenId",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "outputs": [
   {
    "name": "",
    "type": "address",
    "internalType": "address"
   }
  ],
  "stateMutability": "view"
 },
 {
  "name": "register",
  "type": "function",
  "inputs": [],
  "outputs": [
   {
    "name": "agentId",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "stateMutability": "nonpayable"
 },
 {
  "name": "register",
  "type": "function",
  "inputs": [
   {
    "name": "agentURI",
    "type": "string",
    "internalType": "string"
   },
   {
    "name": "metadata",
    "type": "tuple[]",
    "components": [
     {
      "name": "metadataKey",
      "type": "string",
      "internalType": "string"
     },
     {
      "name": "metadataValue",
      "type": "bytes",
      "internalType": "bytes"
     }
    ],
    "internalType": "struct IdentityRegistryUpgradeable.MetadataEntry[]"
   }
  ],
  "outputs": [
   {
    "name": "agentId",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "stateMutability": "nonpayable"
 },
 {
  "name": "register",
  "type": "function",
  "inputs": [
   {
    "name": "agentURI",
    "type": "string",
    "internalType": "string"
   }
  ],
  "outputs": [
   {
    "name": "agentId",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "stateMutability": "nonpayable"
 },
 {
  "name": "setAgentURI",
  "type": "function",
  "inputs": [
   {
    "name": "agentId",
    "type": "uint256",
    "internalType": "uint256"
   },
   {
    "name": "newURI",
    "type": "string",
    "internalType": "string"
   }
  ],
  "outputs": [],
  "stateMutability": "nonpayable"
 },
 {
  "name": "tokenURI",
  "type": "function",
  "inputs": [
   {
    "name": "tokenId",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "outputs": [
   {
    "name": "",
    "type": "string",
    "internalType": "string"
   }
  ],
  "stateMutability": "view"
 }
] as const;

export const reputationAbi = [
 {
  "name": "NewFeedback",
  "type": "event",
  "inputs": [
   {
    "name": "agentId",
    "type": "uint256",
    "indexed": true,
    "internalType": "uint256"
   },
   {
    "name": "clientAddress",
    "type": "address",
    "indexed": true,
    "internalType": "address"
   },
   {
    "name": "feedbackIndex",
    "type": "uint64",
    "indexed": false,
    "internalType": "uint64"
   },
   {
    "name": "value",
    "type": "int128",
    "indexed": false,
    "internalType": "int128"
   },
   {
    "name": "valueDecimals",
    "type": "uint8",
    "indexed": false,
    "internalType": "uint8"
   },
   {
    "name": "indexedTag1",
    "type": "string",
    "indexed": true,
    "internalType": "string"
   },
   {
    "name": "tag1",
    "type": "string",
    "indexed": false,
    "internalType": "string"
   },
   {
    "name": "tag2",
    "type": "string",
    "indexed": false,
    "internalType": "string"
   },
   {
    "name": "endpoint",
    "type": "string",
    "indexed": false,
    "internalType": "string"
   },
   {
    "name": "feedbackURI",
    "type": "string",
    "indexed": false,
    "internalType": "string"
   },
   {
    "name": "feedbackHash",
    "type": "bytes32",
    "indexed": false,
    "internalType": "bytes32"
   }
  ],
  "anonymous": false
 },
 {
  "name": "getClients",
  "type": "function",
  "inputs": [
   {
    "name": "agentId",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "outputs": [
   {
    "name": "",
    "type": "address[]",
    "internalType": "address[]"
   }
  ],
  "stateMutability": "view"
 },
 {
  "name": "getSummary",
  "type": "function",
  "inputs": [
   {
    "name": "agentId",
    "type": "uint256",
    "internalType": "uint256"
   },
   {
    "name": "clientAddresses",
    "type": "address[]",
    "internalType": "address[]"
   },
   {
    "name": "tag1",
    "type": "string",
    "internalType": "string"
   },
   {
    "name": "tag2",
    "type": "string",
    "internalType": "string"
   }
  ],
  "outputs": [
   {
    "name": "count",
    "type": "uint64",
    "internalType": "uint64"
   },
   {
    "name": "summaryValue",
    "type": "int128",
    "internalType": "int128"
   },
   {
    "name": "summaryValueDecimals",
    "type": "uint8",
    "internalType": "uint8"
   }
  ],
  "stateMutability": "view"
 },
 {
  "name": "readAllFeedback",
  "type": "function",
  "inputs": [
   {
    "name": "agentId",
    "type": "uint256",
    "internalType": "uint256"
   },
   {
    "name": "clientAddresses",
    "type": "address[]",
    "internalType": "address[]"
   },
   {
    "name": "tag1",
    "type": "string",
    "internalType": "string"
   },
   {
    "name": "tag2",
    "type": "string",
    "internalType": "string"
   },
   {
    "name": "includeRevoked",
    "type": "bool",
    "internalType": "bool"
   }
  ],
  "outputs": [
   {
    "name": "clients",
    "type": "address[]",
    "internalType": "address[]"
   },
   {
    "name": "feedbackIndexes",
    "type": "uint64[]",
    "internalType": "uint64[]"
   },
   {
    "name": "values",
    "type": "int128[]",
    "internalType": "int128[]"
   },
   {
    "name": "valueDecimals",
    "type": "uint8[]",
    "internalType": "uint8[]"
   },
   {
    "name": "tag1s",
    "type": "string[]",
    "internalType": "string[]"
   },
   {
    "name": "tag2s",
    "type": "string[]",
    "internalType": "string[]"
   },
   {
    "name": "revokedStatuses",
    "type": "bool[]",
    "internalType": "bool[]"
   }
  ],
  "stateMutability": "view"
 }
] as const;
