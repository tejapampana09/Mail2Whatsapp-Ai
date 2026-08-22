import { test, describe } from 'node:test';
import assert from 'node:assert';
import { getFallbackAnalysis, llmResultSchema } from '../../src/services/ai/ai.service';

describe('AI Triage & Zod Validation Unit Tests', () => {
  test('getFallbackAnalysis correctly classifies finance and otp emails as High priority', () => {
    const res = getFallbackAnalysis('bank@alerts.com', 'Your OTP for Transaction', 'Use 123456 to authenticate.');
    assert.strictEqual(res.category, 'Finance');
    assert.strictEqual(res.importance, 'High');
  });

  test('getFallbackAnalysis correctly classifies scam and lottery emails as Spam with low importance', () => {
    const res = getFallbackAnalysis('spammer@lottery.com', 'Claim your free Bitcoin lottery prize', 'Click here to win free cash.');
    assert.strictEqual(res.category, 'Spam');
    assert.strictEqual(res.importance, 'Low');
    assert.strictEqual(res.aiMetadata?.spamScore, 95);
  });

  test('getFallbackAnalysis correctly classifies meeting invites', () => {
    const res = getFallbackAnalysis('colleague@work.com', 'Team Kickoff Meeting Schedule', 'Let us meet tomorrow at 10 AM.');
    assert.strictEqual(res.category, 'Meetings');
    assert.strictEqual(res.importance, 'High');
    assert.strictEqual(res.aiMetadata?.actionRequired, true);
  });

  test('llmResultSchema validates valid LLM JSON objects', () => {
    const valid = {
      category: 'Work',
      importance: 'High',
      summary: 'Deployment is scheduled for 8pm.',
      aiMetadata: {
        actionRequired: true,
        actionDetails: 'Review PR',
        deadline: 'Today',
        classifications: ['Meeting'],
        spamScore: 10,
        calendarEvent: null
      }
    };

    const parsed = llmResultSchema.safeParse(valid);
    assert.strictEqual(parsed.success, true);
  });

  test('llmResultSchema handles missing fields with safe defaults', () => {
    const partial = {
      summary: 'Short note.'
    };

    const parsed = llmResultSchema.safeParse(partial);
    assert.strictEqual(parsed.success, true);
    if (parsed.success) {
      assert.strictEqual(parsed.data.category, 'Work');
      assert.strictEqual(parsed.data.importance, 'Medium');
    }
  });
});
