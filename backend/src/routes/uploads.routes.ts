import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { signedUploadSchema, parseBody } from '../validators/schemas.js';
import { createSignedUploadUrl, createSignedReadUrl } from '../services/storage.service.js';

export const uploadsRouter = Router();

uploadsRouter.post('/signed-upload-url', authenticate, async (req, res, next) => {
  try {
    const { file_name, content_type } = parseBody(signedUploadSchema, req.body);
    const result = await createSignedUploadUrl(file_name, content_type);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

uploadsRouter.get('/signed-read-url', authenticate, async (req, res, next) => {
  try {
    const storagePath = req.query.storage_path as string;
    const result = await createSignedReadUrl(storagePath);
    res.json(result);
  } catch (error) {
    next(error);
  }
});
