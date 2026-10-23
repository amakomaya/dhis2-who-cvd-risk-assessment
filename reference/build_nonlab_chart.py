"""
Builds a structured JSON lookup table from the WHO 2019 South Asia
non-laboratory-based (BMI) CVD risk chart (page 2 of
reference/who-2019-south-asia-lab-chart.pdf), using word rows extracted via
pdfplumber (page2_words.json). Mirrors build_chart.py's method for the
laboratory-based chart: programmatic extraction, not manual transcription.
Called directly: `python3 build_nonlab_chart.py`.
"""
import json

words = json.load(open("page2_words.json"))

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
BMI_BANDS = ["<20", "20-24", "25-29", "30-35", "≥35"]
SEXES = ["male", "female"]
SMOKING = ["non-smoker", "smoker"]

table = []
row_idx = 0
for age in AGE_BANDS:
    for sbp in SBP_BANDS:
        r = data_rows[row_idx]
        row_idx += 1
        texts = [w["text"] for w in r["words"]]
        texts = [t for t in texts if t != age]
        assert len(texts) == 21, (age, sbp, texts)
        nums = texts[0:20]
        label = texts[20]
        assert label == sbp, (age, sbp, label)

        idx = 0
        for sex in SEXES:
            for smoke in SMOKING:
                for bmi in BMI_BANDS:
                    val = int(nums[idx])
                    idx += 1
                    table.append({
                        "ageBand": age,
                        "sbpBand": sbp,
                        "sex": sex,
                        "smoking": smoke,
                        "bmiBand": bmi,
                        "riskPercent": val,
                    })

print("total cells:", len(table))
assert len(table) == 700  # 7 age bands x 5 SBP bands x 2 sexes x 2 smoking states x 5 BMI bands

with open("out/who_south_asia_nonlab_chart.json", "w") as f:
    json.dump(table, f, indent=1)

spot = [
    (dict(ageBand="70-74", sbpBand="≥180", sex="male", smoking="non-smoker", bmiBand="<20"), 24),
    (dict(ageBand="70-74", sbpBand="≥180", sex="male", smoking="non-smoker", bmiBand="≥35"), 32),
    (dict(ageBand="70-74", sbpBand="≥180", sex="female", smoking="smoker", bmiBand="≥35"), 33),
    (dict(ageBand="40-44", sbpBand="<120", sex="female", smoking="non-smoker", bmiBand="<20"), 1),
    (dict(ageBand="40-44", sbpBand="<120", sex="male", smoking="smoker", bmiBand="≥35"), 6),
]
for crit, expected in spot:
    matches = [row for row in table if all(row[k] == v for k, v in crit.items())]
    assert len(matches) == 1, (crit, matches)
    assert matches[0]["riskPercent"] == expected, (crit, matches[0], expected)
print("spot checks passed")
