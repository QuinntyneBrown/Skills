import { hash, verify, Algorithm } from '@node-rs/argon2';
import crypto from 'crypto';
import { userRepository } from '../repositories/user.repository';
import { tokenService } from './token.service';
import { UnauthorizedError, ValidationError, ForbiddenError } from '../utils/errors';
import { TokenResponse, RegisterDto, LoginDto } from '../models/dto';
import { logger } from '../utils/logger';

const ARGON2_OPTIONS = {
  algorithm: 2 as Algorithm, // argon2id
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
};

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{12,}$/;

export class AuthService {
  async register(dto: RegisterDto): Promise<{ message: string }> {
    if (!PASSWORD_REGEX.test(dto.password)) {
      throw new ValidationError('Password does not meet complexity requirements', [
        {
          field: 'password',
          reason: 'Must be at least 12 characters with uppercase, lowercase, digit, and special character',
        },
      ]);
    }

    const existing = await userRepository.findByEmail(dto.email.toLowerCase());
    if (existing) {
      return { message: 'If the email is not already registered, a verification email has been sent.' };
    }

    const passwordHash = await hash(dto.password, ARGON2_OPTIONS);
    const emailToken = crypto.randomBytes(32).toString('hex');
    const emailTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const user = await userRepository.createUser(
      dto.email.toLowerCase(),
      passwordHash,
      emailToken,
      emailTokenExpiry
    );

    await userRepository.assignRole(user.id, 'member');

    logger.info('User registered, verification email pending', { userId: user.id });

    return { message: 'If the email is not already registered, a verification email has been sent.' };
  }

  async login(dto: LoginDto): Promise<TokenResponse> {
    const user = await userRepository.findByEmailWithRoles(dto.email.toLowerCase());

    if (!user) {
      await hash('dummy-password-timing-safe', ARGON2_OPTIONS);
      throw new UnauthorizedError('Invalid credentials');
    }

    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      throw new UnauthorizedError('Account is temporarily locked. Please try again later.');
    }

    if (!user.password_hash) {
      throw new UnauthorizedError('Invalid credentials');
    }

    const valid = await verify(user.password_hash, dto.password, ARGON2_OPTIONS);
    if (!valid) {
      const attempts = await userRepository.incrementFailedAttempts(user.id);
      if (attempts >= 5) {
        const lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
        await userRepository.updateLockout(user.id, lockedUntil, attempts);
        logger.warn('Account locked due to failed attempts', { userId: user.id });
      }
      throw new UnauthorizedError('Invalid credentials');
    }

    if (!user.email_verified) {
      throw new ForbiddenError('Email not verified. Please verify your email before logging in.');
    }

    await userRepository.resetFailedAttempts(user.id);

    const accessToken = tokenService.issueAccessToken(user.id, user.roles);
    const { token: refreshToken } = await tokenService.issueRefreshToken(user.id);

    return { accessToken, refreshToken, expiresIn: 900 };
  }

  async refresh(refreshTokenRaw: string): Promise<TokenResponse> {
    const result = await tokenService.rotateRefreshToken(refreshTokenRaw);

    const user = await userRepository.findByIdWithRoles(result.userId);
    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    const accessToken = tokenService.issueAccessToken(user.id, user.roles);

    return { accessToken, refreshToken: result.refreshToken, expiresIn: 900 };
  }

  async logout(refreshTokenRaw: string): Promise<void> {
    await tokenService.revokeRefreshToken(refreshTokenRaw);
  }

  async logoutAll(userId: string): Promise<void> {
    await tokenService.revokeAllTokens(userId);
  }

  async verifyEmail(token: string): Promise<void> {
    const { query } = await import('../config/database');
    const rows = await query<{ id: string; email_verification_expires_at: Date }>(
      'SELECT id, email_verification_expires_at FROM users WHERE email_verification_token = $1',
      [token]
    );

    if (rows.length === 0) {
      throw new ValidationError('Invalid or expired verification token');
    }

    const user = rows[0];
    if (new Date(user.email_verification_expires_at) < new Date()) {
      throw new ValidationError('Verification token has expired');
    }

    await userRepository.updateEmailVerified(user.id);
  }

  async changePassword(userId: string, oldPassword: string, newPassword: string): Promise<void> {
    if (!PASSWORD_REGEX.test(newPassword)) {
      throw new ValidationError('New password does not meet complexity requirements');
    }

    const user = await userRepository.findById(userId);
    if (!user || !user.password_hash) {
      throw new UnauthorizedError('Cannot change password');
    }

    const valid = await verify(user.password_hash, oldPassword, ARGON2_OPTIONS);
    if (!valid) {
      throw new UnauthorizedError('Current password is incorrect');
    }

    const newHash = await hash(newPassword, ARGON2_OPTIONS);
    await userRepository.updatePassword(userId, newHash);

    await tokenService.revokeAllTokens(userId);
  }
}

export const authService = new AuthService();
