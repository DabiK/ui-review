import {
  addReviewComment,
  captureCommentEvidence,
  checkLocalBridge,
  clearReviewSession,
  deleteReviewComment,
  deleteReviewCommentAttachment,
  exportReviewHandoff,
  loadOverlayState,
  loadReviewPanel,
  readSessionArtifact,
  renameReviewSession,
  startReviewSession,
  stopReviewSession,
  storeSessionArtifact,
  updateReviewComment,
  type AddReviewCommentInput,
  type AddReviewCommentResult,
  type CaptureCommentEvidenceInput,
  type CaptureCommentEvidenceResult,
  type ClearReviewSessionResult,
  type DeleteReviewCommentAttachmentInput,
  type DeleteReviewCommentAttachmentResult,
  type DeleteReviewCommentInput,
  type DeleteReviewCommentResult,
  type ExportReviewHandoffResult,
  type LoadReviewPanelInput,
  type LocalBridgeArtifactRef,
  type LocalBridgeArtifactWriteInput,
  type LocalBridgeHealthResult,
  type LocalBridgeReadResult,
  type LocalBridgeWriteResult,
  type OverlayState,
  type RenameReviewSessionResult,
  type ReviewPanelState,
  type SessionId,
  type StartReviewSessionResult,
  type StopReviewSessionResult,
  type UpdateReviewCommentInput,
  type UpdateReviewCommentResult,
} from '@core';
import { ChromeActivePageAdapter } from '@adapters/chrome/active-page';
import { ChromeComponentContextAdapter } from '@adapters/chrome/component-context';
import { ChromeNativeMessagingBridgeAdapter } from '@adapters/chrome/native-bridge';
import { ChromeReviewChannel } from '@adapters/chrome/review-channel';
import { ChromeScreenshotCaptureAdapter } from '@adapters/chrome/screenshot-capture';
import { IndexedDbReviewSessionRepository } from '@adapters/persistence/indexeddb/indexeddb-review-session-repository';
import { ChromeRuntimeInfoAdapter } from '@adapters/runtime/chrome-runtime-info';
import { CryptoIdGeneratorAdapter } from '@adapters/runtime/crypto-id-generator';
import { NavigatorClipboardAdapter } from '@adapters/runtime/navigator-clipboard';
import { SystemClockAdapter } from '@adapters/runtime/system-clock';
import type { ReviewChangeBroadcaster } from './gateways';

/**
 * Composition root: the only place allowed to pick concrete adapters. Driving adapters
 * (side panel, page overlay, service worker) receive use cases, never adapters directly.
 */
export interface AppContainer extends ReviewChangeBroadcaster {
  loadReviewPanel(input?: LoadReviewPanelInput): Promise<ReviewPanelState>;
  startReviewSession(): Promise<StartReviewSessionResult>;
  stopReviewSession(sessionId: SessionId): Promise<StopReviewSessionResult>;
  renameReviewSession(sessionId: SessionId, name: string): Promise<RenameReviewSessionResult>;
  clearReviewSession(sessionId: SessionId): Promise<ClearReviewSessionResult>;
  loadOverlayState(pageUrl: string): Promise<OverlayState>;
  addReviewComment(input: AddReviewCommentInput): Promise<AddReviewCommentResult>;
  captureCommentEvidence(
    input: CaptureCommentEvidenceInput,
  ): Promise<CaptureCommentEvidenceResult>;
  updateReviewComment(input: UpdateReviewCommentInput): Promise<UpdateReviewCommentResult>;
  deleteReviewComment(input: DeleteReviewCommentInput): Promise<DeleteReviewCommentResult>;
  deleteReviewCommentAttachment(
    input: DeleteReviewCommentAttachmentInput,
  ): Promise<DeleteReviewCommentAttachmentResult>;
  checkLocalBridge(): Promise<LocalBridgeHealthResult>;
  storeSessionArtifact(input: LocalBridgeArtifactWriteInput): Promise<LocalBridgeWriteResult>;
  readSessionArtifact(input: LocalBridgeArtifactRef): Promise<LocalBridgeReadResult>;
  exportReviewHandoff(sessionId: SessionId): Promise<ExportReviewHandoffResult>;
  subscribeToReviewChanges(listener: () => void): () => void;
}

export function createAppContainer(): AppContainer {
  const sessions = new IndexedDbReviewSessionRepository();
  const runtimeInfo = new ChromeRuntimeInfoAdapter();
  const pages = new ChromeActivePageAdapter();
  const clock = new SystemClockAdapter();
  const ids = new CryptoIdGeneratorAdapter();
  const channel = new ChromeReviewChannel();
  const screenshots = new ChromeScreenshotCaptureAdapter();
  const components = new ChromeComponentContextAdapter();
  const bridge = new ChromeNativeMessagingBridgeAdapter({ ids });
  const clipboard = new NavigatorClipboardAdapter();

  return {
    loadReviewPanel: (input) => loadReviewPanel({ sessions, pages, runtimeInfo }, input),
    startReviewSession: () => startReviewSession({ sessions, pages, clock, ids }),
    stopReviewSession: (sessionId) => stopReviewSession({ sessions, clock }, { sessionId }),
    renameReviewSession: (sessionId, name) =>
      renameReviewSession({ sessions }, { sessionId, name }),
    clearReviewSession: (sessionId) => clearReviewSession({ sessions }, { sessionId }),
    loadOverlayState: (pageUrl) => loadOverlayState({ sessions }, { pageUrl }),
    addReviewComment: (input) => addReviewComment({ sessions, clock, ids }, input),
    captureCommentEvidence: (input) =>
      captureCommentEvidence({ sessions, screenshots, components, clock, ids }, input),
    updateReviewComment: (input) => updateReviewComment({ sessions, clock }, input),
    deleteReviewComment: (input) => deleteReviewComment({ sessions }, input),
    deleteReviewCommentAttachment: (input) =>
      deleteReviewCommentAttachment({ sessions }, input),
    checkLocalBridge: () => checkLocalBridge({ bridge }),
    storeSessionArtifact: (input) => storeSessionArtifact({ bridge }, input),
    readSessionArtifact: (input) => readSessionArtifact({ bridge }, input),
    exportReviewHandoff: (sessionId) =>
      exportReviewHandoff({ sessions, bridge, clipboard, clock }, { sessionId }),
    notifyPanelChanged: () => channel.notifyPanelChanged(),
    syncPageOverlay: (pageUrl) => channel.syncPageOverlay(pageUrl),
    subscribeToReviewChanges: (listener) => channel.subscribe(listener),
  };
}
