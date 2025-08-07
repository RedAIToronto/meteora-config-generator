# Meteora Config Generator

This is a simple Next.js application that allows you to generate a configuration for a Meteora Dynamic Bonding Curve and create the configuration account on-chain.

## How to Run the Application

1.  **Navigate to the directory**:
    ```bash
    cd meteora-config-generator
    ```

2.  **Install dependencies**:
    If you haven't already, install the necessary packages.
    ```bash
    npm install
    ```

3.  **Run the development server**:
    ```bash
    npm run dev
    ```

4.  **Open the application**:
    Open [http://localhost:3000](http://localhost:3000) in your browser to see the application.

## How It Works

The application provides a user-friendly interface to create a bonding curve configuration with sensible defaults.

1.  **Connect Your Wallet**: First, connect your Solana wallet (e.g., Phantom, Solflare). The application runs on Devnet, so make sure you have some Devnet SOL.

2.  **Generate Config**: Click the "Generate Config" button. This uses the `@meteora-ag/dynamic-bonding-curve-sdk` to create a configuration object based on the parameters in the code. The generated config will be displayed on the screen.

3.  **Create Config On-Chain**: Once the config is generated, click the "Create Config Transaction" button. This will prompt you to sign a transaction in your wallet. The transaction will create a new account on the Solana Devnet with the configuration data stored on it.

4.  **View Transaction**: After the transaction is successfully sent, a link to the transaction on the Solana Explorer will be displayed. 