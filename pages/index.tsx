import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import {
  buildCurve,
  buildCurveWithMarketCap,
  DynamicBondingCurveClient,
  ConfigParameters,
} from '@meteora-ag/dynamic-bonding-curve-sdk';
import { PublicKey, Keypair } from '@solana/web3.js';
import BN from 'bn.js';
import { parseMeteoraError } from '../utils/error-codes';

// Dynamically import WalletMultiButton to avoid SSR issues
const WalletMultiButton = dynamic(
  () => import('@solana/wallet-adapter-react-ui').then(mod => mod.WalletMultiButton),
  { ssr: false }
);

// Common token mint addresses - THESE ARE THE CORRECT ONES FOR METEORA
const TOKEN_MINTS = {
  // Native SOL (wrapped SOL) - USE THIS FOR MAINNET
  SOL: 'So11111111111111111111111111111111111111112',
  // USDC on mainnet - VERIFIED WORKING
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  // USDC on devnet
  USDC_DEV: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
};

// Get current network from connection
const getNetwork = (endpoint: string) => {
  if (endpoint.includes('mainnet')) return 'mainnet';
  if (endpoint.includes('devnet')) return 'devnet';
  if (endpoint.includes('testnet')) return 'testnet';
  return 'custom';
};

// Numeric values for enums to avoid SDK errors
const ENUMS = {
  BaseFeeMode: {
    FeeSchedulerLinear: 0,
    FeeSchedulerExponential: 1,
    RateLimiter: 2,
  },
  TokenType: {
    SPL: 0,
    Token2022: 1,
  },
  ActivationType: {
    Slot: 0,
    Timestamp: 1,
  },
  CollectFeeMode: {
    QuoteToken: 0,
    OutputToken: 1,
  },
  MigrationFeeOption: {
    FixedBps25: 0,
    FixedBps30: 1,
    FixedBps100: 2,
    FixedBps200: 3,
    FixedBps400: 4,
    FixedBps600: 5,
    Customizable: 6,
  },
  TokenDecimal: {
    SIX: 6,
    SEVEN: 7,
    EIGHT: 8,
    NINE: 9,
  },
  DammV2DynamicFeeMode: {
    Disabled: 0,
    Enabled: 1,
  },
};

