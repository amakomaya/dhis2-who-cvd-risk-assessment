/**
 * Minimal, color-coded breakdown of each clinical factor that fed into the
 * risk score, plus the overall score itself. Thresholds for the individual
 * factor colors (smoking/SBP/cholesterol/diabetes/BMI) are standard
 * clinical traffic-light conventions, independent of the WHO chart lookup
 * itself — they're a display aid, not part of calculateCvdRisk's logic.
 * The "10 years CVD Risk" row reuses the WHO chart's own legend colors.
 * The table always renders (it tells the user what's missing, rather than
 * disappearing). calculateCvdRisk's validation is all-or-nothing (one bad
 * field drops `inputsUsed` entirely), so each factor also falls back to the
 * raw, not-yet-validated `rawInput` when `inputsUsed` is absent — that way
 * one missing/invalid field only blanks its own row ("-") instead of every
 * row going blank. The overall risk score itself still requires full,
 * validated inputs and can't be partially computed.
 */
import { Card } from "@dhis2/ui";
import { computeBmi } from "../utils/bmi";
import type { CvdRiskRawInput, CvdRiskResult, RiskCategory } from "../domain/cvd-risk/types";

type Level = "red" | "yellow" | "green" | "neutral";

const LEVEL_STYLE: Record<Level, { background: string; color: string }> = {
  green: { background: "#4CAF50", color: "#FFFFFF" },
  yellow: { background: "#FFC107", color: "#1A1A1A" },
  red: { background: "#E53935", color: "#FFFFFF" },
  neutral: { background: "#E0E0E0", color: "#666666" },
};

const RISK_SCORE_COLOR: Record<RiskCategory, string> = {
  "under-5": "#99CC00",
  "5-to-under-10": "#FFFF00",
  "10-to-under-20": "#FF9933",
  "20-to-under-30": "#CC0000",
  "30-or-more": "#990033",
};
const RISK_SCORE_TEXT: Record<RiskCategory, string> = {
  "under-5": "#1A1A1A",
  "5-to-under-10": "#1A1A1A",
  "10-to-under-20": "#1A1A1A",
  "20-to-under-30": "#FFFFFF",
  "30-or-more": "#FFFFFF",
};

function classifySbp(sbp: number): Level {
  if (sbp < 120) return "green";
  if (sbp < 140) return "yellow";
  return "red";
}

/** Thresholds are the standard mg/dL cut points (200, 240); input is converted from mmol/L. */
function classifyCholesterolMgDl(mgDl: number): Level {
  if (mgDl < 200) return "green";
  if (mgDl <= 239) return "yellow";
  return "red";
}

function classifyBmi(bmi: number): Level {
  if (bmi < 25) return "green";
  if (bmi < 30) return "yellow";
  return "red";
}

interface Row {
  key: string;
  label: string;
  value: string;
  level: Level;
}

const CHART_TYPE_LABEL: Record<CvdRiskResult["chartType"], string> = {
  "laboratory-based": "WHO cardiovascular disease risk - laboratory-based",
  "non-laboratory-based": "WHO cardiovascular disease risk - non-laboratory-based",
};

function badgeStyle(level: Level): React.CSSProperties {
  const { background, color } = LEVEL_STYLE[level];
  return {
    display: "inline-block",
    padding: "2px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 600,
    background,
    color,
  };
}

function badgeText(level: Level): string {
  if (level === "green") return "Normal";
  if (level === "yellow") return "Borderline";
  if (level === "red") return "High";
  return "-";
}

/** Lenient numeric parse for the not-yet-validated raw input fallback. */
function toDisplayNumber(value: number | string | undefined): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

export interface RiskFactorTableProps {
  result: CvdRiskResult;
  /**
   * The not-yet-validated raw input, used to show individual factor values
   * even when overall validation failed (so one bad/missing field doesn't
   * blank every row — see the module docstring).
   */
  rawInput?: CvdRiskRawInput;
}

