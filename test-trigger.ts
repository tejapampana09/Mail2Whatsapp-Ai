import { sendWhatsAppAlert } from './whatsapp.ts';
import { initDb, getDb } from './db.ts';

async function run() {
  await initDb();
  const db = await getDb();
  const row = db.prepare('SELECT whatsapp_number FROM settings LIMIT 1').get() as any;
  if (!row || !row.whatsapp_number) {
    console.error('No whatsapp number found in settings table.');
    return;
  }
  console.log('Sending test alert to:', row.whatsapp_number);
  const res = await sendWhatsAppAlert(row.whatsapp_number, {
    from: 'Google Antigravity',
    subject: 'Integration Test Successful 🚀',
    category: 'Security',
    importance: 'High',
    summary: 'This is a test notification verifying that your Meta templates are fully active. The 24-hour customer service window rule has been bypassed!'
  });
  console.log(res);
}

run().catch(console.error);