export default function Home() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const [config, setConfig] = useState<ConfigParameters | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [txSignature, setTxSignature] = useState('');
  const [configKey, setConfigKey] = useState('');
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState('basic');
  const [buildMode, setBuildMode] = useState<'supply' | 'marketcap'>('supply');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showHelp, setShowHelp] = useState<string | null>(null);
  
  // Detect current network
  const currentNetwork = getNetwork(connection.rpcEndpoint);
  const isMainnet = currentNetwork === 'mainnet';

  // Form state with comprehensive defaults
  const [formData, setFormData] = useState({
    // Basic Setup
    totalTokenSupply: 1000000000,
    percentageSupplyOnMigration: 20,
    migrationQuoteThreshold: 80,
    
    // Market Cap Mode
    initialMarketCap: 5000, // in USD
    migrationMarketCap: 100000, // in USD
    solPrice: 100, // Current SOL price in USD
    
    // LP Split (MUST = 100%)
    partnerLpPercentage: 0,
    creatorLpPercentage: 0,
    partnerLockedLpPercentage: 100,
    creatorLockedLpPercentage: 0,
    
    // Trading Fees
    baseFeeMode: ENUMS.BaseFeeMode.FeeSchedulerLinear,
    startingFeeBps: 200, // 2%
    endingFeeBps: 200, // 2%
    numberOfPeriods: 0,
    totalDuration: 0,
    
    // Rate Limiter (alternative fee mode)
    baseFeeBps: 100,
    feeIncrementBps: 10,
    referenceAmount: 1000000,
    maxLimiterDuration: 3600,
    
    // Dynamic Fees (V2)
    dynamicFeeEnabled: true,
    binStep: 1,
    filterPeriod: 10,
    decayPeriod: 120,
    reductionFactor: 1000,
    variableFeeControl: 100000,
    maxVolatilityAccumulator: 100000,
    
    // Migration Fees
    migrationFeePercentage: 10,
    creatorMigrationFeeShare: 0,
    creatorTradingFeePercentage: 0,
    
    // Vesting
    enableVesting: false,
    vestingTotalAmount: 0,
    vestingPeriods: 0,
    vestingFrequency: 86400, // Daily
    vestingCliffDuration: 0,
    vestingCliffAmount: 0,
    
    // Advanced
    migrationOption: 1, // 0 for DAMM V1, 1 for DAMM V2
    migrationFeeOption: 5, // corresponds to FixedBps600
    tokenType: 0, // 0 for SPL
    tokenUpdateAuthority: 1, // 1 for Immutable
    activationType: 0, // 0 for Slot
    collectFeeMode: 0, // 0 for QuoteToken
    tokenDecimals: 9, // 9 decimals
    
    // V2 Specific (when using Customizable fee option)
    v2CollectFeeMode: ENUMS.CollectFeeMode.QuoteToken,
    v2DynamicFee: ENUMS.DammV2DynamicFeeMode.Enabled,
    v2PoolFeeBps: 250, // 2.5%
    
    // Addresses
    quoteMintAddress: TOKEN_MINTS.SOL,
    feeClaimerAddress: '',
    leftoverReceiverAddress: '',
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (publicKey) {
      setFormData(prev => ({
        ...prev,
        feeClaimerAddress: prev.feeClaimerAddress || publicKey.toString(),
        leftoverReceiverAddress: prev.leftoverReceiverAddress || publicKey.toString(),
      }));
    }
  }, [publicKey]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked :
               type === 'number' ? Number(value) : value
    }));
  };

  const validateLpPercentages = () => {
    const total = formData.partnerLpPercentage + formData.creatorLpPercentage + 
                  formData.partnerLockedLpPercentage + formData.creatorLockedLpPercentage;
    return total === 100;
  };

  const calculateBondingCurveMetrics = () => {
    const supply = Number(formData.totalTokenSupply) || 0;
    const percentOnMigration = Number(formData.percentageSupplyOnMigration) || 20;
    const threshold = Number(formData.migrationQuoteThreshold) || 0;
    const isUSDC = formData.quoteMintAddress.includes('USDC');
    
    if (supply === 0 || threshold === 0) return null;
    
    const tokensAtMigration = supply * (percentOnMigration / 100);
    const priceAtMigration = threshold / tokensAtMigration;
    
    // Bonding curve typically starts at ~1/15th of migration price
    // This is approximation - actual calculation is complex
    const estimatedStartPrice = priceAtMigration / 14.4;
    const estimatedStartMarketCap = supply * estimatedStartPrice;
    
    return {
      tokensAtMigration,
      priceAtMigration,
      estimatedStartPrice,
      estimatedStartMarketCap,
      quoteCurrency: isUSDC ? 'USDC' : 'SOL',
      thresholdFormatted: isUSDC ? `$${threshold.toLocaleString()}` : `${threshold} SOL`
    };
  };

  const calculateInitialPrice = () => {
    if (buildMode === 'marketcap' && formData.initialMarketCap && formData.totalTokenSupply) {
      return (formData.initialMarketCap / formData.totalTokenSupply).toFixed(6);
    }
    return '0.000001';
  };

  const handleGenerateConfig = () => {
    if (!validateLpPercentages()) {
      alert('❌ LP percentages must total 100%!');
      return;
    }

    // Validate token supply
    const tokenSupply = Number(formData.totalTokenSupply);
    if (isNaN(tokenSupply) || tokenSupply <= 0 || tokenSupply > 1e15) {
      alert('❌ Invalid token supply! Must be between 1 and 1,000,000,000,000,000');
      return;
    }

    try {
      let curveConfig;
      
      if (buildMode === 'marketcap') {
        // Using market cap mode
        curveConfig = buildCurveWithMarketCap({
          totalTokenSupply: Number(formData.totalTokenSupply),
          initialMarketCap: Number(formData.initialMarketCap),
          migrationMarketCap: Number(formData.migrationMarketCap),
          migrationOption: formData.migrationOption,
          tokenBaseDecimal: formData.tokenDecimals,
          tokenQuoteDecimal: formData.quoteMintAddress.includes('USDC') ? ENUMS.TokenDecimal.SIX : ENUMS.TokenDecimal.NINE,
          lockedVestingParam: formData.enableVesting ? {
            totalLockedVestingAmount: Number(formData.vestingTotalAmount),
            numberOfVestingPeriod: Number(formData.vestingPeriods),
            cliffUnlockAmount: Number(formData.vestingCliffAmount),
            totalVestingDuration: Number(formData.vestingPeriods) * Number(formData.vestingFrequency),
            cliffDurationFromMigrationTime: Number(formData.vestingCliffDuration),
          } : {
            totalLockedVestingAmount: 0,
            numberOfVestingPeriod: 0,
            cliffUnlockAmount: 0,
            totalVestingDuration: 0,
            cliffDurationFromMigrationTime: 0,
          },
          baseFeeParams: formData.baseFeeMode === ENUMS.BaseFeeMode.RateLimiter ? {
            baseFeeMode: ENUMS.BaseFeeMode.RateLimiter,
            rateLimiterParam: {
              baseFeeBps: Number(formData.baseFeeBps),
              feeIncrementBps: Number(formData.feeIncrementBps),
              referenceAmount: Number(formData.referenceAmount),
              maxLimiterDuration: Number(formData.maxLimiterDuration),
            }
          } : {
            baseFeeMode: formData.baseFeeMode,
            feeSchedulerParam: {
              startingFeeBps: Number(formData.startingFeeBps),
              endingFeeBps: Number(formData.endingFeeBps),
              numberOfPeriod: Number(formData.numberOfPeriods),
              totalDuration: Number(formData.totalDuration),
            }
          },
          dynamicFeeEnabled: formData.dynamicFeeEnabled && formData.migrationOption === 1,
          activationType: formData.activationType,
          collectFeeMode: formData.collectFeeMode,
          migrationFeeOption: formData.migrationFeeOption,
          tokenType: formData.tokenType,
          partnerLpPercentage: Number(formData.partnerLpPercentage),
          creatorLpPercentage: Number(formData.creatorLpPercentage),
          partnerLockedLpPercentage: Number(formData.partnerLockedLpPercentage),
          creatorLockedLpPercentage: Number(formData.creatorLockedLpPercentage),
          creatorTradingFeePercentage: Number(formData.creatorTradingFeePercentage),
          leftover: 0,
          tokenUpdateAuthority: formData.tokenUpdateAuthority,
          migrationFee: {
            feePercentage: Number(formData.migrationFeePercentage),
            creatorFeePercentage: Number(formData.creatorMigrationFeeShare),
          },
          migratedPoolFee: (formData.migrationOption === 1 && 
                            formData.migrationFeeOption === 5) ? {
            collectFeeMode: formData.v2CollectFeeMode,
            dynamicFee: formData.v2DynamicFee,
            poolFeeBps: Number(formData.v2PoolFeeBps),
          } : {
            collectFeeMode: ENUMS.CollectFeeMode.QuoteToken,
            dynamicFee: ENUMS.DammV2DynamicFeeMode.Disabled,
            poolFeeBps: 0,
          },
        });
      } else {
        // Using supply mode
        curveConfig = buildCurve({
          totalTokenSupply: Number(formData.totalTokenSupply),
          percentageSupplyOnMigration: Number(formData.percentageSupplyOnMigration),
          migrationQuoteThreshold: Number(formData.migrationQuoteThreshold),
          migrationOption: formData.migrationOption,
          tokenBaseDecimal: formData.tokenDecimals,
          tokenQuoteDecimal: formData.quoteMintAddress.includes('USDC') ? ENUMS.TokenDecimal.SIX : ENUMS.TokenDecimal.NINE,
          lockedVestingParam: formData.enableVesting ? {
            totalLockedVestingAmount: Number(formData.vestingTotalAmount),
            numberOfVestingPeriod: Number(formData.vestingPeriods),
            cliffUnlockAmount: Number(formData.vestingCliffAmount),
            totalVestingDuration: Number(formData.vestingPeriods) * Number(formData.vestingFrequency),
            cliffDurationFromMigrationTime: Number(formData.vestingCliffDuration),
          } : {
            totalLockedVestingAmount: 0,
            numberOfVestingPeriod: 0,
            cliffUnlockAmount: 0,
            totalVestingDuration: 0,
            cliffDurationFromMigrationTime: 0,
          },
          baseFeeParams: formData.baseFeeMode === ENUMS.BaseFeeMode.RateLimiter ? {
            baseFeeMode: ENUMS.BaseFeeMode.RateLimiter,
            rateLimiterParam: {
              baseFeeBps: Number(formData.baseFeeBps),
              feeIncrementBps: Number(formData.feeIncrementBps),
              referenceAmount: Number(formData.referenceAmount),
              maxLimiterDuration: Number(formData.maxLimiterDuration),
            }
          } : {
            baseFeeMode: formData.baseFeeMode,
            feeSchedulerParam: {
              startingFeeBps: Number(formData.startingFeeBps),
              endingFeeBps: Number(formData.endingFeeBps),
              numberOfPeriod: Number(formData.numberOfPeriods),
              totalDuration: Number(formData.totalDuration),
            }
          },
          dynamicFeeEnabled: formData.dynamicFeeEnabled && formData.migrationOption === 1,
          activationType: formData.activationType,
          collectFeeMode: formData.collectFeeMode,
          migrationFeeOption: formData.migrationFeeOption,
          tokenType: formData.tokenType,
          partnerLpPercentage: Number(formData.partnerLpPercentage),
          creatorLpPercentage: Number(formData.creatorLpPercentage),
          partnerLockedLpPercentage: Number(formData.partnerLockedLpPercentage),
          creatorLockedLpPercentage: Number(formData.creatorLockedLpPercentage),
          creatorTradingFeePercentage: Number(formData.creatorTradingFeePercentage),
          leftover: 0,
          tokenUpdateAuthority: formData.tokenUpdateAuthority,
          migrationFee: {
            feePercentage: Number(formData.migrationFeePercentage),
            creatorFeePercentage: Number(formData.creatorMigrationFeeShare),
          },
          migratedPoolFee: (formData.migrationOption === 1 && 
                            formData.migrationFeeOption === 5) ? {
            collectFeeMode: formData.v2CollectFeeMode,
            dynamicFee: formData.v2DynamicFee,
            poolFeeBps: Number(formData.v2PoolFeeBps),
          } : {
            collectFeeMode: ENUMS.CollectFeeMode.QuoteToken,
            dynamicFee: ENUMS.DammV2DynamicFeeMode.Disabled,
            poolFeeBps: 0,
          },
        });
      }
      
      setConfig(curveConfig);
      alert('✅ Config generated successfully!');
    } catch (error) {
      console.error('Error:', error);
      alert(`❌ Error: ${error instanceof Error ? error.message : 'Failed to generate config'}`);
    }
  };

  const handleCreateConfig = async () => {
    if (!publicKey || !config) {
      alert('❌ Connect wallet and generate config first!');
      return;
    }

    if (!formData.feeClaimerAddress || !formData.leftoverReceiverAddress) {
      alert('❌ Enter fee claimer and leftover receiver addresses!');
      return;
    }

    // Validate addresses
    try {
      const feeClaimerPubkey = new PublicKey(formData.feeClaimerAddress);
      const leftoverReceiverPubkey = new PublicKey(formData.leftoverReceiverAddress);
      const quoteMintPubkey = new PublicKey(formData.quoteMintAddress);
      
      // Check network and quote mint compatibility
      const endpoint = connection.rpcEndpoint;
      const isMainnet = endpoint.includes('mainnet') || endpoint.includes('quiknode');
      const isDevnet = endpoint.includes('devnet');
      
      console.log('Network:', isMainnet ? 'Mainnet' : isDevnet ? 'Devnet' : 'Unknown');
      console.log('Quote Mint:', formData.quoteMintAddress);
      
      // For SOL, use the native mint
      if (formData.quoteMintAddress === TOKEN_MINTS.SOL) {
        console.log('Using native SOL mint');
      } else {
        // Check if quote mint exists on-chain for other tokens
        const quoteMintAccount = await connection.getAccountInfo(quoteMintPubkey);
        if (!quoteMintAccount) {
          alert(`❌ Quote mint ${formData.quoteMintAddress} does not exist on ${isMainnet ? 'mainnet' : 'devnet'}!\n\nMake sure you're using the correct token address for this network.`);
          return;
        }
      }
    } catch (error) {
      alert(`❌ Invalid address format: ${error}`);
      return;
    }

    setIsLoading(true);
    setLoadingMessage('Preparing transaction...');
    setTxSignature('');
    setConfigKey('');

    try {
      const client = new DynamicBondingCurveClient(connection, 'confirmed');
      const newConfigAccount = Keypair.generate();
      const generatedConfigKey = newConfigAccount.publicKey.toString();
      
      console.log('Creating config with:');
      console.log('Fee Claimer:', formData.feeClaimerAddress);
      console.log('Leftover Receiver:', formData.leftoverReceiverAddress);
      console.log('Quote Mint:', formData.quoteMintAddress);
      console.log('Config Key:', generatedConfigKey);
      
      // Try using the regular createConfig instead of partner.createConfig
      // partner.createConfig might require special permissions
      let transaction;
      try {
        console.log('Trying regular createConfig...');
        transaction = await client.createConfig({
          payer: publicKey,
          config: newConfigAccount.publicKey,
          feeClaimer: new PublicKey(formData.feeClaimerAddress),
          leftoverReceiver: new PublicKey(formData.leftoverReceiverAddress),
          quoteMint: new PublicKey(formData.quoteMintAddress),
          ...config,
        });
      } catch (err) {
        console.log('Regular createConfig failed, trying partner method...');
        // Fallback to partner method if regular doesn't work
        transaction = await client.partner.createConfig({
          payer: publicKey,
          config: newConfigAccount.publicKey,
          feeClaimer: new PublicKey(formData.feeClaimerAddress),
          leftoverReceiver: new PublicKey(formData.leftoverReceiverAddress),
          quoteMint: new PublicKey(formData.quoteMintAddress),
          ...config,
        });
      }

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      transaction.recentBlockhash = blockhash;
      transaction.lastValidBlockHeight = lastValidBlockHeight;
      transaction.feePayer = publicKey;
      transaction.partialSign(newConfigAccount);

      // First, let's simulate the transaction to see what's wrong
      setLoadingMessage('Simulating transaction...');
      try {
        const simulation = await connection.simulateTransaction(transaction);
        console.log('Simulation result:', simulation);
        
        if (simulation.value.err) {
          console.error('Simulation failed:', simulation.value.err);
          console.log('Logs:', simulation.value.logs);
          
          // Parse the logs to find the actual error
          const logs = simulation.value.logs || [];
          let errorMessage = 'Transaction simulation failed';
          
          // Look for specific error messages in logs
          for (const log of logs) {
            if (log.includes('Invalid quote mint')) {
              errorMessage = 'Invalid quote mint. Use SOL (So11111111111111111111111111111111111111112) for mainnet';
              break;
            }
            if (log.includes('insufficient funds')) {
              errorMessage = 'Insufficient SOL for transaction fees. Need ~0.01 SOL';
              break;
            }
            if (log.includes('already in use')) {
              errorMessage = 'Config account already exists. Generate a new one';
              break;
            }
          }
          
          // Show detailed error
          const logsText = logs.join('\n') || 'No logs';
          alert(`❌ ${errorMessage}\n\nError Code: ${JSON.stringify(simulation.value.err)}\n\nCheck console for details`);
          console.log('Full logs:\n', logsText);
          
          // Don't throw - let user decide to continue
          const shouldContinue = confirm('Transaction simulation failed. Try sending anyway?');
          if (!shouldContinue) {
            throw new Error('User cancelled after simulation failure');
          }
        }
      } catch (simError) {
        console.error('Simulation error:', simError);
        if (simError.message.includes('User cancelled')) {
          throw simError;
        }
        // Continue anyway if simulation fails - sometimes it's a false negative
      }
      
      setLoadingMessage('Sending transaction...');
      const signature = await (sendTransaction as any)(transaction, connection, {
        skipPreflight: true, // Skip preflight since we already simulated
        preflightCommitment: 'confirmed',
        maxRetries: 3,
      });
      
      setTxSignature(signature);
      
      // Wait for transaction confirmation
      setLoadingMessage('Waiting for blockchain confirmation...');
      console.log('Waiting for confirmation...');
      const confirmation = await connection.confirmTransaction(signature, 'confirmed');
      
      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }
      
      // Verify the config actually exists on-chain
      setLoadingMessage('Verifying config exists on-chain...');
      console.log('Verifying config exists on-chain...');
      let configExists = false;
      let retries = 0;
      
      while (!configExists && retries < 10) {
        setLoadingMessage(`Verifying on-chain... (attempt ${retries + 1}/10)`);
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
        
        const configAccount = await connection.getAccountInfo(newConfigAccount.publicKey);
        if (configAccount) {
          configExists = true;
          console.log('✅ Config verified on-chain!');
          setConfigKey(generatedConfigKey);
          
          alert(`✅ Config successfully deployed and verified!\n\n🔑 Config Key: ${generatedConfigKey}\n\n✨ Verified on-chain\n📊 Size: ${configAccount.data.length} bytes\n💰 Rent: ${(configAccount.lamports / 1e9).toFixed(4)} SOL\n\nSAVE THIS KEY!${!isMainnet ? '\n\n⚠️ This is a DEVNET config - not for production use!' : ''}`);
        } else {
          retries++;
          console.log(`Retry ${retries}/10 - Config not found yet...`);
        }
      }
      
      if (!configExists) {
        throw new Error('Config deployment failed - account not found on-chain after 10 retries');
      }
    } catch (error) {
      console.error('Error:', error);
      const errorMessage = parseMeteoraError(error);
      alert(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('📋 Copied to clipboard!');
  };

  const HelpTooltip = ({ id, title, content }: { id: string; title: string; content: string }) => (
    <div className="relative inline-block ml-2">
      <button
        onClick={() => setShowHelp(showHelp === id ? null : id)}
        className="text-blue-500 hover:text-blue-700 text-sm"
      >
        ❓
      </button>
      {showHelp === id && (
        <div className="absolute z-10 w-64 p-3 bg-white border border-gray-200 rounded-lg shadow-lg left-0 top-6">
          <h4 className="font-bold text-sm mb-1">{title}</h4>
          <p className="text-xs text-gray-600">{content}</p>
          <button
            onClick={() => setShowHelp(null)}
            className="absolute top-1 right-1 text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4">
      <div className="container mx-auto max-w-7xl">
        {/* Header */}
        <header className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Meteora Dynamic Bonding Curve Config Builder
              </h1>
              <p className="text-gray-600 mt-2">Complete control over your liquidity pool configuration</p>
              <div className="flex gap-4 mt-3">
                <span className="text-sm bg-blue-100 text-blue-700 px-2 py-1 rounded">
                  SDK v1.3.5
                </span>
                <span className={`text-sm px-2 py-1 rounded ${
                  isMainnet 
                    ? 'bg-green-100 text-green-700' 
                    : 'bg-yellow-100 text-yellow-700'
                }`}>
                  {currentNetwork.toUpperCase()}
                </span>
                {!isMainnet && (
                  <span className="text-sm bg-red-100 text-red-700 px-2 py-1 rounded animate-pulse">
                    ⚠️ TESTNET - Not for production
                  </span>
                )}
              </div>
            </div>
            <WalletMultiButton />
          </div>
        </header>

        {/* Build Mode Selector */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">Build Mode</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <button
              onClick={() => setBuildMode('supply')}
              className={`p-4 rounded-lg border-2 transition-all ${
                buildMode === 'supply' 
                  ? 'border-blue-500 bg-blue-50' 
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <h3 className="font-bold mb-2">📊 Supply & Threshold Mode</h3>
              <p className="text-sm text-gray-600">
                Define pool by token supply percentage and SOL/USDC migration threshold
              </p>
            </button>
            
            <button
              onClick={() => setBuildMode('marketcap')}
              className={`p-4 rounded-lg border-2 transition-all ${
                buildMode === 'marketcap' 
                  ? 'border-blue-500 bg-blue-50' 
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <h3 className="font-bold mb-2">💹 Market Cap Mode</h3>
              <p className="text-sm text-gray-600">
                Define pool by initial and target market cap in USD
              </p>
            </button>
          </div>
        </div>

        {/* Main Configuration */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          {/* Tabs */}
          <div className="flex flex-wrap gap-2 mb-6 border-b">
            <button
              onClick={() => setActiveTab('basic')}
              className={`px-4 py-2 font-semibold ${
                activeTab === 'basic' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-600'
              }`}
            >
              🎯 Basic Setup
            </button>
            <button
              onClick={() => setActiveTab('fees')}
              className={`px-4 py-2 font-semibold ${
                activeTab === 'fees' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-600'
              }`}
            >
              💰 Fees & LP
            </button>
            <button
              onClick={() => setActiveTab('migration')}
              className={`px-4 py-2 font-semibold ${
                activeTab === 'migration' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-600'
              }`}
            >
              🚀 Migration
            </button>
            <button
              onClick={() => setActiveTab('authority')}
              className={`px-4 py-2 font-semibold ${
                activeTab === 'authority' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-600'
              }`}
            >
              🔐 Authority
            </button>
            <button
              onClick={() => setActiveTab('advanced')}
              className={`px-4 py-2 font-semibold ${
                activeTab === 'advanced' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-600'
              }`}
            >
              ⚙️ Advanced
            </button>
            <button
              onClick={() => setActiveTab('addresses')}
              className={`px-4 py-2 font-semibold ${
                activeTab === 'addresses' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-600'
              }`}
            >
              📬 Addresses
            </button>
          </div>

          {/* Tab Content */}
          {activeTab === 'basic' && (
            <div className="space-y-6">
              <h3 className="text-lg font-bold">Token Configuration</h3>
              
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
                    Total Token Supply
                    <HelpTooltip 
                      id="supply"
                      title="Token Supply"
                      content="The total number of tokens that will be created. This is the maximum supply of your token."
                    />
                  </label>
                  <input
                    type="number"
                    name="totalTokenSupply"
                    value={formData.totalTokenSupply}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:border-blue-500 outline-none"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Example: 1B tokens = 1,000,000,000
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
                    Token Decimals
                    <HelpTooltip 
                      id="decimals"
                      title="Token Decimals"
                      content="Number of decimal places for your token. SOL has 9 decimals, USDC has 6. Most SPL tokens use 9."
                    />
                  </label>
                  <select
                    name="tokenDecimals"
                    value={formData.tokenDecimals}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg"
                  >
                    <option value={ENUMS.TokenDecimal.SIX}>6 Decimals (USDC-like)</option>
                    <option value={ENUMS.TokenDecimal.SEVEN}>7 Decimals</option>
                    <option value={ENUMS.TokenDecimal.EIGHT}>8 Decimals</option>
                    <option value={ENUMS.TokenDecimal.NINE}>9 Decimals (SOL-like)</option>
                  </select>
                </div>
              </div>

              {buildMode === 'supply' ? (
                <>
                  <h3 className="text-lg font-bold mt-6">Supply & Threshold Configuration</h3>
                  
                  {/* Live Calculation Display */}
                  {calculateBondingCurveMetrics() && (
                    <div className="mb-6 p-4 bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg">
                      <h4 className="font-bold text-blue-900 mb-3">📊 Live Market Cap Calculation</h4>
                      <div className="grid md:grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-gray-700">
                            <strong>Estimated Starting Market Cap:</strong>
                            <br/>
                            <span className="text-2xl text-blue-600">
                              {calculateBondingCurveMetrics()?.quoteCurrency === 'USDC' ? '$' : ''}
                              {calculateBondingCurveMetrics()?.estimatedStartMarketCap.toLocaleString(undefined, {maximumFractionDigits: 0})}
                              {calculateBondingCurveMetrics()?.quoteCurrency === 'SOL' ? ' SOL' : ' USDC'}
                            </span>
                          </p>
                          <p className="text-xs text-gray-600 mt-2">
                            Starting price: {calculateBondingCurveMetrics()?.quoteCurrency === 'USDC' ? '$' : ''}
                            {calculateBondingCurveMetrics()?.estimatedStartPrice.toFixed(6)}
                            {calculateBondingCurveMetrics()?.quoteCurrency === 'SOL' ? ' SOL' : ''}
                            /token
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-700">
                            <strong>At Migration:</strong>
                            <br/>
                            <span className="text-lg text-green-600">
                              {calculateBondingCurveMetrics()?.thresholdFormatted} raised
                            </span>
                          </p>
                          <p className="text-xs text-gray-600 mt-2">
                            Price at migration: {calculateBondingCurveMetrics()?.quoteCurrency === 'USDC' ? '$' : ''}
                            {calculateBondingCurveMetrics()?.priceAtMigration.toFixed(6)}
                            {calculateBondingCurveMetrics()?.quoteCurrency === 'SOL' ? ' SOL' : ''}
                            /token
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded">
                        <p className="text-xs text-yellow-800">
                          <strong>⚠️ How this works:</strong> You don't set the market cap directly. Instead, Meteora calculates it based on your supply (
                          {formData.totalTokenSupply ? Number(formData.totalTokenSupply).toLocaleString() : '0'} tokens), 
                          migration percentage ({formData.percentageSupplyOnMigration}%), and threshold (
                          {formData.quoteMintAddress.includes('USDC') ? '$' : ''}
                          {formData.migrationQuoteThreshold}
                          {formData.quoteMintAddress.includes('USDC') ? ' USDC' : ' SOL'}). 
                          The bonding curve math determines the starting price automatically.
                        </p>
                      </div>
                      
                      {/* Visual Bonding Curve */}
                      <div className="mt-3 p-3 bg-white border border-gray-200 rounded">
                        <p className="text-xs font-bold text-gray-700 mb-2">📈 Price Progression:</p>
                        <div className="flex items-center justify-between text-xs">
                          <div className="text-center">
                            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center border-2 border-blue-300">
                              <span className="font-bold">START</span>
                            </div>
                            <p className="mt-1 text-gray-600">
                              {calculateBondingCurveMetrics()?.quoteCurrency === 'USDC' ? '$' : ''}
                              {calculateBondingCurveMetrics()?.estimatedStartPrice.toFixed(6)}
                            </p>
                          </div>
                          <div className="flex-1 mx-2">
                            <div className="h-1 bg-gradient-to-r from-blue-300 to-green-500 rounded"></div>
                            <p className="text-center mt-1 text-gray-500">Price increases as tokens are bought</p>
                          </div>
                          <div className="text-center">
                            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center border-2 border-green-300">
                              <span className="font-bold">END</span>
                            </div>
                            <p className="mt-1 text-gray-600">
                              {calculateBondingCurveMetrics()?.quoteCurrency === 'USDC' ? '$' : ''}
                              {calculateBondingCurveMetrics()?.priceAtMigration.toFixed(6)}
                            </p>
                          </div>
                        </div>
                        <p className="text-center mt-2 text-xs text-gray-600">
                          ~{((calculateBondingCurveMetrics()?.priceAtMigration || 0) / (calculateBondingCurveMetrics()?.estimatedStartPrice || 1)).toFixed(1)}x price increase from start to migration
                        </p>
                      </div>
                    </div>
                  )}
                  
                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
                        % Supply at Migration
                        <HelpTooltip 
                          id="supplyMigration"
                          title="Supply at Migration"
                          content="Percentage of total supply that goes into the liquidity pool when it graduates to DAMM. The rest can be used for airdrops, team, etc."
                        />
                      </label>
                      <input
                        type="number"
                        name="percentageSupplyOnMigration"
                        value={formData.percentageSupplyOnMigration}
                        onChange={handleInputChange}
                        min="1"
                        max="100"
                        className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        {formData.percentageSupplyOnMigration}% = {(formData.totalTokenSupply * formData.percentageSupplyOnMigration / 100).toLocaleString()} tokens
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
                        Migration Threshold ({formData.quoteMintAddress.includes('USDC') ? '💵 USDC DOLLARS' : '◎ SOL'})
                        <HelpTooltip 
                          id="threshold"
                          title="Migration Threshold"
                          content="Amount raised before graduating to DEX. This determines your starting market cap!"
                        />
                      </label>
                      
                      {/* Warning for USDC */}
                      {formData.quoteMintAddress.includes('USDC') && (
                        <div className="mb-2 p-2 bg-red-50 border border-red-200 rounded">
                          <p className="text-xs text-red-800">
                            ⚠️ <strong>IMPORTANT:</strong> Enter the FULL dollar amount!
                            <br/>• For $80,000 → enter 80000
                            <br/>• For $10,000 → enter 10000
                            <br/>• DO NOT enter "80" for $80k (it will be $80!)
                          </p>
                        </div>
                      )}
                      
                      <input
                        type="number"
                        name="migrationQuoteThreshold"
                        value={formData.migrationQuoteThreshold}
                        onChange={handleInputChange}
                        className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg"
                        placeholder={formData.quoteMintAddress.includes('USDC') ? 'Enter full amount: 80000 for $80,000' : 'Enter SOL amount: 80 for 80 SOL'}
                      />
                      <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded text-xs">
                        <p className="text-green-800">
                          {formData.quoteMintAddress.includes('USDC') 
                            ? `🎯 Graduates at $${Number(formData.migrationQuoteThreshold).toLocaleString()} USDC raised`
                            : `🎯 Graduates at ${formData.migrationQuoteThreshold} SOL raised (~$${(Number(formData.migrationQuoteThreshold) * 165).toLocaleString()} at $165/SOL)`
                          }
                        </p>
                        {calculateBondingCurveMetrics() && (
                          <p className="text-green-700 mt-1">
                            💡 Results in ~{calculateBondingCurveMetrics()?.quoteCurrency === 'USDC' ? '$' : ''}
                            {calculateBondingCurveMetrics()?.estimatedStartMarketCap.toFixed(0)}
                            {calculateBondingCurveMetrics()?.quoteCurrency === 'SOL' ? ' SOL' : ''} starting market cap
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <h3 className="text-lg font-bold mt-6">Market Cap Configuration</h3>
                  <div className="grid md:grid-cols-3 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
                        Initial Market Cap (USD)
                        <HelpTooltip 
                          id="initialMC"
                          title="Starting Market Cap"
                          content="The market cap in USD when your token launches. This determines the initial price."
                        />
                      </label>
                      <input
                        type="number"
                        name="initialMarketCap"
                        value={formData.initialMarketCap}
                        onChange={handleInputChange}
                        className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Initial price: ${calculateInitialPrice()} per token
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
                        Migration Market Cap (USD)
                        <HelpTooltip 
                          id="migrationMC"
                          title="Target Market Cap"
                          content="The target market cap in USD when the pool graduates to DAMM."
                        />
                      </label>
                      <input
                        type="number"
                        name="migrationMarketCap"
                        value={formData.migrationMarketCap}
                        onChange={handleInputChange}
                        className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        {(formData.migrationMarketCap / formData.initialMarketCap).toFixed(1)}x from launch
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
                        Current SOL Price (USD)
                        <HelpTooltip 
                          id="solPrice"
                          title="SOL Price"
                          content="Used to calculate SOL amounts from USD values. Update this to current market price."
                        />
                      </label>
                      <input
                        type="number"
                        name="solPrice"
                        value={formData.solPrice}
                        onChange={handleInputChange}
                        className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg"
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === 'fees' && (
            <div className="space-y-6">
              {/* LP Allocation */}
              <div>
                <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
                  LP Token Distribution
                  <HelpTooltip 
                    id="lpDist"
                    title="LP Distribution"
                    content="How LP tokens are distributed when pool graduates. Must total 100%. Locked LP can't be withdrawn immediately."
                  />
                  <span className={`ml-auto text-sm ${validateLpPercentages() ? 'text-green-600' : 'text-red-600'}`}>
                    Total: {formData.partnerLpPercentage + formData.creatorLpPercentage + formData.partnerLockedLpPercentage + formData.creatorLockedLpPercentage}%
                  </span>
                </h3>
                
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Partner LP % (Unlocked)
                    </label>
                    <input
                      type="number"
                      name="partnerLpPercentage"
                      value={formData.partnerLpPercentage}
                      onChange={handleInputChange}
                      min="0"
                      max="100"
                      className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Creator LP % (Unlocked)
                    </label>
                    <input
                      type="number"
                      name="creatorLpPercentage"
                      value={formData.creatorLpPercentage}
                      onChange={handleInputChange}
                      min="0"
                      max="100"
                      className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Partner Locked LP %
                    </label>
                    <input
                      type="number"
                      name="partnerLockedLpPercentage"
                      value={formData.partnerLockedLpPercentage}
                      onChange={handleInputChange}
                      min="0"
                      max="100"
                      className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Creator Locked LP %
                    </label>
                    <input
                      type="number"
                      name="creatorLockedLpPercentage"
                      value={formData.creatorLockedLpPercentage}
                      onChange={handleInputChange}
                      min="0"
                      max="100"
                      className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg"
                    />
                  </div>
                </div>
              </div>

              {/* Trading Fees */}
              <div>
                <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
                  Trading Fee Configuration
                  <HelpTooltip 
                    id="tradingFees"
                    title="Trading Fees"
                    content="Fees charged on each trade. Can be static or dynamic. Rate limiter prevents excessive trading."
                  />
                </h3>
                
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Base Fee Mode
                  </label>
                  <select
                    name="baseFeeMode"
                    value={formData.baseFeeMode}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg"
                  >
                    <option value={ENUMS.BaseFeeMode.FeeSchedulerLinear}>Linear Fee Schedule</option>
                    <option value={ENUMS.BaseFeeMode.FeeSchedulerExponential}>Exponential Fee Schedule</option>
                    <option value={ENUMS.BaseFeeMode.RateLimiter}>Rate Limiter (Anti-Bot)</option>
                  </select>
                </div>

                {formData.baseFeeMode !== ENUMS.BaseFeeMode.RateLimiter ? (
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Starting Fee (bps)
                      </label>
                      <input
                        type="number"
                        name="startingFeeBps"
                        value={formData.startingFeeBps}
                        onChange={handleInputChange}
                        className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        {formData.startingFeeBps / 100}% fee
                      </p>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Ending Fee (bps)
                      </label>
                      <input
                        type="number"
                        name="endingFeeBps"
                        value={formData.endingFeeBps}
                        onChange={handleInputChange}
                        className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        {formData.endingFeeBps / 100}% fee
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Base Fee (bps)
                      </label>
                      <input
                        type="number"
                        name="baseFeeBps"
                        value={formData.baseFeeBps}
                        onChange={handleInputChange}
                        className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Fee Increment (bps)
                      </label>
                      <input
                        type="number"
                        name="feeIncrementBps"
                        value={formData.feeIncrementBps}
                        onChange={handleInputChange}
                        className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg"
                      />
                    </div>
                  </div>
                )}

                <div className="mt-4">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      name="dynamicFeeEnabled"
                      checked={formData.dynamicFeeEnabled}
                      onChange={handleInputChange}
                      className="mr-2"
                    />
                    <span className="text-sm font-medium">
                      Enable Dynamic Fees (V2 only)
                    </span>
                    <HelpTooltip 
                      id="dynamicFees"
                      title="Dynamic Fees"
                      content="Automatically adjusts fees based on volatility. Only available for DAMM V2."
                    />
                  </label>
                </div>
              </div>

              {/* Creator Fees */}
              <div>
                <h3 className="text-lg font-bold text-gray-800 mb-4">Creator Fees</h3>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Creator Trading Fee %
                    </label>
                    <input
                      type="number"
                      name="creatorTradingFeePercentage"
                      value={formData.creatorTradingFeePercentage}
                      onChange={handleInputChange}
                      min="0"
                      max="100"
                      className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Creator gets {formData.creatorTradingFeePercentage}% of trading fees
                    </p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Creator Migration Fee Share %
                    </label>
                    <input
                      type="number"
                      name="creatorMigrationFeeShare"
                      value={formData.creatorMigrationFeeShare}
                      onChange={handleInputChange}
                      min="0"
                      max="100"
                      className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Creator gets {formData.creatorMigrationFeeShare}% of migration fees
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'migration' && (
            <div className="space-y-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4">Migration Settings</h3>
              
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
                    Migration Target
                    <HelpTooltip 
                      id="migrationTarget"
                      title="Migration Target"
                      content="DAMM V1: Standard AMM. DAMM V2: Advanced features like dynamic fees, customizable pool fees."
                    />
                  </label>
                  <select
                    name="migrationOption"
                    value={formData.migrationOption}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg"
                  >
                    <option value={0}>DAMM V1 (Standard AMM)</option>
                    <option value={1}>DAMM V2 (Advanced Features)</option>
                  </select>
                  
                  {formData.migrationOption === 1 && (
                    <div className="mt-2 p-2 bg-blue-50 rounded text-xs">
                      V2 Features: Dynamic fees, customizable pool fees, better capital efficiency
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Migration Fee Tier
                  </label>
                  <select
                    name="migrationFeeOption"
                    value={formData.migrationFeeOption}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg"
                  >
                    <option value={ENUMS.MigrationFeeOption.FixedBps25}>0.25% (Lowest)</option>
                    <option value={ENUMS.MigrationFeeOption.FixedBps30}>0.30%</option>
                    <option value={ENUMS.MigrationFeeOption.FixedBps100}>1%</option>
                    <option value={ENUMS.MigrationFeeOption.FixedBps200}>2%</option>
                    <option value={ENUMS.MigrationFeeOption.FixedBps400}>4%</option>
                    <option value={ENUMS.MigrationFeeOption.FixedBps600}>6% (Highest)</option>
                    {formData.migrationOption === 1 && (
                      <option value={6}>Customizable (V2 Only)</option>
                    )}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Migration Fee % (from threshold)
                </label>
                <input
                  type="number"
                  name="migrationFeePercentage"
                  value={formData.migrationFeePercentage}
                  onChange={handleInputChange}
                  min="0"
                  max="50"
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg"
                />
                <p className="text-xs text-gray-500 mt-1">
                  {formData.migrationFeePercentage}% of migration threshold goes to fees
                </p>
              </div>

              {/* V2 Specific Settings */}
              {formData.migrationOption === 1 && 
               formData.migrationFeeOption === 6 && (
                <div className="p-4 bg-purple-50 rounded-lg">
                  <h4 className="font-bold mb-3">DAMM V2 Custom Pool Settings</h4>
                  <div className="grid md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        V2 Fee Collection
                      </label>
                      <select
                        name="v2CollectFeeMode"
                        value={formData.v2CollectFeeMode}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-200 rounded"
                      >
                        <option value={ENUMS.CollectFeeMode.QuoteToken}>Quote Token</option>
                        <option value={ENUMS.CollectFeeMode.OutputToken}>Output Token</option>
                      </select>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        V2 Dynamic Fee
                      </label>
                      <select
                        name="v2DynamicFee"
                        value={formData.v2DynamicFee}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-200 rounded"
                      >
                        <option value={ENUMS.DammV2DynamicFeeMode.Disabled}>Disabled</option>
                        <option value={ENUMS.DammV2DynamicFeeMode.Enabled}>Enabled</option>
                      </select>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        V2 Pool Fee (bps)
                      </label>
                      <input
                        type="number"
                        name="v2PoolFeeBps"
                        value={formData.v2PoolFeeBps}
                        onChange={handleInputChange}
                        min="10"
                        max="1000"
                        className="w-full px-3 py-2 border border-gray-200 rounded"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        {formData.v2PoolFeeBps / 100}% fee
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'authority' && (
            <div className="space-y-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4">Token Authority & Control</h3>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
                  Token Update Authority
                  <HelpTooltip 
                    id="updateAuth"
                    title="Update Authority"
                    content="Who can update token metadata (name, symbol, image). Immutable means no one can change it."
                  />
                </label>
                <select
                  name="tokenUpdateAuthority"
                  value={formData.tokenUpdateAuthority}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg"
                >
                  <option value={1}>
                    🔒 Immutable (Cannot be changed - Most secure)
                  </option>
                  <option value={0}>
                    👤 Creator Update Authority (Creator can update metadata)
                  </option>
                  <option value={2}>
                    🤝 Partner Update Authority (Partner can update metadata)
                  </option>
                  <option value={3}>
                    👤+ Creator Update & Mint Authority (Creator can update AND mint more)
                  </option>
                  <option value={4}>
                    🤝+ Partner Update & Mint Authority (Partner can update AND mint more)
                  </option>
                </select>
                
                <div className="mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded">
                  <p className="text-sm text-yellow-800">
                    <strong>⚠️ Important:</strong> 
                    {formData.tokenUpdateAuthority === 1 && 
                      " Immutable is the most trustworthy option - no one can change the token after creation."}
                    {(formData.tokenUpdateAuthority === 3 || 
                      formData.tokenUpdateAuthority === 4) && 
                      " Mint authority allows creating more tokens, which can dilute holders!"}
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Token Type
                </label>
                <select
                  name="tokenType"
                  value={formData.tokenType}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg"
                >
                  <option value={ENUMS.TokenType.SPL}>SPL Token (Standard)</option>
                  <option value={ENUMS.TokenType.Token2022}>Token 2022 (New Standard)</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  {formData.tokenType === ENUMS.TokenType.SPL 
                    ? "Standard SPL token - widely supported"
                    : "Token 2022 - new features but limited wallet support"}
                </p>
              </div>
            </div>
          )}

          {activeTab === 'advanced' && (
            <div className="space-y-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4">Advanced Settings</h3>
              
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Activation Type
                  </label>
                  <select
                    name="activationType"
                    value={formData.activationType}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg"
                  >
                    <option value={ENUMS.ActivationType.Slot}>Slot-based (Block time)</option>
                    <option value={ENUMS.ActivationType.Timestamp}>Timestamp-based (Real time)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Fee Collection Mode
                  </label>
                  <select
                    name="collectFeeMode"
                    value={formData.collectFeeMode}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg"
                  >
                    <option value={ENUMS.CollectFeeMode.QuoteToken}>Quote Token (SOL/USDC)</option>
                    <option value={ENUMS.CollectFeeMode.OutputToken}>Output Token</option>
                  </select>
                </div>
              </div>

              {/* Vesting */}
              <div className="p-4 bg-gray-50 rounded-lg">
                <label className="flex items-center mb-3">
                  <input
                    type="checkbox"
                    name="enableVesting"
                    checked={formData.enableVesting}
                    onChange={handleInputChange}
                    className="mr-2"
                  />
                  <span className="font-medium">Enable Token Vesting</span>
                  <HelpTooltip 
                    id="vesting"
                    title="Token Vesting"
                    content="Lock tokens that unlock over time. Useful for team tokens or investor allocations."
                  />
                </label>
                
                {formData.enableVesting && (
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Total Vesting Amount
                      </label>
                      <input
                        type="number"
                        name="vestingTotalAmount"
                        value={formData.vestingTotalAmount}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-200 rounded"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Number of Periods
                      </label>
                      <input
                        type="number"
                        name="vestingPeriods"
                        value={formData.vestingPeriods}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-200 rounded"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Cliff Duration (seconds)
                      </label>
                      <input
                        type="number"
                        name="vestingCliffDuration"
                        value={formData.vestingCliffDuration}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-200 rounded"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Cliff Unlock Amount
                      </label>
                      <input
                        type="number"
                        name="vestingCliffAmount"
                        value={formData.vestingCliffAmount}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-200 rounded"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'addresses' && (
            <div className="space-y-6">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                <p className="text-sm text-yellow-800">
                  <strong>⚠️ Critical:</strong> These addresses control fees and funds. Double-check them!
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Quote Token (Trading Pair)
                </label>
                <select
                  name="quoteMintAddress"
                  value={formData.quoteMintAddress}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg"
                >
                  <option value={TOKEN_MINTS.SOL}>✅ SOL (Recommended)</option>
                  {isMainnet ? (
                    <option value={TOKEN_MINTS.USDC}>USDC (Mainnet)</option>
                  ) : (
                    <option value={TOKEN_MINTS.USDC_DEV}>USDC (Devnet)</option>
                  )}
                </select>
                <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded">
                  <p className="text-xs text-green-800">
                    <strong>Selected:</strong> {formData.quoteMintAddress}<br/>
                    {formData.quoteMintAddress === TOKEN_MINTS.SOL && '✅ Native SOL - Best for mainnet'}
                    {formData.quoteMintAddress === TOKEN_MINTS.USDC && '✅ USDC Mainnet - EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'}
                    {formData.quoteMintAddress === TOKEN_MINTS.USDC_DEV && '⚠️ USDC Devnet - Only for testing'}
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
                  Fee Claimer Address
                  <HelpTooltip 
                    id="feeClaimer"
                    title="Fee Claimer"
                    content="Wallet that can claim accumulated trading fees from pools using this config."
                  />
                </label>
                <input
                  type="text"
                  name="feeClaimerAddress"
                  value={formData.feeClaimerAddress}
                  onChange={handleInputChange}
                  placeholder={publicKey?.toString() || 'Connect wallet first'}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg font-mono text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
                  Leftover Receiver Address
                  <HelpTooltip 
                    id="leftoverReceiver"
                    title="Leftover Receiver"
                    content="Wallet that receives remaining tokens from the bonding curve after migration."
                  />
                </label>
                <input
                  type="text"
                  name="leftoverReceiverAddress"
                  value={formData.leftoverReceiverAddress}
                  onChange={handleInputChange}
                  placeholder={publicKey?.toString() || 'Connect wallet first'}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg font-mono text-sm"
                />
              </div>
            </div>
          )}

          {/* Generate Button */}
          <div className="mt-8 flex justify-center">
            <button
              onClick={handleGenerateConfig}
              disabled={!validateLpPercentages()}
              className={`px-8 py-3 font-bold rounded-lg transition-all ${
                validateLpPercentages()
                  ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white hover:shadow-lg transform hover:scale-105'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              🚀 Generate Configuration
            </button>
          </div>
        </div>

        {/* Generated Config */}
        {config && (
          <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
            <h2 className="text-xl font-bold mb-4 text-gray-800">✅ Generated Configuration</h2>
            
            <div className="bg-gray-50 rounded-lg p-4 mb-4 max-h-96 overflow-y-auto">
              <pre className="text-xs font-mono">
                {JSON.stringify(config, (key, value) => 
                  typeof value === 'bigint' || value instanceof BN ? value.toString() : value, 2
                )}
              </pre>
            </div>

            <div className="flex gap-4">
              <button
                onClick={handleCreateConfig}
                disabled={!publicKey || isLoading}
                className="flex-1 bg-green-500 text-white font-bold py-3 px-6 rounded-lg hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {isLoading ? `⏳ ${loadingMessage}` : '💫 Deploy Config On-Chain'}
              </button>
              
              <button
                onClick={() => {
                  const dataStr = JSON.stringify(config, null, 2);
                  const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
                  const exportFileDefaultName = `meteora-config-${Date.now()}.json`;
                  const linkElement = document.createElement('a');
                  linkElement.setAttribute('href', dataUri);
                  linkElement.setAttribute('download', exportFileDefaultName);
                  linkElement.click();
                }}
                className="px-6 py-3 bg-blue-500 text-white font-bold rounded-lg hover:bg-blue-600"
              >
                📥 Export JSON
              </button>
            </div>
          </div>
        )}

        {/* Success Message */}
        {configKey && (
          <div className="bg-green-50 border-2 border-green-200 rounded-xl p-6 mb-6">
            <h3 className="text-xl font-bold text-green-800 mb-4">🎉 Configuration Deployed!</h3>
            
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium text-gray-700">Config Key:</p>
                <div className="flex items-center gap-2 bg-white p-3 rounded-lg mt-1">
                  <code className="flex-1 text-sm font-mono text-gray-800">{configKey}</code>
                  <button
                    onClick={() => copyToClipboard(configKey)}
                    className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
                  >
                    📋 Copy
                  </button>
                </div>
              </div>

              {txSignature && (
                <div>
                  <p className="text-sm font-medium text-gray-700">Transaction:</p>
                  <a
                    href={`https://explorer.solana.com/tx/${txSignature}?cluster=devnet`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-500 hover:underline text-sm"
                  >
                    View on Solana Explorer →
                  </a>
                </div>
              )}
            </div>

            <div className="mt-4 p-3 bg-yellow-50 rounded-lg">
              <p className="text-sm text-yellow-800">
                <strong>Next Steps:</strong>
                <br />1. Save this config key - you'll need it to create pools
                <br />2. Use this config key when calling createPool() 
                <br />3. Share with creators who want to launch tokens with your settings
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}