import { z } from 'zod';

export const llmResultSchema = z.object({
  category: z.string().default('Work'),
  importance: z.enum(['High', 'Medium', 'Low']).default('Medium'),
  summary: z.string(),
  aiMetadata: z.object({
    actionRequired: z.boolean().default(false),
    actionDetails: z.string().nullable().default(null),
    deadline: z.string().nullable().default(null),
    classifications: z.array(z.string()).default([]),
    spamScore: z.number().min(0).max(100).default(0),
    calendarEvent: z.object({
      title: z.string(),
      start: z.string(),
      end: z.string().nullable().optional()
    }).nullable().default(null)
  }).nullable().default(null)
});

export type LLMResult = z.infer<typeof llmResultSchema>;
