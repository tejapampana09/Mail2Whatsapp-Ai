export function normalizeWhatsAppNumber(toNumber: string): string {
  const digitsAndPlus = toNumber.replace(/[^\d+]/g, '').trim();
  if (!digitsAndPlus) return '';

  if (digitsAndPlus.startsWith('00')) {
    return '+' + digitsAndPlus.slice(2);
  }

  if (!digitsAndPlus.startsWith('+') && digitsAndPlus.length > 0) {
    if (digitsAndPlus.length === 10) {
      return '+91' + digitsAndPlus;
    }
    return '+' + digitsAndPlus;
  }

  return digitsAndPlus;
}

export function cleanPhoneNumberDigits(phoneNumber: string): string {
  return phoneNumber.replace(/[^\d]/g, '');
}
