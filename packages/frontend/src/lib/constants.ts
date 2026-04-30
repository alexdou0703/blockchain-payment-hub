export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:3001';

export const ESCROW_ADDRESS = (process.env.NEXT_PUBLIC_ESCROW_ADDRESS ?? '0x') as `0x${string}`;
export const USDT_ADDRESS = (process.env.NEXT_PUBLIC_USDT_ADDRESS ?? '0x') as `0x${string}`;
