import { Router } from 'express';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js';
import { query } from '../lib/db.js';
import { mapSafetyGuide } from '../mappers/index.js';
import { userProfileUpdateSchema, parseBody } from '../validators/schemas.js';
import type { SafetyGuideRow } from '../types/contracts.js';

export const usersRouter = Router();

usersRouter.get('/me', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const user = req.user!;
    const profile: Record<string, unknown> = {
      id: user.id,
      role: user.role,
      phone_number: user.phoneNumber,
      preferred_language: user.preferredLanguage,
      created_at: new Date().toISOString(),
    };

    const userRow = await query<{ created_at: Date }>('SELECT created_at FROM users WHERE id = $1', [
      user.id,
    ]);
    if (userRow.rows[0]) {
      profile.created_at = userRow.rows[0].created_at.toISOString();
    }

    if (user.role === 'collector') {
      const collector = await query<{ operating_location: unknown }>(
        'SELECT operating_location FROM collectors WHERE user_id = $1',
        [user.id],
      );
      if (collector.rows[0]?.operating_location) {
        profile.operating_location = collector.rows[0].operating_location;
      }
    }

    if (user.role === 'recycler' && user.recyclerId) {
      profile.recycler_id = user.recyclerId;
      profile.role_at_facility = user.roleAtFacility;
    }

    res.json(profile);
  } catch (error) {
    next(error);
  }
});

usersRouter.patch('/me', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const input = parseBody(userProfileUpdateSchema, req.body);
    const user = req.user!;

    if (input.preferred_language) {
      await query('UPDATE users SET preferred_language = $1 WHERE id = $2', [
        input.preferred_language,
        user.id,
      ]);
    }

    if (input.operating_location && user.role === 'collector') {
      await query('UPDATE collectors SET operating_location = $1 WHERE user_id = $2', [
        JSON.stringify(input.operating_location),
        user.id,
      ]);
    }

    const updated = await query<{ created_at: Date; preferred_language: string }>(
      'SELECT created_at, preferred_language FROM users WHERE id = $1',
      [user.id],
    );

    res.json({
      id: user.id,
      role: user.role,
      phone_number: user.phoneNumber,
      preferred_language: updated.rows[0]?.preferred_language ?? user.preferredLanguage,
      operating_location: input.operating_location,
      recycler_id: user.recyclerId,
      role_at_facility: user.roleAtFacility,
      created_at: updated.rows[0]?.created_at.toISOString() ?? new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

export const safetyGuidesRouter = Router();

safetyGuidesRouter.get('/', async (req, res, next) => {
  try {
    const language = req.query.language as string | undefined;
    const result = await query<SafetyGuideRow>('SELECT * FROM safety_guides ORDER BY title_en');
    const items = result.rows.map((row) => {
      const base = mapSafetyGuide(row);
      // Return language-appropriate title as the primary "title" field
      if (language === 'hi') {
        return { ...base, title: row.title_hi };
      } else if (language === 'mr') {
        return { ...base, title: row.title_mr };
      } else {
        return { ...base, title: row.title_en };
      }
    });
    res.json({ items, next_cursor: null });
  } catch (error) {
    next(error);
  }
});
