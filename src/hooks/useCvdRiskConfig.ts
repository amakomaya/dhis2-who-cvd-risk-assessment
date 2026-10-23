/**
 * React hook wrapping loadCvdRiskConfiguration with the app's live DHIS2
 * data engine. Fetches once per app lifecycle (the service itself caches
 * the validated config), exposing a simple status machine for the UI.
 */
import { useEffect, useState } from "react";
import { useDataEngine } from "@dhis2/app-runtime";
import {
  loadCvdRiskConfiguration,
  type ConfigLoadResult,
  type Dhis2DataEngine,
} from "../services/dhis2DataStore";

export type UseCvdRiskConfigState =
  | { status: "loading" }
  | ConfigLoadResult;

export function useCvdRiskConfig(): UseCvdRiskConfigState {
  const rawEngine = useDataEngine();
  // Adapter: the real app-runtime engine's query signature is more specific
  // (typed query params) than the minimal, test-friendly Dhis2DataEngine
  // interface this service declares against.
  const engine: Dhis2DataEngine = {
    query: (q) => rawEngine.query(q as Parameters<typeof rawEngine.query>[0]),
  };
  const [state, setState] = useState<UseCvdRiskConfigState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    loadCvdRiskConfiguration(engine)
      .then((result) => {
        if (!cancelled) setState(result);
      })
      .catch((error: unknown) => {
        // Guarantees the UI never gets stuck silently on "Loading
        // configuration..." forever: any unexpected error still surfaces
        // as a visible notice.
        if (!cancelled) {
          setState({
            status: "network-error",
            message: error instanceof Error ? error.message : "Failed to load configuration.",
          });
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawEngine]);

  return state;
}
