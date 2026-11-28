import { createServiceVerification } from "@/modules/structure/service-verification";
import { applicationNamespaces, mediaReadScopes, mediaWriteScopes } from "@/utils/constant";
import { authUrl, nodeEnv } from "@/utils/environment";

export const {
  verifyServiceRequest,
  serviceAuthFailure,
  serviceResourceMetadata,
} = createServiceVerification({
  service: "media",
  authUrl,
  nodeEnv,
  applications: applicationNamespaces,
  scopeFor: (application, access) => (access === "read" ? mediaReadScopes : mediaWriteScopes)[application],
});