export function RiskFactorTable({ result, rawInput }: RiskFactorTableProps) {
  const input = result.inputsUsed;

  const age = input?.age ?? toDisplayNumber(rawInput?.age);
  const sex = input?.sex ?? (rawInput?.sex === "male" || rawInput?.sex === "female" ? rawInput.sex : undefined);

  const smokingStatus =
    input?.smokingStatus ??
    (rawInput?.smokingStatus === "smoker" || rawInput?.smokingStatus === "non-smoker"
      ? rawInput.smokingStatus
      : undefined);

  const sbp = input?.systolicBloodPressureMmHg ?? toDisplayNumber(rawInput?.systolicBloodPressureMmHg);

  const ageLabel = age === undefined ? "-" : `${age} years`;
  const sexLabel = sex === undefined ? "-" : sex === "male" ? "Men" : "Woman";

  const rows: Row[] = [
    {
      key: "smoking",
      label: "Smoking",
      value: smokingStatus === undefined ? "-" : smokingStatus === "smoker" ? "Smoker" : "Non-smoker",
      level: smokingStatus === undefined ? "neutral" : smokingStatus === "smoker" ? "red" : "green",
    },
    {
      key: "sbp",
      label: "Systolic blood pressure",
      value: sbp === undefined ? "-" : `${sbp} mmHg`,
      level: sbp === undefined ? "neutral" : classifySbp(sbp),
    },
  ];

  if (result.chartType === "laboratory-based") {
    let mgDl: number | undefined;
    if (input?.chartType === "laboratory-based") {
      mgDl = input.totalCholesterolMmolPerL * 38.67;
    } else {
      const rawTc = toDisplayNumber(rawInput?.totalCholesterol);
      if (rawTc !== undefined) {
        mgDl = rawInput?.totalCholesterolUnit === "mg/dL" ? rawTc : rawTc * 38.67;
      }
    }
    rows.push({
      key: "cholesterol",
      label: "Total cholesterol",
      value: mgDl === undefined ? "-" : `${mgDl.toFixed(0)} mg/dL`,
      level: mgDl === undefined ? "neutral" : classifyCholesterolMgDl(mgDl),
    });

    const diabetesStatus =
      (input?.chartType === "laboratory-based" ? input.diabetesStatus : undefined) ??
      (rawInput?.diabetesStatus === "with" || rawInput?.diabetesStatus === "without"
        ? rawInput.diabetesStatus
        : undefined);
    rows.push({
      key: "diabetes",
      label: "Diabetes",
      value: diabetesStatus === undefined ? "-" : diabetesStatus === "with" ? "Yes" : "No",
      level: diabetesStatus === undefined ? "neutral" : diabetesStatus === "with" ? "red" : "green",
    });
  } else {
    let bmi: number | undefined;
    if (input?.chartType === "non-laboratory-based") {
      bmi = input.bmi;
    } else {
      const heightCm = toDisplayNumber(rawInput?.heightCm);
      const weightKg = toDisplayNumber(rawInput?.weightKg);
      if (heightCm !== undefined && weightKg !== undefined) {
        bmi = computeBmi(heightCm, weightKg) ?? undefined;
      }
    }
    rows.push({
      key: "bmi",
      label: "Body mass index",
      value: bmi === undefined ? "-" : `${bmi.toFixed(1)} kg/m²`,
      level: bmi === undefined ? "neutral" : classifyBmi(bmi),
    });
  }

  const category = result.riskCategory;
  const scoreValue = result.riskPercent === undefined ? "-" : `${result.riskPercent}%`;

  return (
    <Card>
      <div style={{ padding: 16 }}>
        <h3 style={{ margin: "0 0 2px", fontSize: 14, color: "#14274E" }}>10 years CVD Risk</h3>
        <p style={{ margin: "0 0 2px", fontSize: 11, color: "#888" }}>{CHART_TYPE_LABEL[result.chartType]}</p>
        <p style={{ margin: "0 0 8px", fontSize: 12, color: "#333" }}>
          Age: {ageLabel} &nbsp;·&nbsp; Sex: {sexLabel}
        </p>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "4px 8px", color: "#666", fontWeight: 600 }}>
                Factor
              </th>
              <th style={{ textAlign: "left", padding: "4px 8px", color: "#666", fontWeight: 600 }}>
                Value
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} style={{ borderTop: "1px solid #EEE" }}>
                <td style={{ padding: "6px 8px" }}>{row.label}</td>
                <td style={{ padding: "6px 8px" }}>
                  <span style={badgeStyle(row.level)} title={badgeText(row.level)}>
                    {row.value}
                  </span>
                </td>
              </tr>
            ))}
            <tr style={{ borderTop: "2px solid #DDD" }}>
              <td style={{ padding: "6px 8px", fontWeight: 600 }}>Risk Score/Level(%)</td>
              <td style={{ padding: "6px 8px", fontWeight: 600 }}>
                <span
                  style={{
                    display: "inline-block",
                    padding: "2px 10px",
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 700,
                    background: category === undefined ? LEVEL_STYLE.neutral.background : RISK_SCORE_COLOR[category],
                    color: category === undefined ? LEVEL_STYLE.neutral.color : RISK_SCORE_TEXT[category],
                  }}
                >
                  {scoreValue}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}
