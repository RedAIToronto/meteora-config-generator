// Meteora DBC Error Codes
export const METEORA_ERROR_CODES: Record<number, { message: string; solution: string }> = {
  6000: {
    message: "Invalid authority",
    solution: "Make sure you're using the correct wallet that has authority to create configs"
  },
  6001: {
    message: "Invalid config",
    solution: "The configuration parameters are invalid. Check your settings."
  },
  6020: {
    message: "Invalid quote mint",
    solution: "The quote mint address is invalid. Use SOL (So11111111111111111111111111111111111111112) for mainnet or check if USDC address matches your network."
  },
  6021: {
    message: "Account already initialized",
    solution: "This config already exists. Generate a new config key."
  },
  6022: {
    message: "Insufficient funds",
    solution: "You need more SOL to pay for the transaction and rent (~0.01 SOL)"
  },
  6023: {
    message: "Invalid fee configuration",
    solution: "Check that your fee percentages are valid (0-100%) and that LP allocations sum to 100%"
  },
  6024: {
    message: "Invalid migration option",
    solution: "Migration option must be 0 (DAMM V1) or 1 (DAMM V2)"
  },
};

export function parseMeteoraError(error: any): string {
  // Check if it's a custom error from Meteora
  if (error?.toString?.().includes('Custom')) {
    const match = error.toString().match(/Custom":(\d+)/);
    if (match) {
      const errorCode = parseInt(match[1]);
      const knownError = METEORA_ERROR_CODES[errorCode];
      if (knownError) {
        return `❌ ${knownError.message}\n\n💡 Solution: ${knownError.solution}`;
      }
      return `❌ Meteora error code: ${errorCode}`;
    }
  }
  
  // Check for instruction errors
  if (error?.toString?.().includes('InstructionError')) {
    const match = error.toString().match(/"Custom":(\d+)/);
    if (match) {
      const errorCode = parseInt(match[1]);
      const knownError = METEORA_ERROR_CODES[errorCode];
      if (knownError) {
        return `❌ ${knownError.message}\n\n💡 Solution: ${knownError.solution}`;
      }
    }
  }
  
  return error?.toString?.() || 'Unknown error';
}