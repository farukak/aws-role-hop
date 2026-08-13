import type { Message } from '../i18n';
import type { PortalDiscoveryFailure } from './portal-session';

export const DISCOVERY_FAILURE_MESSAGES: Record<PortalDiscoveryFailure, Message> = {
  permissionDenied: 'Portal access is needed before AWS Role Hop can read your accounts.',
  portalTabUnavailable: 'The access portal tab could not be opened.',
  unauthorized: 'Sign in to the access portal in a tab, then try again.',
  failed: 'The access portal could not be read.',
};
