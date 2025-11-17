# Hagrid

> **Hagrid: Combined DSS Refund Auditor + Tour Deadline Monitor for Zendesk**

Runs decision logic locally in ZAF iframe using a JSON decision grid extracted from your Backup logic.pdf. No external backend required—100% deterministic matching within Zendesk.

---

## ✨ Features

- **🎯 Local Decision Engine**: All DSS logic runs in-browser (ZAF iframe) - no VectorShift, no external API needed
- **📊 JSON Decision Grid**: Single source of truth (`dss_grid.json`) populated verbatim from your Backup logic.pdf
- **🔍 Deterministic Matching**: Keyword-based L1/L2 scenario detection with exact column mapping (C-J)
- **📈 Compliance Scoring**: Automatic severity comparison (Full refund > Partial refund > Wallet credit > No refund)
- **💼 Interactive Zendesk UI**: Clean sidebar interface with "Run Audit" and optional external validation buttons
- **🔒 Secure**: No sensitive data leaves your Zendesk instance unless you explicitly configure external API validation

---

## 📁 Repository Structure

```
zendesk-dss-refund-auditor/
├── manifest.json          # Zendesk app configuration
├── assets/
│   ├── iframe.html       # ZAF sidebar UI
│   ├── app.js            # Core decision logic
│   └── dss_grid.json     # DSS decision grid (MUST be populated from your PDF)
├── LICENSE
└── README.md            # This file
```

---

## 🚀 Quick Start

### 1. Populate the DSS Grid

**CRITICAL**: You must manually populate `assets/dss_grid.json` with your exact DSS rules from Backup logic.pdf.

The app includes sample data in dss_grid.json, but **you must replace it** with your actual rules.

#### DSS Grid Schema

Each row represents one L1/L2 scenario:

```json
[
  {
    "L1": "Cancel before start / Customer no-show",
    "L2": "Customer cancelled within policy",
    "C": "No refund - within cancellation policy",
    "D": "No refund - within cancellation policy",
    "E": "No refund - within cancellation policy",
    "F": "No refund - within cancellation policy",
    "G": "No refund - within cancellation policy",
    "H": "No refund - within cancellation policy",
    "I": "No refund - within cancellation policy",
    "J": "No refund - within cancellation policy",
    "keywords": ["cancel", "cancelled", "no-show", "within policy"]
  }
]
```

**Column Mapping**:
- `L1`: Column A from PDF (Scenario family)
- `L2`: Column B from PDF (Sub-scenario)
- `C-J`: Columns C-J from PDF (Refund actions for each Experience Type + Value Tier combination)
- `keywords`: Helper tokens for text matching (optional but recommended)

**Column Headers**:
- `C`: Partnered ≤ USD 125
- `D`: Partnered > USD 125
- `E`: Non-Partnered ≤ USD 125
- `F`: Non-Partnered > USD 125
- `G`: Social Media Partnered ≤ USD 125
- `H`: Social Media Partnered > USD 125
- `I`: Social Media Non-Partnered ≤ USD 125
- `J`: Social Media Non-Partnered > USD 125

### 2. Install the App

#### Option A: Via ZCLI (Recommended)

```bash
# Install Zendesk CLI tools
npm install -g @zendesk/zcli

# Clone this repository
git clone https://github.com/VivekDarapu/zendesk-dss-refund-auditor.git
cd zendesk-dss-refund-auditor

# Validate the app
zcli apps:validate

# Package the app
zcli apps:create

# Or run locally for testing
zcli apps:server
```

#### Option B: Manual ZIP Upload

1. Download this repository as ZIP
2. Extract and ensure all files are in place
3. **Populate `assets/dss_grid.json` with your DSS rules**
4. Re-zip the folder (ensure manifest.json is at root of ZIP)
5. Go to Zendesk Admin > Apps > Upload Private App
6. Upload the ZIP file

### 3. Configure Zendesk Field Mapping

The app expects these ticket properties:

- **Booking ID**: Extracted from ticket subject (looks for 4+ digit number) or uses ticket ID
- **Experience Type**: Read from custom field (update `app.js` line 50-60 with your field ID)
- **Value Tier**: Auto-detected from USD amounts in ticket comments/subject
- **Latest Comment**: Automatically fetched via Zendesk API

**To customize field mapping**, edit `assets/app.js` in the `gatherInputs()` function.

---

## 🎨 Using the App

### In Zendesk Ticket Sidebar

1. Open any ticket
2. The DSS Refund Auditor appears in the right sidebar
3. Click **"Run Audit (local)"** to analyze the ticket
4. View JSON output with:
   - DSS Compliance verdict (Compliant / Non-Compliant)
   - Matched L1/L2 scenario
   - Expected vs Actual refund action
   - Severity comparison
   - All audit metadata

### Output JSON Fields

```json
{
  "Booking ID": "12345",
  "Week": "2025-11-10",
  "DSS Compliance?": "Compliant",
  "Booking Value Tier": "≤ USD 125",
  "L1 Reason": "Cancel before start / Customer no-show",
  "L2 Reason": "Customer cancelled within policy",
  "DSS Grid Column Letter": "C",
  "DSS Grid Column Header": "Partnered ≤ USD 125",
  "Experience Type": "Partnered",
  "Refund Type Verdict": "No refund",
  "Ideal Refund Action": "No refund - within cancellation policy",
  "Compliance Reason": "Match",
  "DSS Severity Match": "Match",
  "Confidence": "High"
}
```

