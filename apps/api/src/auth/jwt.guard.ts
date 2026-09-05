import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthenticatedPrincipal } from '@recoverai/auth';

export const PRINCIPAL_KEY = 'principal';

/** Nest guard: verifies the Bearer token and attaches the principal to the request. */
@Injectable()
export class JwtGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    try {
      const principal = this.auth.verifyBearer(req.headers?.authorization);
      (req as unknown as Record<string, unknown>)[PRINCIPAL_KEY] = principal;
      return true;
    } catch {
      throw new UnauthorizedException('Unauthorized');
    }
  }
}

/** Param decorator to access the authenticated principal. */
export function principal(req: unknown): AuthenticatedPrincipal {
  return (req as Record<string, unknown>)[PRINCIPAL_KEY] as AuthenticatedPrincipal;
}
