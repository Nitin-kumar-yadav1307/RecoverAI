import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { verifyPassword, signJwt, verifyJwt, TokenConfig, AuthenticatedPrincipal } from '@recoverai/auth';

/** Issues and verifies merchant session tokens (spec §41, §42). */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenConfig: TokenConfig,
  ) {}

  async login(email: string, password: string): Promise<{ token: string; merchantId: string; merchantName: string }> {
    const merchant = await this.prisma.merchant.findUnique({ where: { email } });
    if (!merchant?.passwordHash || merchant.status !== 'ACTIVE') {
      throw new UnauthorizedException('Invalid credentials');
    }
    const ok = await verifyPassword(password, merchant.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    const token = signJwt({ sub: merchant.id }, this.tokenConfig.secret, this.tokenConfig.expiresInSeconds, this.tokenConfig.issuer);
    return { token, merchantId: merchant.id, merchantName: merchant.name };
  }

  /** Verifies a Bearer token into an AuthenticatedPrincipal, or throws 401. */
  verifyBearer(authHeader: string | undefined): AuthenticatedPrincipal {
    if (!authHeader?.startsWith('Bearer ')) throw new UnauthorizedException('Missing bearer token');
    try {
      const claims = verifyJwt(authHeader.slice(7), this.tokenConfig.secret, { issuer: this.tokenConfig.issuer });
      const merchantId = claims.merchant_id ?? claims.sub;
      if (!merchantId) throw new Error('no merchant claim');
      return { merchantId, claims };
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
