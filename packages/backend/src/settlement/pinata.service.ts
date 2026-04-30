import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Uploads JSON to IPFS via Pinata API v1. Falls back to mock hash in dev when no JWT. */
@Injectable()
export class PinataService {
  private readonly logger = new Logger(PinataService.name);
  private readonly jwt: string;

  constructor(private readonly config: ConfigService) {
    this.jwt = this.config.get<string>('pinataJwt') ?? '';
  }

  async pinJSON(body: object, name = 'payment-hub-batch'): Promise<string> {
    if (!this.jwt) {
      const mock = `mock-ipfs-${Date.now()}`;
      this.logger.warn(`No PINATA_JWT — returning mock hash: ${mock}`);
      return mock;
    }

    const res = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.jwt}`,
      },
      body: JSON.stringify({
        pinataContent: body,
        pinataMetadata: { name },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Pinata error ${res.status}: ${text}`);
    }

    const json = (await res.json()) as { IpfsHash: string };
    this.logger.log(`Pinned to IPFS: ${json.IpfsHash}`);
    return json.IpfsHash;
  }
}
