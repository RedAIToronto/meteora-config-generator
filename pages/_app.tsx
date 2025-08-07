import type { AppProps } from 'next/app';
import Head from 'next/head';
import { ConnectionProvider } from '@solana/wallet-adapter-react';
import { WalletProvider } from '../contexts/WalletProvider';
import { RPC_ENDPOINTS } from '../utils/solana-config';
import '@/styles/globals.css';
import '@solana/wallet-adapter-react-ui/styles.css';

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <title>Meteora Config Generator</title>
        <meta name="description" content="Generate a config for Meteora's Dynamic Bonding Curve" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <ConnectionProvider endpoint={RPC_ENDPOINTS.mainnet}>
        <WalletProvider>
          <Component {...pageProps} />
        </WalletProvider>
      </ConnectionProvider>
    </>
  );
}

export default MyApp; 