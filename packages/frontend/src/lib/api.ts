import { API_URL } from './constants';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${path} → ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export interface PaymentRequestData {
  paymentId: string;
  payload: {
    merchant: string;
    customer: string;
    amount: bigint;
    orderId: `0x${string}`;
    nonce: `0x${string}`;
    deadline: number;
    token: string;
  };
  merchantSignature: string;
  order: {
    id: string;
    merchantId: string;
    amount: string;
    status: string;
  };
}

export interface DisputeData {
  id: string;
  orderId: string;
  initiatorAddress: string;
  state: string;
  evidenceHashes: string[];
  ruling: string | null;
  sellerBasisPoints: number | null;
  createdAt: string;
}

export interface OrderData {
  id: string;
  merchantId: string;
  customerId: string;
  amount: string;
  status: string;
  onChainOrderId: string | null;
  createdAt: string;
}

export const api = {
  getPaymentByOrderId: (orderId: string) =>
    request<PaymentRequestData>(`/api/v1/payments/order/${orderId}`),

  getPayment: (id: string) =>
    request<{ id: string; state: string; chainTxHash: string | null }>(`/api/v1/payments/${id}`),

  createPaymentRequest: (body: {
    platformOrderId: string;
    merchantAddress: string;
    customerAddress: string;
    amount: string;
  }) =>
    request<PaymentRequestData>(`/api/v1/payments/request`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  getOrders: (params: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString();
    return request<OrderData[]>(`/api/v1/orders?${qs}`);
  },

  getOrder: (id: string) => request<OrderData>(`/api/v1/orders/${id}`),

  getDispute: (id: string) => request<DisputeData>(`/api/v1/disputes/${id}`),

  addEvidence: (id: string, ipfsHash: string) =>
    request<DisputeData>(`/api/v1/disputes/${id}/evidence`, {
      method: 'POST',
      body: JSON.stringify({ ipfsHash }),
    }),

  appealDispute: (id: string) =>
    request<DisputeData>(`/api/v1/disputes/${id}/appeal`, { method: 'POST' }),
};
