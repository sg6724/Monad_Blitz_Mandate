import { createConfig, http } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { monadTestnet } from 'viem/chains';

export const wagmiConfig = createConfig({
  chains: [monadTestnet],
  connectors: [injected({ target: 'metaMask' }), injected()],
  transports: { [monadTestnet.id]: http('https://testnet-rpc.monad.xyz') },
  ssr: true,
});

export const CHAIN = monadTestnet;
