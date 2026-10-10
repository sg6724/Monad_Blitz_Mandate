#!/usr/bin/env bash
# Deploys TaskPayVault and verifies it on MonadVision + Monadscan via the Monskills verify API.
# Usage: scripts/deploy-vault.sh [chainId]   (10143 testnet by default)
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$PATH:$HOME/.foundry/bin"
source secrets/wallets.env
CHAIN=${1:-10143}
if [ "$CHAIN" = 143 ]; then RPC=https://rpc.monad.xyz; REP=0x8004BAa17C55a88189AE136b182e5fdA19dE9b63; else RPC=https://testnet-rpc.monad.xyz; REP=0x8004B663056A597Dffe9eCcC1965A193B7388713; fi
cd contracts
ADDR=$(forge create src/TaskPayVault.sol:TaskPayVault --rpc-url $RPC --private-key "$DEPLOYER_PRIVATE_KEY" --broadcast \
  --constructor-args "$DEPLOYER_ADDRESS" 50 "$REP" 2>&1 | awk '/Deployed to:/ {print $3}')
echo "Deployed TaskPayVault to $ADDR on chain $CHAIN"
mkdir -p ../.tmp
forge verify-contract "$ADDR" src/TaskPayVault.sol:TaskPayVault --chain "$CHAIN" --show-standard-json-input > ../.tmp/std.json
jq '.metadata' out/TaskPayVault.sol/TaskPayVault.json > ../.tmp/meta.json
ARGS=$(cast abi-encode "constructor(address,uint16,address)" "$DEPLOYER_ADDRESS" 50 "$REP")
CV=$(jq -r '.compiler.version' ../.tmp/meta.json)
jq -n --arg a "$ADDR" --arg cv "v$CV" --arg args "${ARGS#0x}" --argjson chain "$CHAIN" --slurpfile std ../.tmp/std.json --slurpfile meta ../.tmp/meta.json \
  '{chainId:$chain, contractAddress:$a, contractName:"src/TaskPayVault.sol:TaskPayVault", compilerVersion:$cv, standardJsonInput:$std[0], foundryMetadata:$meta[0], constructorArgs:$args}' > ../.tmp/verify.json
sleep 3
curl -s -m 120 -X POST https://agents.devnads.com/v1/verify -H 'Content-Type: application/json' -d @../.tmp/verify.json | jq -c '{success,verified,total}'
echo "$ADDR" > ../.tmp/vault-$CHAIN.txt
