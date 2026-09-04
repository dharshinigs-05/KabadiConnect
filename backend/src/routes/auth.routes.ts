import { Router } from 'express';
import { randomUUID } from 'crypto';
import { query } from '../lib/db.js';
import { getSupabaseAuth } from '../lib/supabase.js';
import { useMockAuth } from '../config/env.js';
import { badRequest } from '../errors/AppError.js';
import { createDevToken, getMockOtp } from '../middleware/auth.js';
import { otpRequestSchema, otpVerifySchema, parseBody } from '../validators/schemas.js';

export const authRouter = Router();

authRouter.post('/otp/request', async (req, res, next) => {
  try {
    const { phone_number } = parseBody(otpRequestSchema, req.body);

    if (useMockAuth()) {
      res.json({ success: true });
      return;
    }

    const { error } = await getSupabaseAuth().auth.signInWithOtp({ phone: phone_number });
    if (error) {
      throw badRequest(error.message);
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/otp/verify', async (req, res, next) => {
  try {
    const { phone_number, otp } = parseBody(otpVerifySchema, req.body);

    let userId: string;
    let accessToken: string;
    let refreshToken: string;

    if (useMockAuth()) {
      if (otp !== getMockOtp()) {
        throw badRequest('Invalid OTP');
      }

      const existing = await query<{ id: string; role: string }>(
        'SELECT id, role FROM users WHERE phone_number = $1',
        [phone_number],
      );

      let isNewUser = false;
      if (existing.rows[0]) {
        userId = existing.rows[0].id;
      } else {
        isNewUser = true;
        userId = randomUUID();
        await query('INSERT INTO auth.users (id) VALUES ($1) ON CONFLICT DO NOTHING', [userId]);
        await query(
          `INSERT INTO users (id, role, phone_number, preferred_language)
           VALUES ($1, 'collector', $2, 'hi')`,
          [userId, phone_number],
        );
        await query('INSERT INTO collectors (user_id) VALUES ($1)', [userId]);
      }

      accessToken = createDevToken({
        id: userId,
        role: (existing.rows[0]?.role ?? 'collector') as 'collector',
        phoneNumber: phone_number,
        preferredLanguage: 'hi',
      });
      refreshToken = `refresh-${accessToken}`;

      res.json({
        access_token: accessToken,
        refresh_token: refreshToken,
        user_id: userId,
        role: existing.rows[0]?.role ?? 'collector',
        is_new_user: isNewUser,
      });
      return;
    }

    const { data, error } = await getSupabaseAuth().auth.verifyOtp({
      phone: phone_number,
      token: otp,
      type: 'sms',
    });

    if (error || !data.session || !data.user) {
      throw badRequest(error?.message ?? 'OTP verification failed');
    }

    userId = data.user.id;
    accessToken = data.session.access_token;
    refreshToken = data.session.refresh_token;

    const userRow = await query<{ id: string; role: string }>('SELECT id, role FROM users WHERE id = $1', [
      userId,
    ]);

    let isNewUser = false;
    if (!userRow.rows[0]) {
      isNewUser = true;
      await query(
        `INSERT INTO users (id, role, phone_number, preferred_language)
         VALUES ($1, 'collector', $2, 'hi')`,
        [userId, phone_number],
      );
      await query('INSERT INTO collectors (user_id) VALUES ($1)', [userId]);
    }

    res.json({
      access_token: accessToken,
      refresh_token: refreshToken,
      user_id: userId,
      role: userRow.rows[0]?.role ?? 'collector',
      is_new_user: isNewUser,
    });
  } catch (error) {
    next(error);
  }
});
