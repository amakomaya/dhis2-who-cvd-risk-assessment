import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { RiskFactorTable } from "../RiskFactorTable";
import type { CvdRiskResult } from "../../domain/cvd-risk/types";

function labResult(overrides: Partial<CvdRiskResult> = {}): CvdRiskResult {
  return {
    status: "calculated",
    methodology: "who-2019-cvd-risk-laboratory-based",
    chartRegion: "south-asia",
    chartType: "laboratory-based",
    chartVersion: "who-2019-south-asia-lab-v1",
    algorithmVersion: "1.0.0",
    riskPercent: 15,
    riskCategory: "10-to-under-20",
    inputsUsed: {
      chartType: "laboratory-based",
      age: 55,
      sex: "male",
      smokingStatus: "smoker",
      systolicBloodPressureMmHg: 150,
      totalCholesterolMmolPerL: 6.5, // ~251 mg/dL -> red
      diabetesStatus: "with",
    },
    validationErrors: [],
    missingMeasurements: [],
    message: "",
    ...overrides,
  };
}

describe("RiskFactorTable", () => {
  it("renders the table with '-' placeholders when there are no inputsUsed", () => {
    const result = labResult({ inputsUsed: undefined, riskPercent: undefined, riskCategory: undefined });
    render(<RiskFactorTable result={result} />);
    expect(screen.getByText("10 years CVD Risk")).toBeInTheDocument();
    const smokingRow = screen.getByText("Smoking").closest("tr")!;
    expect(within(smokingRow).getAllByText("-").length).toBeGreaterThan(0);
    const scoreRow = screen.getByText("Risk Score/Level(%)").closest("tr")!;
    expect(within(scoreRow).getAllByText("-").length).toBeGreaterThan(0);
  });

  it("falls back to the raw, not-yet-validated input per-field when inputsUsed is absent", () => {
    const result = labResult({ inputsUsed: undefined, riskPercent: undefined, riskCategory: undefined });
    render(
      <RiskFactorTable
        result={result}
        rawInput={{
          smokingStatus: "smoker",
          systolicBloodPressureMmHg: 150,
          // cholesterol/diabetes intentionally omitted - only those rows should show "-"
        }}
      />,
    );
    const smokingRow = screen.getByText("Smoking").closest("tr")!;
    expect(within(smokingRow).getByText("Smoker")).toHaveAttribute("title", "High");
    const sbpRow = screen.getByText("Systolic blood pressure").closest("tr")!;
    expect(within(sbpRow).getByText("150 mmHg")).toBeInTheDocument();
    const cholesterolRow = screen.getByText("Total cholesterol").closest("tr")!;
    expect(within(cholesterolRow).getAllByText("-").length).toBeGreaterThan(0);
  });

  it("marks smoker as High and non-smoker as Normal", () => {
    const { rerender } = render(<RiskFactorTable result={labResult()} />);
    const smokingRow = screen.getByText("Smoking").closest("tr")!;
    expect(within(smokingRow).getByText("Smoker")).toHaveAttribute("title", "High");

    rerender(
      <RiskFactorTable
        result={labResult({
          inputsUsed: {
            chartType: "laboratory-based",
            age: 55,
            sex: "male",
            smokingStatus: "non-smoker",
            systolicBloodPressureMmHg: 150,
            totalCholesterolMmolPerL: 6.5,
            diabetesStatus: "with",
          },
        })}
      />,
    );
    const nonSmokingRow = screen.getByText("Smoking").closest("tr")!;
    expect(within(nonSmokingRow).getByText("Non-smoker")).toHaveAttribute("title", "Normal");
  });

  it.each([
    [110, "Normal"],
    [130, "Borderline"],
    [150, "High"],
  ])("classifies SBP %i as %s", (sbp, expected) => {
    render(
      <RiskFactorTable
        result={labResult({
          inputsUsed: {
            chartType: "laboratory-based",
            age: 55,
            sex: "male",
            smokingStatus: "non-smoker",
            systolicBloodPressureMmHg: sbp,
            totalCholesterolMmolPerL: 4,
            diabetesStatus: "without",
          },
        })}
      />,
    );
    const row = screen.getByText("Systolic blood pressure").closest("tr")!;
    expect(within(row).getByText(`${sbp} mmHg`)).toHaveAttribute("title", expected);
  });

  it("converts cholesterol from mmol/L to mg/dL for its threshold classification", () => {
    // 5.2 mmol/L ~= 201 mg/dL -> Borderline (200-239)
    render(
      <RiskFactorTable
        result={labResult({
          inputsUsed: {
            chartType: "laboratory-based",
            age: 55,
            sex: "male",
            smokingStatus: "non-smoker",
            systolicBloodPressureMmHg: 110,
            totalCholesterolMmolPerL: 5.2,
            diabetesStatus: "without",
          },
        })}
      />,
    );
    const row = screen.getByText("Total cholesterol").closest("tr")!;
    expect(within(row).getByText(/201 mg\/dL/)).toHaveAttribute("title", "Borderline");
  });

  it("shows diabetes as High when present, Normal when absent", () => {
    const { rerender } = render(<RiskFactorTable result={labResult()} />);
    let row = screen.getByText("Diabetes").closest("tr")!;
    expect(within(row).getByText("Yes")).toHaveAttribute("title", "High");

    rerender(
      <RiskFactorTable
        result={labResult({
          inputsUsed: {
            chartType: "laboratory-based",
            age: 55,
            sex: "male",
            smokingStatus: "non-smoker",
            systolicBloodPressureMmHg: 110,
            totalCholesterolMmolPerL: 4,
            diabetesStatus: "without",
          },
        })}
      />,
    );
    row = screen.getByText("Diabetes").closest("tr")!;
    expect(within(row).getByText("No")).toHaveAttribute("title", "Normal");
  });

  it("shows BMI instead of cholesterol/diabetes for a non-laboratory-based result", () => {
    const result = labResult({
      chartType: "non-laboratory-based",
      inputsUsed: {
        chartType: "non-laboratory-based",
        age: 55,
        sex: "male",
        smokingStatus: "non-smoker",
        systolicBloodPressureMmHg: 110,
        bmi: 31,
      },
    });
    render(<RiskFactorTable result={result} />);
    expect(screen.queryByText("Total cholesterol")).not.toBeInTheDocument();
    expect(screen.queryByText("Diabetes")).not.toBeInTheDocument();
    const row = screen.getByText("Body mass index").closest("tr")!;
    expect(within(row).getByText(/31\.0/)).toHaveAttribute("title", "High");
  });

  it("shows age and sex as a plain summary line, not as table rows", () => {
    render(<RiskFactorTable result={labResult()} />);
    expect(screen.getByText(/Age: 55 years/)).toBeInTheDocument();
    expect(screen.getByText(/Sex: Men/)).toBeInTheDocument();
    expect(screen.queryByText("Age (years)")).not.toBeInTheDocument();
    expect(screen.queryByRole("row", { name: /Sex/ })).not.toBeInTheDocument();
  });

  it("labels the chart used - laboratory-based vs non-laboratory-based", () => {
    const { rerender } = render(<RiskFactorTable result={labResult()} />);
    expect(screen.getByText(/WHO cardiovascular disease risk - laboratory-based/)).toBeInTheDocument();

    rerender(
      <RiskFactorTable
        result={labResult({
          chartType: "non-laboratory-based",
          inputsUsed: {
            chartType: "non-laboratory-based",
            age: 55,
            sex: "female",
            smokingStatus: "non-smoker",
            systolicBloodPressureMmHg: 110,
            bmi: 28,
          },
        })}
      />,
    );
    expect(screen.getByText(/WHO cardiovascular disease risk - non-laboratory-based/)).toBeInTheDocument();
    expect(screen.getByText(/Sex: Woman/)).toBeInTheDocument();
  });

  it("colors the overall 10-year CVD risk row with the exact WHO chart legend color", () => {
    const { container } = render(<RiskFactorTable result={labResult()} />);
    const riskRow = screen.getByText("Risk Score/Level(%)").closest("tr")!;
    const badge = within(riskRow).getByText("15%", { selector: "span" });
    expect(badge.getAttribute("style")).toContain("rgb(255, 153, 51)"); // #FF9933
    void container;
  });
});
