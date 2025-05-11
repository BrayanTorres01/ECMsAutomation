# eCMS Timecard Saver (Auto OK Only)

Author: Brayan Torres  
Repository: [ECMsAutomation](https://github.com/BrayanTorres01/ECMsAutomation)

## Description

This Tampermonkey userscript streamlines data entry on the eCMS Payroll timecard interface. It allows you to:

- Save all timecard row data (input and select values)
- Paste previously saved data into all rows
- Automatically click the "OK" button after saving

This version does not include any Control-key or conditional logic — it simply saves, pastes, and submits.

## How to Install

### 1. Install Tampermonkey

If you haven’t already, install the Tampermonkey browser extension:

- [Tampermonkey for Chrome](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
- [Tampermonkey for Firefox](https://addons.mozilla.org/en-US/firefox/addon/tampermonkey/)

### 2. Install the Script

1. Open the Tampermonkey dashboard.
2. Click the **"Utilities"** tab.
3. Under **"Install from URL"**, paste this link:
https://raw.githubusercontent.com/BrayanTorres01/ECMsAutomation/main/ecms-timecard-saver.user.js

4. Click **Install**.

### 3. Use the Script

Once installed, go to the eCMS Payroll site:

You will see a small toolbar at the top-right of the page with two buttons:
- **Save Timecard** – Saves all row values and automatically clicks "OK"
- **Paste All Timecard Rows** – Fills the table with previously saved data

## Technical Notes

- **Match URL**: `https://cvcholdings.ecmserp.com/ecms/*`
- **Storage**: Data is saved using `localStorage` in your browser
- **Compatibility**: Works only on the timecard page where the form ID is `form1:subfile`
- **Version**: 6.3

## Limitations

- This script does not synchronize across browsers or machines.
- Only use on supported pages within eCMS.
- Always verify your data before final submission.

## License

This project is for personal and internal use only. No warranties provided.

---

Brayan Torres  
GitHub: [@BrayanTorres01](https://github.com/BrayanTorres01)


