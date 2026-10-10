import { decodeEventLog, type Address, type PublicClient, type WalletClient } from 'viem';
import { identityAbi, reputationAbi } from './abi';
import { addressesFor, DEFAULT_CHAIN_ID, type ChainId } from './vault';

/** Data-URI agent card (ERC-8004 registration file). */
export function agentCard(name: string, description: string, chainId: ChainId = DEFAULT_CHAIN_ID) {
  const card = {
    type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
    name,
    description,
    services: [{ name: 'taskpay', endpoint: 'mcp' }],
    supportedTrust: ['reputation'],
    registrations: [{ agentRegistry: `eip155:${chainId}:${addressesFor(chainId).identityRegistry}` }],
  };
  return `data:application/json;base64,${Buffer.from(JSON.stringify(card)).toString('base64')}`;
}

/** Registers the caller as an ERC-8004 agent and returns its agentId. */
export async function registerAgent(wc: WalletClient, pc: PublicClient, uri: string, chainId: ChainId = DEFAULT_CHAIN_ID): Promise<bigint> {
  const address = addressesFor(chainId).identityRegistry;
  const { request } = await pc.simulateContract({
    address,
    abi: identityAbi,
    functionName: 'register',
    args: [uri],
    account: wc.account!,
  } as any);
  const hash = await wc.writeContract(request as any);
  const receipt = await pc.waitForTransactionReceipt({ hash });
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== address.toLowerCase()) continue;
    try {
      const ev = decodeEventLog({ abi: identityAbi, data: log.data, topics: log.topics }) as any;
      if (ev.eventName === 'Registered') return ev.args.agentId as bigint;
      if (ev.eventName === 'Transfer') return ev.args.tokenId as bigint;
    } catch {
      /* not ours */
    }
  }
  throw new Error('Registered event not found');
}

/** Average TaskPay feedback for an agent, counting only feedback written by the vault. */
export async function agentReputation(pc: PublicClient, agentId: bigint, chainId: ChainId = DEFAULT_CHAIN_ID) {
  const a = addressesFor(chainId);
  if (!a.vault) return null;
  try {
    const [count, value, decimals] = (await pc.readContract({
      address: a.reputationRegistry,
      abi: reputationAbi,
      functionName: 'getSummary',
      args: [agentId, [a.vault as Address], 'taskpay', ''],
    })) as readonly [bigint, bigint, number];
    return { count: Number(count), avg: Number(value) / 10 ** Number(decimals) };
  } catch {
    return { count: 0, avg: 0 };
  }
}
