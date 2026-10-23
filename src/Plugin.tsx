/**
 * Capture App enrollment plugin entry point.
 *
 * Built via d2.config.js's entryPoints.plugin, the DHIS2 App Platform wraps
 * this component with the real plugin runtime (postMessage handshake with
 * the Capture App host, iframe resizing, same-origin DHIS2 session), so it
 * is rendered with no setup of its own. Per the confirmed enrollment-plugin
 * contract (developers.dhis2.org/docs/capture-plugins), the props below are
 * exactly what the host provides — nothing more:
 *
 *   { programId, orgUnitId, enrollmentId, teiId, programStageId?, eventId?, navigate }
 *
 * The plugin has no automatic access to attributes or data values; it must
 * fetch what it needs itself (see AssessmentWorkspace's auto-load effect),
 * exactly like a regular app would, over the same @dhis2/app-runtime
 * useDataEngine() the platform also injects automatically here.
 */
import { useDataEngine } from "@dhis2/app-runtime";
import { CircularLoader, NoticeBox } from "@dhis2/ui";
import { AssessmentWorkspace } from "./components/AssessmentWorkspace";
import { useCvdRiskConfig } from "./hooks/useCvdRiskConfig";
import type { Dhis2DataEngine } from "./services/dhis2DataStore";

export interface EnrollmentPluginProps {
  programId: string;
  orgUnitId: string;
  enrollmentId: string;
  teiId: string;
  programStageId?: string;
  eventId?: string;
  navigate: (url: string) => void;
}

export default function Plugin(props: EnrollmentPluginProps) {
  const configState = useCvdRiskConfig();
  const rawEngine = useDataEngine();
  // Adapter: the real app-runtime engine's query signature is more specific
  // (typed query params) than the minimal, test-friendly Dhis2DataEngine
  // interface AssessmentWorkspace declares against. The risk score itself
  // is persisted via the native DOM write-back (see
  // src/unsupported/liveNativeFormBridge.ts), not through this engine, so
  // only `query` (for reading demographics/measurements) is needed here.
  const engine: Dhis2DataEngine = {
    query: (q) => rawEngine.query(q as Parameters<typeof rawEngine.query>[0]),
  };

  if (configState.status === "loading") {
    return (
      <div>
        <CircularLoader small /> Loading configuration…
      </div>
    );
  }

  if (configState.status !== "ok") {
    return (
      <NoticeBox title="Configuration error" error>
        <p>{configState.message}</p>
      </NoticeBox>
    );
  }

  const config = configState.config;

  if (config.dhis2MetadataMappings.programId !== props.programId) {
    return (
      <NoticeBox title="Program mismatch" error>
        <p>
          This plugin is configured for a different program than the one it was opened on. An
          administrator should verify the DataStore configuration&apos;s{" "}
          <code>dhis2MetadataMappings.programId</code> matches this program ({props.programId}).
        </p>
      </NoticeBox>
    );
  }

  return (
    <AssessmentWorkspace
      config={config}
      engine={engine}
      trackedEntityInstanceId={props.teiId}
      eventId={props.eventId}
      enableUnsupportedLiveFormPreview
    />
  );
}
