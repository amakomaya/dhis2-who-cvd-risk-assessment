# Clinical Validation Report

**Status: NOT clinically validated. Do not use for patient care until a responsible clinical reviewer signs off (see "Sign-off" below).**

## 1. Source of truth

- Document: WHO cardiovascular disease risk charts, **South Asia** region (Bangladesh, Bhutan, India, Nepal, Pakistan).
- Stored at: `reference/who-2019-south-asia-lab-chart.pdf` (as supplied for this project; `south-asia_Nepal.pdf`).
- Nepal is explicitly listed as a covered country in the chart's region definition, confirming this is the correct WHO regional chart for this deployment.
- Two chart types are implemented, both from this same source document:
  - **Laboratory-based** (page 1): uses total cholesterol. The primary pathway.
  - **Non-laboratory-based / BMI-based** (page 2): uses body mass index instead of cholesterol. WHO's own documented fallback for when a cholesterol measurement is unavailable — this app uses it automatically when total cholesterol is not entered but height and weight are, per the deployment's explicit instruction to fall back to BMI rather than leave the assessment unavailable.

## 2. Extraction method (how the chart cells got into the codebase)

Chart values were **not manually transcribed** for either chart. Both were extracted programmatically to avoid transcription error, using two independent passes:

1. **Laboratory-based chart (1,400 cells)**: `reference/build_chart.py` parses word-level coordinates extracted from page 1 with `pdfplumber`, clusters them into the chart's 35 data rows (7 age bands × 5 SBP bands), and expands each row into 40 individual cells (2 diabetes states × 2 sexes × 2 smoking states × 5 cholesterol bands), producing `reference/extracted-chart-data.json` (copied into the app as `src/domain/cvd-risk/who2019SouthAsiaLabChart.data.json`). The PDF's own text layer (read independently via a second tool) was compared token-for-token against the pdfplumber coordinate extraction for the same 35 rows — both agreed exactly.
2. **Non-laboratory-based chart (700 cells)**: `reference/build_nonlab_chart.py` applies the identical method to page 2's 35 data rows, expanding each into 20 cells (2 sexes × 2 smoking states × 5 BMI bands — this chart has no diabetes split), producing `src/domain/cvd-risk/who2019SouthAsiaNonLabChart.data.json`.

## 3. Automated integrity checks

### Laboratory-based chart
Run as part of `reference/build_chart.py` and pinned in `src/domain/cvd-risk/__tests__/who2019LaboratoryChart.test.ts`:

- **Cell count**: exactly 1,400 cells (7 age bands × 5 SBP bands × 2 diabetes states × 2 sexes × 2 smoking states × 5 cholesterol bands). Verified.
- **Monotonicity**: for every fixed combination of the other five dimensions, risk percent is non-decreasing as age increases, as SBP increases, and as total cholesterol increases. Checked across all 760 such groups — **zero violations**.
- **Smoker ≥ non-smoker**: zero violations across all combinations.
- **With-diabetes ≥ without-diabetes**: zero violations across all combinations.
- **Spot checks**: five specific cells (chart corners and a representative diabetes/smoker combination) checked by eye against the rendered chart image; all matched.

### Non-laboratory-based (BMI) chart
Run as part of `reference/build_nonlab_chart.py` and pinned in `src/domain/cvd-risk/__tests__/who2019NonLabChart.test.ts`:

- **Cell count**: exactly 700 cells (7 age bands × 5 SBP bands × 2 sexes × 2 smoking states × 5 BMI bands). Verified.
- **Monotonicity**: non-decreasing as age, SBP, and BMI increase. Checked across all 380 groups — **zero violations**.
- **Smoker ≥ non-smoker**: zero violations across all combinations.
- **Spot checks**: five cells (chart corners plus a representative case) checked by eye; all matched.

## 4. Reference test cases (pinned in code)

**Laboratory-based** (`who2019LaboratoryChart.test.ts`):

| Age band | SBP | Diabetes | Sex | Smoking | Total cholesterol | Expected risk |
|---|---|---|---|---|---|---|
| 70-74 | ≥180 | without | male | non-smoker | <4 | 22% |
| 70-74 | ≥180 | without | male | non-smoker | ≥7 | 33% |
| 70-74 | ≥180 | with | female | smoker | ≥7 | 44% |
| 40-44 | <120 | without | female | non-smoker | <4 | 1% |
| 40-44 | <120 | with | male | smoker | ≥7 | 12% |

**Non-laboratory-based** (`who2019NonLabChart.test.ts`):

| Age band | SBP | Sex | Smoking | BMI | Expected risk |
|---|---|---|---|---|---|
| 70-74 | ≥180 | male | non-smoker | <20 | 24% |
| 70-74 | ≥180 | male | non-smoker | ≥35 | 32% |
| 70-74 | ≥180 | female | smoker | ≥35 | 33% |
| 40-44 | <120 | female | non-smoker | <20 | 1% |
| 40-44 | <120 | male | smoker | ≥35 | 6% |

These are each chart's extreme corners plus one mid-range combination, chosen because they are easiest to verify by eye against the rendered chart image.

## 5. Chart selection logic (which chart is used for a given assessment)

Implemented in `src/domain/cvd-risk/validateInputs.ts` and `calculateRisk.ts`:

1. If total cholesterol is provided, the **laboratory-based** chart is used (and diabetes status is required, since that chart has separate with/without-diabetes panels).
2. If total cholesterol is **not** provided but height and weight are, the **non-laboratory-based (BMI)** chart is used instead. Diabetes status is not required for this pathway, since the BMI chart has no diabetes split.
3. If neither cholesterol nor height+weight are available, the assessment returns `status: "unavailable"` rather than guessing.

`CvdRiskResult.chartType` and `chartVersion` always record which chart actually produced a given result, for provenance.

## 6. Known limitations and discrepancies

- **Diabetes status was not in the original requirements document's "required input dimensions" list** (age, sex, smoking, SBP, total cholesterol only), but the actual WHO laboratory-based chart requires it to select the correct panel. This implementation treats diabetes status as a required input on the laboratory-based pathway only, matching the official chart, per explicit user confirmation during development.
- The chart only covers ages 40-74 natively; ages 75-79 reuse the oldest band per WHO's own published guidance, and ages below 40/above 79 are handled by a separate deployment-specific age-eligibility policy (`src/domain/cvd-risk/ageEligibilityPolicy.ts`) — see that module's docstring and `docs/dhis2-integration.md` for the exact rule, which did **not** come from WHO and needs explicit clinical review.
- Height/weight-derived BMI uses the standard formula (kg/m²) with plausibility bounds (100-250cm, 20-300kg) but no population-specific adjustment.
- No clinical reviewer has yet signed off on this implementation (see below).

## 7. Sign-off

| Role | Name | Date | Outcome |
|---|---|---|---|
| Responsible clinical reviewer | _pending_ | _pending_ | _pending_ |

**This application must not be presented as clinically validated, and `application.enabled` in the DataStore configuration must remain `false`, until this table is completed by a qualified reviewer with authority over clinical content for this deployment — including explicit sign-off on the age-eligibility policy described above, which is a deployment business rule rather than WHO methodology.** (`application.enabled` is the field the app actually enforces — see `docs/CONFIGURATION.md`.)
