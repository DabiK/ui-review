import { mountReviewOverlay } from '../../src/content/overlay';
const overlay = mountReviewOverlay({ onCreateComment: async () => ({ ok: true }), onStopReview: () => overlay.unmount() });
