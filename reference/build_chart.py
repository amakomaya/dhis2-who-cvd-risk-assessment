"""
Builds a structured JSON lookup table from the WHO 2019 South Asia
laboratory-based CVD risk chart (south-asia_Nepal.pdf, page 1), using
word rows extracted directly from the PDF via pdfplumber (page1_words.json).

Purpose: produce domain/cvd-risk reference data for the DHIS2 CVD risk app
(/Users/rcpoudel/Code/amakomaya-cvd-risk) without manual transcription.
Called directly: `python3 build_chart.py`. No other file imports it.
"""
import json

words = json.load(open("page1_words.json"))

rows = []
for w in sorted(words, key=lambda w: w["top"]):
    placed = False
    for r in rows:
        if abs(r["top"] - w["top"]) <= 2.5:
            r["words"].append(w)
            placed = True
            break
    if not placed:
        rows.append({"top": w["top"], "words": [w]})
for r in rows:
    r["words"].sort(key=lambda w: w["x0"])

data_rows = [r for r in rows if 75 <= r["top"] <= 505]
assert len(data_rows) == 35, len(data_rows)

AGE_BANDS = ["70-74", "65-69", "60-64", "55-59", "50-54", "45-49", "40-44"]
SBP_BANDS = ["≥180", "160-179", "140-159", "120-139", "<120"]
TC_BANDS = ["<4", "4-4.9", "5-5.9", "6-6.9", "≥7"]
SEXES = ["male", "female"]
SMOKING = ["non-smoker", "smoker"]
DIABETES = ["without", "with"]

assert len(data_rows) == len(AGE_BANDS) * len(SBP_BANDS)

table = []
row_idx = 0
for age in AGE_BANDS:
    for sbp in SBP_BANDS:
        r = data_rows[row_idx]
        row_idx += 1
        texts = [w["text"] for w in r["words"]]
        texts = [t for t in texts if t != age]
        assert len(texts) == 42, (age, sbp, texts)
        nums = texts[0:20]
        label1 = texts[20]
        nums2 = texts[21:41]
        label2 = texts[41]
        assert label1 == sbp, (age, sbp, label1)
        assert label2 == sbp, (age, sbp, label2)

        def expand(nums20, diabetes):
            assert len(nums20) == 20
            idx = 0
            for sex in SEXES:
                for smoke in SMOKING:
                    for tc in TC_BANDS:
                        val = int(nums20[idx])
                        idx += 1
                        table.append({
                            "ageBand": age,
                            "sbpBand": sbp,
                            "diabetes": diabetes,
                            "sex": sex,
                            "smoking": smoke,
                            "totalCholesterolBand": tc,
                            "riskPercent": val,
                        })

        expand(nums, "without")
        expand(nums2, "with")

print("total cells:", len(table))
assert len(table) == 7 * 5 * 2 * 2 * 2 * 5  # 1400

with open("out/who_south_asia_lab_chart.json", "w") as f:
    json.dump(table, f, indent=1)

spot = [
    (dict(ageBand="70-74", sbpBand="≥180", diabetes="without", sex="male", smoking="non-smoker", totalCholesterolBand="<4"), 22),
    (dict(ageBand="70-74", sbpBand="≥180", diabetes="without", sex="male", smoking="non-smoker", totalCholesterolBand="≥7"), 33),
    (dict(ageBand="70-74", sbpBand="≥180", diabetes="with", sex="female", smoking="smoker", totalCholesterolBand="≥7"), 44),
    (dict(ageBand="40-44", sbpBand="<120", diabetes="without", sex="female", smoking="non-smoker", totalCholesterolBand="<4"), 1),
    (dict(ageBand="40-44", sbpBand="<120", diabetes="with", sex="male", smoking="smoker", totalCholesterolBand="≥7"), 12),
]
for crit, expected in spot:
    matches = [row for row in table if all(row[k] == v for k, v in crit.items())]
    assert len(matches) == 1, (crit, matches)
    assert matches[0]["riskPercent"] == expected, (crit, matches[0], expected)
print("spot checks passed")
