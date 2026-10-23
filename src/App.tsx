import { CssReset, CssVariables } from "@dhis2/ui";
import { AssessmentPage } from "./pages/AssessmentPage";

export default function App() {
  return (
    <>
      <CssReset />
      <CssVariables colors spacers theme />
      <AssessmentPage />
    </>
  );
}
