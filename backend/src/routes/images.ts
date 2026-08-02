import { Router } from 'express';
import { notFound } from '../lib/errors';
import { getObject } from '../lib/storage';
import { asyncHandler } from '../middleware/asyncHandler';
import { verifyPhotoToken } from '../services/photos';

export const imagesRouter = Router();

/**
 * Only reachable with a token minted seconds earlier by an authorised request.
 * Used in local development and as the fallback when Supabase signed URLs are
 * unavailable.
 */
imagesRouter.get(
  '/:token',
  asyncHandler(async (req, res) => {
    const key = verifyPhotoToken(req.params.token ?? '');
    if (!key) throw notFound('That image link has expired.');

    const object = await getObject(key);
    if (!object) throw notFound('Image not found.');

    res.setHeader('Content-Type', key.endsWith('.png') ? 'image/png' : 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.setHeader('Content-Disposition', 'inline');
    res.send(object.body);
  }),
);
