# End-User Guide

`CVD-Risk-Assessment-User-Guide.pdf` is a non-technical, screenshot-illustrated guide for
clinical staff using the CVD Risk panel inside the Capture App's Out Patient Service form.

- Screenshots (`images/`) were captured live against the EHMIS Tokha instance
  (`erecord.hmis.gov.np/tokha`), using a demo patient record. No data shown was saved — all
  example values were entered and then discarded without clicking Save/Complete.
- The patient's name and demographic/contact details were redacted (blacked out) from every
  screenshot before publishing, since this repository is public. Only the CVD Risk panel and
  surrounding UI chrome are shown.
- Source: `guide.html` (plain HTML/CSS, A4 print layout).

## Regenerating the PDF

```bash
cd docs/user-guide
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --headless --disable-gpu --no-sandbox \
  --print-to-pdf="CVD-Risk-Assessment-User-Guide.pdf" \
  --no-pdf-header-footer \
  "file://$(pwd)/guide.html"
```

Update `guide.html` (and/or replace the screenshots in `images/`) first, then re-run the
command above.
