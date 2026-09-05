import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtGuard, principal } from './jwt.guard';
import { AuthenticatedPrincipal, ownsResource } from '@recoverai/auth';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  async login(@Body() body: { email?: string; password?: string }) {
    if (!body.email || !body.password) {
      return { error: 'email and password required' };
    }
    return this.auth.login(body.email, body.password);
  }

  /** Authenticated echo — used by the dashboard to validate sessions. */
  @Get('me')
  @UseGuards(JwtGuard)
  me(@Req() req: unknown) {
    const p = principal(req);
    return { merchantId: p.merchantId, ok: ownsResource(p, { merchant_id: p.merchantId }) };
  }
}
