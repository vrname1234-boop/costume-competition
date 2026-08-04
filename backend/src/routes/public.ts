import { Router } from 'express';
import { config } from '../config';
import { asyncHandler } from '../middleware/asyncHandler';
import {
  evaluateWindow,
  getSettings,
  getSiteContent,
  listCategories,
  listHouses,
  windowMessage,
} from '../services/settings';

export const publicRouter = Router();

/**
 * Everything the public landing page and the submission form need, in one
 * request. Nothing here is sensitive: no user data, no counts, no keys.
 */
publicRouter.get(
  '/site',
  asyncHandler(async (_req, res) => {
    const [settings, content, houses, categories] = await Promise.all([
      getSettings(),
      getSiteContent(),
      listHouses(true),
      listCategories(true),
    ]);

    const window = evaluateWindow(settings);

    res.json({
      // The frontend warns on the practice site using this, so the warning
      // comes from the backend the data actually lives in rather than from a
      // build-time variable that could be set wrongly.
      environment: config.appEnvironment,
      content,
      competition: {
        name: settings.competition_name,
        opensAt: settings.submission_opens_at,
        closesAt: settings.submission_closes_at,
        timezone: settings.timezone,
        numberOfWinners: settings.number_of_winners,
        prizeInfo: settings.prize_info,
        requirements: settings.requirements,
        maxFileSizeMb: settings.max_file_size_mb,
        allowedFileTypes: settings.allowed_file_types,
      },
      submissionWindow: { ...window, message: windowMessage(window) },
      houses: houses.map((h) => ({ id: h.id, name: h.name })),
      categories: categories.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        requirements: c.requirements,
      })),
    });
  }),
);
