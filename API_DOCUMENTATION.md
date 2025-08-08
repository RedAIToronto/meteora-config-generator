# Meteora Dynamic Bonding Curve - Complete Data API Documentation

## Table of Contents
1. [Overview](#overview)
2. [Core Data Structure](#core-data-structure)
3. [Reading On-Chain Data](#reading-on-chain-data)
4. [Calculating Prices](#calculating-prices)
5. [Available Data Points](#available-data-points)
6. [API Endpoints](#api-endpoints)
7. [Code Examples](#code-examples)
8. [Bonding Curve Mathematics](#bonding-curve-mathematics)
9. [Real-time Updates](#real-time-updates)
10. [Integration Guide](#integration-guide)

## Overview

Meteora Dynamic Bonding Curves (DBC) provide programmable token launch mechanics on Solana. This guide covers all available data points and how to read/calculate them for your application.

## Core Data Structure

### Config Account Structure
```typescript
interface DBCConfig {
  // Unique identifier
  configAddress: string;
  
  // Token parameters
  tokenMintAddress: string;
  tokenSupply: BN;           // Total supply in smallest unit
  tokenDecimals: number;      // Usually 9
  
  // Quote token (SOL or USDC)
  quoteMintAddress: string;   // SOL or USDC mint
  quoteDecimals: number;      // 9 for SOL, 6 for USDC
  
  // Bonding curve parameters
  sqrtStartPrice: BN;         // Square root of starting price (Q64.64 format)
  sqrtEndPrice: BN;           // Square root of ending price
  migrationQuoteThreshold: BN; // Amount to raise before migration
  
  // Migration settings
  percentageSupplyOnMigration: number; // % of supply for migration (e.g., 20)
  migrationTarget: string;    // "raydium" or "meteora"
  
  // Status
  isInitialized: boolean;
  isMigrated: boolean;
  currentReserves: BN;        // Current quote token in curve
  tokensSold: BN;             // Tokens sold so far
}
```

## Reading On-Chain Data

### 1. Using Meteora SDK
```javascript
import { DynamicBondingCurve } from '@meteora-ag/dbc-sdk';
import { Connection, PublicKey } from '@solana/web3.js';

const connection = new Connection('YOUR_RPC_ENDPOINT');
const dbc = new DynamicBondingCurve(connection);

// Read config data
async function getConfigData(configAddress) {
  const config = await dbc.getConfig(new PublicKey(configAddress));
  
  return {
    // Basic info
    tokenMint: config.tokenMint.toString(),
    quoteMint: config.quoteMint.toString(),
    
    // Supply info
    totalSupply: config.totalSupply.toNumber() / Math.pow(10, config.tokenDecimals),
    tokensSold: config.tokensSold.toNumber() / Math.pow(10, config.tokenDecimals),
    tokensRemaining: (config.totalSupply.sub(config.tokensSold)).toNumber() / Math.pow(10, config.tokenDecimals),
    
    // Price info
    currentPrice: calculateCurrentPrice(config),
    startPrice: calculateStartPrice(config),
    endPrice: calculateEndPrice(config),
    
    // Progress
    progressPercent: (config.currentReserves.toNumber() / config.migrationQuoteThreshold.toNumber()) * 100,
    quoteRaised: config.currentReserves.toNumber() / Math.pow(10, config.quoteDecimals),
    targetRaise: config.migrationQuoteThreshold.toNumber() / Math.pow(10, config.quoteDecimals),
    
    // Status
    isActive: !config.isMigrated,
    isMigrated: config.isMigrated
  };
}
```

### 2. Direct RPC Calls
```javascript
import { Connection, PublicKey } from '@solana/web3.js';

async function getAccountData(configAddress) {
  const connection = new Connection('YOUR_RPC_ENDPOINT');
  const accountInfo = await connection.getAccountInfo(new PublicKey(configAddress));
  
  if (!accountInfo) throw new Error('Config not found');
  
  // Parse the account data buffer
  const data = accountInfo.data;
  
  // Layout (example - adjust based on actual layout)
  return {
    discriminator: data.slice(0, 8),
    tokenMint: new PublicKey(data.slice(8, 40)),
    quoteMint: new PublicKey(data.slice(40, 72)),
    totalSupply: new BN(data.slice(72, 80), 'le'),
    tokensSold: new BN(data.slice(80, 88), 'le'),
    currentReserves: new BN(data.slice(88, 96), 'le'),
    // ... continue parsing
  };
}
```

## Calculating Prices

### Current Price Calculation
```javascript
function calculateCurrentPrice(config) {
  // The price on a bonding curve depends on tokens sold
  const tokensSold = config.tokensSold;
  const sqrtPrice = calculateSqrtPriceAtSupply(tokensSold, config);
  
  // Convert from Q64.64 format
  const price = (sqrtPrice * sqrtPrice) / (2n ** 128n);
  
  // Adjust for decimals
  const quoteDecimals = config.quoteMint.includes('USDC') ? 6 : 9;
  const tokenDecimals = 9;
  
  return Number(price) * Math.pow(10, tokenDecimals - quoteDecimals);
}

function calculateSqrtPriceAtSupply(supply, config) {
  // Linear interpolation between start and end sqrt prices
  const progress = supply / config.totalSupply;
  const priceDiff = config.sqrtEndPrice - config.sqrtStartPrice;
  
  return config.sqrtStartPrice + (priceDiff * progress);
}
```

### Market Cap Calculation
```javascript
function calculateMarketCap(config) {
  const currentPrice = calculateCurrentPrice(config);
  const totalSupply = config.totalSupply / Math.pow(10, 9);
  
  return currentPrice * totalSupply;
}
```

### Price Impact Calculation
```javascript
function calculatePriceImpact(amountIn, isBuy, config) {
  const currentPrice = calculateCurrentPrice(config);
  
  if (isBuy) {
    // Calculate new tokens that would be minted
    const newTokens = calculateTokensOut(amountIn, config);
    const newTokensSold = config.tokensSold + newTokens;
    const newPrice = calculateSqrtPriceAtSupply(newTokensSold, config);
    
    return ((newPrice - currentPrice) / currentPrice) * 100;
  } else {
    // Calculate for sells
    const tokensToSell = amountIn;
    const newTokensSold = config.tokensSold - tokensToSell;
    const newPrice = calculateSqrtPriceAtSupply(newTokensSold, config);
    
    return ((currentPrice - newPrice) / currentPrice) * 100;
  }
}
```

## Available Data Points

### 1. Static Data (doesn't change)
```javascript
{
  configAddress: string,          // Unique config identifier
  tokenMint: string,              // Token mint address
  quoteMint: string,              // Quote token (SOL/USDC)
  totalSupply: number,            // Total token supply
  tokenDecimals: number,          // Token decimals (usually 9)
  createdAt: number,              // Creation timestamp
  creator: string,                // Creator wallet address
  migrationTarget: string,        // "raydium" or "meteora"
  migrationThreshold: number,     // Target raise amount
  percentOnMigration: number      // % of supply for migration
}
```

### 2. Dynamic Data (changes with trades)
```javascript
{
  currentPrice: number,           // Current token price
  marketCap: number,              // Current market cap
  tokensSold: number,             // Tokens sold so far
  tokensRemaining: number,        // Tokens available
  quoteRaised: number,            // Quote tokens raised
  progressPercent: number,        // % to migration
  volume24h: number,              // 24h trading volume
  priceChange24h: number,         // 24h price change
  holders: number,                // Number of holders
  transactions: number,           // Total transactions
  liquidity: number,              // Available liquidity
  isMigrated: boolean            // Migration status
}
```

### 3. Calculated Metrics
```javascript
{
  pricePerToken: number,          // Price per token
  fdv: number,                    // Fully diluted valuation
  circulatingSupply: number,      // Tokens in circulation
  lockedLiquidity: number,        // Locked liquidity value
  burnedTokens: number,           // Burned token amount
  avgPurchasePrice: number,       // Average purchase price
  profitableHolders: number,      // Holders in profit
  priceToMigration: number,       // Price at migration
  estimatedMigrationTime: number, // Estimated time to migrate
  bondingCurveMultiplier: number  // Current price multiplier
}
```

## API Endpoints

### 1. REST API Endpoints
```javascript
// Get config data
GET /api/dbc/config/{configAddress}
Response: {
  config: DBCConfig,
  metadata: TokenMetadata,
  stats: TokenStats
}

// Get price data
GET /api/dbc/price/{configAddress}
Response: {
  currentPrice: number,
  startPrice: number,
  endPrice: number,
  priceChange24h: number,
  volume24h: number
}

// Get chart data
GET /api/dbc/chart/{configAddress}?interval=1h&from=timestamp&to=timestamp
Response: {
  prices: [{
    time: number,
    open: number,
    high: number,
    low: number,
    close: number,
    volume: number
  }]
}

// Calculate swap
POST /api/dbc/quote
Body: {
  configAddress: string,
  inputAmount: number,
  isBuy: boolean
}
Response: {
  outputAmount: number,
  priceImpact: number,
  fee: number,
  route: SwapRoute
}
```

### 2. WebSocket Subscriptions
```javascript
// Subscribe to price updates
ws.send({
  method: "subscribe",
  params: {
    channel: "price",
    configAddress: "CONFIG_ADDRESS"
  }
});

// Receive updates
ws.on('message', (data) => {
  const update = JSON.parse(data);
  if (update.channel === 'price') {
    console.log('New price:', update.data.price);
    console.log('Volume:', update.data.volume);
    console.log('Tokens sold:', update.data.tokensSold);
  }
});
```

## Code Examples

### Complete Integration Example
```javascript
import { DynamicBondingCurve } from '@meteora-ag/dbc-sdk';
import { Connection, PublicKey, Keypair } from '@solana/web3.js';

class MeteoraDBC {
  constructor(rpcEndpoint) {
    this.connection = new Connection(rpcEndpoint);
    this.dbc = new DynamicBondingCurve(this.connection);
  }

  // Get all token data
  async getTokenData(configAddress) {
    const config = await this.dbc.getConfig(new PublicKey(configAddress));
    
    // Parse raw data
    const data = this.parseConfigData(config);
    
    // Calculate metrics
    const metrics = this.calculateMetrics(data);
    
    // Get historical data
    const history = await this.getHistoricalData(configAddress);
    
    return {
      config: data,
      metrics: metrics,
      history: history,
      chart: await this.getChartData(configAddress)
    };
  }

  parseConfigData(config) {
    const quoteDecimals = config.quoteMint.includes('USDC') ? 6 : 9;
    const tokenDecimals = 9;
    
    return {
      // Token info
      tokenMint: config.tokenMint.toString(),
      tokenSupply: Number(config.totalSupply) / Math.pow(10, tokenDecimals),
      tokensSold: Number(config.tokensSold) / Math.pow(10, tokenDecimals),
      
      // Quote info
      quoteMint: config.quoteMint.toString(),
      quoteRaised: Number(config.currentReserves) / Math.pow(10, quoteDecimals),
      targetRaise: Number(config.migrationQuoteThreshold) / Math.pow(10, quoteDecimals),
      
      // Price info
      sqrtStartPrice: config.sqrtStartPrice,
      sqrtEndPrice: config.sqrtEndPrice,
      
      // Status
      isActive: !config.isMigrated,
      progressPercent: (Number(config.currentReserves) / Number(config.migrationQuoteThreshold)) * 100
    };
  }

  calculateMetrics(data) {
    // Calculate current price from sqrt price
    const currentSqrtPrice = this.interpolateSqrtPrice(
      data.tokensSold,
      data.tokenSupply,
      data.sqrtStartPrice,
      data.sqrtEndPrice
    );
    
    const currentPrice = this.sqrtPriceToPrice(currentSqrtPrice);
    
    return {
      currentPrice: currentPrice,
      marketCap: currentPrice * data.tokenSupply,
      fdv: currentPrice * data.tokenSupply,
      liquidity: data.quoteRaised,
      priceToMigration: this.sqrtPriceToPrice(data.sqrtEndPrice),
      remainingToMigration: data.targetRaise - data.quoteRaised,
      estimatedGainToMigration: (this.sqrtPriceToPrice(data.sqrtEndPrice) / currentPrice - 1) * 100
    };
  }

  interpolateSqrtPrice(tokensSold, totalSupply, sqrtStart, sqrtEnd) {
    const progress = tokensSold / totalSupply;
    const diff = sqrtEnd - sqrtStart;
    return sqrtStart + (diff * progress);
  }

  sqrtPriceToPrice(sqrtPrice) {
    // Convert from Q64.64 format
    const price = (sqrtPrice * sqrtPrice) / (2n ** 128n);
    return Number(price) / 1e9; // Adjust for decimals
  }

  async getHistoricalData(configAddress) {
    // Fetch transaction history
    const signatures = await this.connection.getSignaturesForAddress(
      new PublicKey(configAddress),
      { limit: 100 }
    );
    
    const transactions = await Promise.all(
      signatures.map(sig => 
        this.connection.getParsedTransaction(sig.signature)
      )
    );
    
    return transactions.map(tx => this.parseTransaction(tx));
  }

  parseTransaction(tx) {
    // Extract relevant data from transaction
    return {
      signature: tx.transaction.signatures[0],
      timestamp: tx.blockTime,
      type: this.getTransactionType(tx),
      amount: this.getTransactionAmount(tx),
      price: this.getTransactionPrice(tx),
      trader: this.getTrader(tx)
    };
  }

  async getChartData(configAddress, interval = '1h', limit = 100) {
    // This would typically call your backend API
    // For demonstration, showing the structure
    return {
      candles: [
        {
          time: Date.now() - 3600000,
          open: 0.001,
          high: 0.0012,
          low: 0.0009,
          close: 0.0011,
          volume: 50000
        }
        // ... more candles
      ]
    };
  }

  // Buy tokens
  async buyTokens(configAddress, amountIn, wallet) {
    const tx = await this.dbc.buy(
      new PublicKey(configAddress),
      amountIn,
      wallet.publicKey
    );
    
    return await this.connection.sendTransaction(tx, [wallet]);
  }

  // Sell tokens
  async sellTokens(configAddress, amountIn, wallet) {
    const tx = await this.dbc.sell(
      new PublicKey(configAddress),
      amountIn,
      wallet.publicKey
    );
    
    return await this.connection.sendTransaction(tx, [wallet]);
  }

  // Get quote for swap
  async getQuote(configAddress, amountIn, isBuy) {
    const config = await this.dbc.getConfig(new PublicKey(configAddress));
    
    if (isBuy) {
      const tokensOut = this.calculateTokensFromQuote(amountIn, config);
      const priceImpact = this.calculatePriceImpact(tokensOut, config);
      
      return {
        amountOut: tokensOut,
        priceImpact: priceImpact,
        pricePerToken: this.calculateCurrentPrice(config),
        fee: amountIn * 0.01 // 1% fee example
      };
    } else {
      const quoteOut = this.calculateQuoteFromTokens(amountIn, config);
      const priceImpact = this.calculatePriceImpact(amountIn, config);
      
      return {
        amountOut: quoteOut,
        priceImpact: priceImpact,
        pricePerToken: this.calculateCurrentPrice(config),
        fee: quoteOut * 0.01 // 1% fee example
      };
    }
  }
}

// Usage
const dbc = new MeteoraDBC('YOUR_RPC_ENDPOINT');

// Get all data for a token
const tokenData = await dbc.getTokenData('CONFIG_ADDRESS');
console.log('Current Price:', tokenData.metrics.currentPrice);
console.log('Market Cap:', tokenData.metrics.marketCap);
console.log('Progress:', tokenData.config.progressPercent + '%');

// Get quote for buying $100 worth
const quote = await dbc.getQuote('CONFIG_ADDRESS', 100, true);
console.log('Tokens you would receive:', quote.amountOut);
console.log('Price impact:', quote.priceImpact + '%');
```

## Bonding Curve Mathematics

### Linear Bonding Curve Formula
```
P(s) = P_start + (P_end - P_start) * (s / S)

Where:
- P(s) = Price at supply s
- P_start = Starting price
- P_end = Ending price (at migration)
- s = Current tokens sold
- S = Total tokens for sale
```

### Area Under Curve (Total Raise)
```
Total = ∫[0 to S] P(s) ds
      = S * (P_start + P_end) / 2
```

### Price Discovery
```javascript
function calculateStartPrice(targetRaise, totalSupply, percentOnMigration) {
  // Given a target raise amount, calculate starting price
  const tokensForSale = totalSupply * (percentOnMigration / 100);
  
  // For linear curve: targetRaise = tokensForSale * (startPrice + endPrice) / 2
  // If endPrice = migrationPrice
  const migrationPrice = targetRaise / tokensForSale;
  
  // Typical bonding curves have endPrice = 10-20x startPrice
  const multiplier = 14.4; // Common multiplier
  const startPrice = migrationPrice / multiplier;
  
  return startPrice;
}
```

## Real-time Updates

### WebSocket Integration
```javascript
class DBCWebSocket {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.subscriptions = new Map();
    
    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      this.handleUpdate(data);
    };
  }

  subscribe(configAddress, callback) {
    this.subscriptions.set(configAddress, callback);
    
    this.ws.send(JSON.stringify({
      type: 'subscribe',
      configAddress: configAddress
    }));
  }

  handleUpdate(data) {
    const callback = this.subscriptions.get(data.configAddress);
    if (callback) {
      callback({
        price: data.price,
        volume: data.volume,
        tokensSold: data.tokensSold,
        marketCap: data.marketCap,
        timestamp: data.timestamp
      });
    }
  }
}

// Usage
const ws = new DBCWebSocket('wss://your-websocket-url');

ws.subscribe('CONFIG_ADDRESS', (update) => {
  console.log('Price updated:', update.price);
  console.log('New volume:', update.volume);
  // Update your UI
});
```

### Polling Updates
```javascript
class DBCPoller {
  constructor(dbc, interval = 5000) {
    this.dbc = dbc;
    this.interval = interval;
    this.subscriptions = new Map();
  }

  start(configAddress, callback) {
    const pollerId = setInterval(async () => {
      const data = await this.dbc.getTokenData(configAddress);
      callback(data);
    }, this.interval);
    
    this.subscriptions.set(configAddress, pollerId);
  }

  stop(configAddress) {
    const pollerId = this.subscriptions.get(configAddress);
    if (pollerId) {
      clearInterval(pollerId);
      this.subscriptions.delete(configAddress);
    }
  }
}
```

## Integration Guide

### Step 1: Install Dependencies
```bash
npm install @meteora-ag/dbc-sdk @solana/web3.js
```

### Step 2: Initialize Connection
```javascript
import { DynamicBondingCurve } from '@meteora-ag/dbc-sdk';
import { Connection } from '@solana/web3.js';

const connection = new Connection('YOUR_RPC_ENDPOINT');
const dbc = new DynamicBondingCurve(connection);
```

### Step 3: Fetch and Display Data
```javascript
async function displayTokenInfo(configAddress) {
  const config = await dbc.getConfig(new PublicKey(configAddress));
  
  // Calculate all metrics
  const price = calculateCurrentPrice(config);
  const marketCap = price * (config.totalSupply / 1e9);
  const progress = (config.currentReserves / config.migrationQuoteThreshold) * 100;
  
  // Display in your UI
  updateUI({
    price: `$${price.toFixed(6)}`,
    marketCap: `$${marketCap.toLocaleString()}`,
    progress: `${progress.toFixed(2)}%`,
    volume: `$${(config.currentReserves / 1e9).toLocaleString()}`
  });
}
```

### Step 4: Enable Trading
```javascript
async function enableTrading(wallet) {
  // Buy tokens
  async function buy(amountSOL) {
    const tx = await dbc.buy(
      configPublicKey,
      amountSOL * 1e9, // Convert to lamports
      wallet.publicKey
    );
    
    const signature = await wallet.sendTransaction(tx, connection);
    await connection.confirmTransaction(signature);
    
    return signature;
  }

  // Sell tokens
  async function sell(amountTokens) {
    const tx = await dbc.sell(
      configPublicKey,
      amountTokens * 1e9, // Convert to smallest unit
      wallet.publicKey
    );
    
    const signature = await wallet.sendTransaction(tx, connection);
    await connection.confirmTransaction(signature);
    
    return signature;
  }

  return { buy, sell };
}
```

### Step 5: Add Charts
```javascript
import { createChart } from 'lightweight-charts';

function initChart(container, configAddress) {
  const chart = createChart(container, {
    width: 800,
    height: 400,
    theme: 'dark'
  });

  const candleSeries = chart.addCandlestickSeries();
  const volumeSeries = chart.addHistogramSeries();

  // Load historical data
  async function loadData() {
    const data = await fetch(`/api/dbc/chart/${configAddress}`);
    const candles = await data.json();
    
    candleSeries.setData(candles.map(c => ({
      time: c.time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close
    })));
    
    volumeSeries.setData(candles.map(c => ({
      time: c.time,
      value: c.volume,
      color: c.close > c.open ? '#26a69a' : '#ef5350'
    })));
  }

  // Subscribe to updates
  const ws = new WebSocket(`wss://your-ws-url/${configAddress}`);
  ws.onmessage = (event) => {
    const update = JSON.parse(event.data);
    candleSeries.update(update.candle);
    volumeSeries.update(update.volume);
  };

  loadData();
  return chart;
}
```

## Error Handling

```javascript
class DBCError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

async function safeGetData(configAddress) {
  try {
    const data = await dbc.getConfig(new PublicKey(configAddress));
    return { success: true, data };
  } catch (error) {
    if (error.message.includes('Account does not exist')) {
      throw new DBCError('Config not found', 'CONFIG_NOT_FOUND');
    }
    if (error.message.includes('Invalid public key')) {
      throw new DBCError('Invalid config address', 'INVALID_ADDRESS');
    }
    throw new DBCError('Failed to fetch data', 'FETCH_ERROR');
  }
}
```

## Performance Optimization

```javascript
// Cache frequently accessed data
class DBCCache {
  constructor(ttl = 5000) {
    this.cache = new Map();
    this.ttl = ttl;
  }

  async get(key, fetcher) {
    const cached = this.cache.get(key);
    
    if (cached && Date.now() - cached.timestamp < this.ttl) {
      return cached.data;
    }

    const data = await fetcher();
    this.cache.set(key, { data, timestamp: Date.now() });
    
    return data;
  }

  invalidate(key) {
    this.cache.delete(key);
  }
}

// Usage
const cache = new DBCCache(5000); // 5 second TTL

async function getCachedPrice(configAddress) {
  return cache.get(`price:${configAddress}`, async () => {
    const config = await dbc.getConfig(new PublicKey(configAddress));
    return calculateCurrentPrice(config);
  });
}
```

## Summary

This documentation covers:
- ✅ All available data points from Meteora DBC
- ✅ How to read and calculate prices
- ✅ Real-time updates via WebSocket or polling
- ✅ Complete code examples for integration
- ✅ Bonding curve mathematics
- ✅ Error handling and optimization

Use this guide to integrate Meteora DBC data into your application. The key is understanding the bonding curve mechanics and how prices are calculated from the sqrt price values stored on-chain.