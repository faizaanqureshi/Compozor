// What the public link page shows, derived only from server-calculated
// readiness. The frontend never decides upload permission itself: the backend
// also enforces it on every new upload.

import type { PortalBootstrap, PortalReadiness } from "./client-portal-api";

export interface PortalView {
  // Show the checklist and uploader.
  showUploader: boolean;
  // Show any questionnaire UI at all.
  showQuestionnaires: boolean;
  // A required questionnaire must be submitted before new uploads.
  requiredFirst: boolean;
}

export function portalView(readiness: PortalReadiness | PortalBootstrap | null | undefined): PortalView {
  // An older API without portal state keeps today's upload-only experience;
  // the server still enforces its own rules either way.
  if (!readiness) return { showUploader: true, showQuestionnaires: false, requiredFirst: false };
  return {
    showUploader: readiness.uploads_allowed,
    showQuestionnaires: readiness.questionnaire_state !== "none",
    requiredFirst: !readiness.uploads_allowed && readiness.blocking_reason === "required_questionnaire_outstanding",
  };
}