---

## ⚙️ Configuration

### Manifest Settings

Edit `manifest.json` to customize:

- App name & author
- Version number
- Permissions (requires `read:tickets`, `read:ticket_fields`, `request` for API calls)
- Optional external API parameters

### Optional External Validation

The app includes a placeholder for external API validation (e.g., final review by an LLM).

To enable:

1. Add API URL and key in Zendesk app settings
2. Click **"Run & Send (optional)"** button instead of "Run Audit"
3. The app sends the local audit result to your external endpoint for secondary review

⚠️ **Warning**: Storing API keys in the client is insecure. For production, route through a secure backend.

---

## 🔧 Development

### File Descriptions

#### `manifest.json`
Zendesk app configuration:
- Location: `ticket_sidebar`
- Framework: ZAF v2.0
- Permissions: Read tickets, custom fields, make API requests

#### `assets/iframe.html`
UI layout:
- ZAF SDK initialization
- Two buttons: "Run Audit (local)" and "Run & Send (optional)"
- Output display (JSON formatted)
- Status indicator

#### `assets/app.js`
Core logic:
- `loadGrid()`: Fetches dss_grid.json
- `gatherInputs()`: Reads ticket data via ZAF client
- `detectValueTier()`: Extracts USD amounts and categorizes
- `findBestMatch()`: Keyword + substring matching against DSS grid
- `chooseColumnLetter()`: Maps Experience Type + Value Tier → Column C-J
- `severityRank()`: Ranks refund actions by severity
- `buildOutputJSON()`: Assembles final audit result
- `runAudit()`: Orchestrates the audit workflow

#### `assets/dss_grid.json`
Decision grid:
- **Must be populated from your Backup logic.pdf**
- Each object = one L1/L2 scenario
- Columns C-J contain exact refund action text from PDF
- Keywords help with automatic matching

### Testing Locally

```bash
# Run the app server
zcli apps:server

# Open in browser
# https://yoursubdomain.zendesk.com/agent/tickets/123?zat=true
```

---

## 📝 Important Notes

### DSS Grid Population

**YOU MUST** extract your DSS table from Backup logic.pdf and populate `assets/dss_grid.json`:

1. Open the PDF
2. For each L1/L2 row, copy the text from columns A, B, C-J **exactly as written**
3. Add to dss_grid.json following the schema above
4. Add 2-6 keywords per row for text matching
5. Test with real tickets to ensure matches work

### Experience Type Field

The app tries to auto-detect the Experience Type field, but you may need to configure the exact field ID in `app.js`:

```javascript
// Line ~55 in app.js
const fallback = getFieldValue('YOUR_FIELD_ID_HERE');
```

Find your field ID:
1. Go to Zendesk Admin > Ticket Fields
2. Click on your "Experience Type" field
3. Note the ID in the URL (e.g., `360001234567`)
4. Update app.js with that ID

### Severity Matching Logic

The app ranks refund actions from most to least severe:
1. Full refund (original method)
2. Partial refund
3. Full wallet credit
4. Partial wallet credit
5. No refund

Compliance:
- **Compliant**: Match or less severe (under-refunded)
- **Non-Compliant**: More severe (over-refunded) or wrong DSS rule applied

---

## 🛠 Troubleshooting

### "Failed to load dss_grid.json"

- Ensure `assets/dss_grid.json` exists in your ZIP
- Check manifest.json includes dss_grid.json in assets
- Verify JSON is valid (use jsonlint.com)

### "No match found" / Always shows "Unknown"

- Check keywords in dss_grid.json
- Keywords should match terms that appear in ticket comments
- Add more keywords or L1/L2 text variations

### Experience Type shows "Unknown"

- Configure the correct custom field ID in app.js
- Ensure the field is populated on tickets
- Check field name/type matches expectations

### App doesn't appear in sidebar

- Check manifest.json location is `support.ticket_sidebar`
- Verify app is installed and activated
- Try refreshing the Zendesk page

---

## 🤝 Contributing

This is a template app. To customize:

1. Fork this repository
2. Modify for your specific DSS rules and field structure
3. Update dss_grid.json with your complete decision table
4. Test thoroughly with real tickets
5. Deploy to your Zendesk instance

---

## 📄 License

MIT License - see LICENSE file for details

---

## 🆘 Support

For issues specific to this template:
- Open a GitHub issue in this repository

For Zendesk app development help:
- [Zendesk Apps Framework Documentation](https://developer.zendesk.com/apps/docs/developer-guide/getting_started)
- [ZAF SDK Reference](https://developer.zendesk.com/apps/docs/developer-guide/using_sdk)

---

## 🎯 Roadmap

- [ ] Add bulk audit mode (process multiple tickets)
- [ ] Export audit results to CSV/Google Sheets
- [ ] Visual DSS grid editor (no-code rule management)
- [ ] Real-time field suggestions as you type
- [ ] Integration with Slack for compliance alerts

---

**Built with ❤️ for refund compliance teams**
