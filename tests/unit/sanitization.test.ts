import { test, describe } from 'node:test';
import assert from 'node:assert';
import { sanitizeHtmlToText } from '../../gmail';
import { sanitizeWhatsAppParam } from '../../whatsapp';

describe('Sanitization & Security Formatting Unit Tests', () => {
  test('sanitizeHtmlToText strips scripts, styles, svgs and leaves clean text', () => {
    const rawHtml = `
      <html>
        <head>
          <style>body { color: red; }</style>
          <script>alert('malicious')</script>
        </head>
        <body>
          <h2>Urgent Invoice Notice</h2>
          <svg><path d="123"/></svg>
          <p>Please find your invoice for <b>$450.00</b> attached.</p>
          <img src="https://tracker.com/pixel.png" />
          <a href="https://example.com">Click here</a>
        </body>
      </html>
    `;

    const cleaned = sanitizeHtmlToText(rawHtml);
    assert.strictEqual(cleaned.includes('<script>'), false);
    assert.strictEqual(cleaned.includes('<style>'), false);
    assert.strictEqual(cleaned.includes('<svg>'), false);
    assert.strictEqual(cleaned.includes('alert('), false);
    assert.strictEqual(cleaned.includes('Urgent Invoice Notice'), true);
    assert.strictEqual(cleaned.includes('$450.00'), true);
    assert.strictEqual(cleaned.includes('Click here'), true);
  });

  test('sanitizeHtmlToText decodes common HTML entities', () => {
    const raw = 'Meeting at 5 &amp; 6 &lt;PM&gt; &quot;Urgent&quot; &#39;Notes&#39;';
    const cleaned = sanitizeHtmlToText(raw);
    assert.strictEqual(cleaned, 'Meeting at 5 & 6 <PM> "Urgent" \'Notes\'');
  });

  test('sanitizeWhatsAppParam strips newlines, carriage returns and tabs', () => {
    const messySummary = "Line 1\r\nLine 2\n\tIndented details \n Final action point.";
    const sanitized = sanitizeWhatsAppParam(messySummary, 300);

    assert.strictEqual(sanitized.includes('\n'), false);
    assert.strictEqual(sanitized.includes('\r'), false);
    assert.strictEqual(sanitized.includes('\t'), false);
    assert.strictEqual(sanitized, 'Line 1 Line 2 Indented details Final action point.');
  });

  test('sanitizeWhatsAppParam enforces maxLen bounds safely', () => {
    const longText = 'A'.repeat(500);
    const sanitized = sanitizeWhatsAppParam(longText, 60);
    assert.strictEqual(sanitized.length, 60);
  });

  test('sanitizeWhatsAppParam preserves Unicode and Emojis', () => {
    const textWithEmoji = '🚨 Critical alert ⚡ for server update 🚀';
    const sanitized = sanitizeWhatsAppParam(textWithEmoji);
    assert.strictEqual(sanitized, textWithEmoji);
  });
});
