/**
 * Standalone-app entry for the clinical assessment workflow (as opposed to
 * src/Plugin.tsx, the Capture enrollment-plugin entry). AssessmentWorkspace
 * only auto-loads data when given a trackedEntityInstanceId/eventId, which
 * this entry point doesn't supply - so today this page mainly exists for
 * configuration-loading diagnostics (loads and validates the DataStore
 * config) rather than full standalone data entry.
 */
import { CircularLoader, NoticeBox } from "@dhis2/ui";
import { useDataEngine } from "@dhis2/app-runtime";
import { AssessmentWorkspace } from "../components/AssessmentWorkspace";
import { useCvdRiskConfig } from "../hooks/useCvdRiskConfig";
import type { Dhis2DataEngine } from "../services/dhis2DataStore";

export function AssessmentPage() {
  const configState = useCvdRiskConfig();
  const rawEngine = useDataEngine();
  // Adapter: the real DHIS2 app-runtime engine's query signature is more
  // specific (typed query params) than the minimal, test-friendly
  // Dhis2DataEngine interface AssessmentWorkspace declares against.
  const engine: Dhis2DataEngine = {
    query: (q) => rawEngine.query(q as Parameters<typeof rawEngine.query>[0]),
  };

  if (configState.status === "loading") {
    return (
      <div>
        <CircularLoader /> Loading configuration…
      </div>
    );
  }

  if (configState.status !== "ok") {
    return (
      <NoticeBox title="Configuration error" error>
        <p>{configState.message}</p>
        {configState.status === "invalid" && (
          <ul>
            {configState.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        )}
      </NoticeBox>
    );
  }

  return <AssessmentWorkspace config={configState.config} engine={engine} />;
}
