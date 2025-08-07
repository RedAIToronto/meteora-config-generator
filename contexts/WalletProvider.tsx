import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { WalletProvider as SolanaWalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { FC, ReactNode, useMemo } from 'react';

export const WalletProvider: FC<{ children: ReactNode }> = ({ children }) => {
    // Using Mainnet
    const network = WalletAdapterNetwork.Mainnet;
    
    const wallets = useMemo(
        () => [
            new PhantomWalletAdapter(),
            new SolflareWalletAdapter(),
        ],
        [network]
    );

    // ConnectionProvider is now in _app.tsx with QuickNode RPC
    return (
        <SolanaWalletProvider wallets={wallets} autoConnect>
            <WalletModalProvider>{children}</WalletModalProvider>
        </SolanaWalletProvider>
    );
}; 