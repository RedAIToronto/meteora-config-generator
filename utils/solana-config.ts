import { Connection, clusterApiUrl } from '@solana/web3.js';

// QuickNode RPC endpoints
export const RPC_ENDPOINTS = {
  mainnet: 'https://billowing-alpha-borough.solana-mainnet.quiknode.pro/a03394eddb75c7558f4c17e7875eb6b59d0df60c/',
  devnet: clusterApiUrl('devnet'),
  testnet: clusterApiUrl('testnet'),
};

// Default to mainnet with QuickNode
export const DEFAULT_RPC = RPC_ENDPOINTS.mainnet;

// Create connection with commitment level
export const createConnection = (endpoint: string = DEFAULT_RPC, commitment: 'processed' | 'confirmed' | 'finalized' = 'confirmed') => {
  return new Connection(endpoint, commitment);
};

// Get network name from endpoint
export const getNetworkName = (endpoint: string): string => {
  if (endpoint.includes('mainnet') || endpoint.includes('quiknode')) return 'mainnet';
  if (endpoint.includes('devnet')) return 'devnet';
  if (endpoint.includes('testnet')) return 'testnet';
  return 'custom';
};

// Check if using mainnet
export const isMainnet = (endpoint: string): boolean => {
  return getNetworkName(endpoint) === 'mainnet';
};