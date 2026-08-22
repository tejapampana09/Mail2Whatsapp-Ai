import { OAuth2Client } from 'google-auth-library';
import { env } from '../../config/env.config';
import logger from '../../logger.service';

const authClient = new OAuth2Client();

export interface PubSubVerificationResult {
  valid: boolean;
  email?: string;
  error?: string;
}

export async function verifyPubSubOidcToken(authHeader: string | undefined): Promise<PubSubVerificationResult> {
  if (!authHeader || typeof authHeader !== 'string') {
    return { valid: false, error: 'Missing Authorization header' };
  }

  if (!authHeader.startsWith('Bearer ')) {
    return { valid: false, error: 'Invalid Authorization header scheme, expected Bearer' };
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    return { valid: false, error: 'Empty bearer token' };
  }

  // Cryptographic Google OIDC JWT Verification only
  try {
    const audience = env.PUBSUB_AUDIENCE || undefined;
    const ticket = await authClient.verifyIdToken({
      idToken: token,
      audience
    });

    const payload = ticket.getPayload();
    if (!payload) {
      return { valid: false, error: 'Invalid token payload' };
    }

    // Verify Issuer
    const validIssuers = ['https://accounts.google.com', 'accounts.google.com'];
    if (!payload.iss || !validIssuers.includes(payload.iss)) {
      logger.warn({ type: 'PUBSUB_AUTH', description: 'Pub/Sub JWT rejected: Invalid issuer' });
      return { valid: false, error: 'Invalid token issuer' };
    }

    // Verify Service Account Identity if configured
    if (env.PUBSUB_SERVICE_ACCOUNT && !env.PUBSUB_SERVICE_ACCOUNT.includes('replace_me')) {
      const email = payload.email;
      if (!email || email !== env.PUBSUB_SERVICE_ACCOUNT) {
        logger.warn({ type: 'PUBSUB_AUTH', description: 'Pub/Sub JWT rejected: Service account mismatch' });
        return { valid: false, error: 'Service account identity mismatch' };
      }
    }

    return { valid: true, email: payload.email };
  } catch (err: any) {
    logger.warn({ type: 'PUBSUB_AUTH', description: `Pub/Sub JWT cryptographic verification failure: ${err.message}` });
    return { valid: false, error: 'Cryptographic token verification failed' };
  }
}
