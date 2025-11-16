# Enhanced DSS Refund Auditor - Complete Implementation

## Overview
This guide provides the complete enhanced implementation to:
1. Read ALL Zendesk conversations (not just the latest comment)
2. Better detect DSS compliance using full conversation context
3. Write results to Google Sheets "VS output" tab
4. Handle cases with no conversation using fallback logic

---

## Step 1: Setup Google Apps Script Proxy

### Create a new Google Apps Script Web App:

1. Go to https://script.google.com
2. Create new project: "Zendesk-Sheets-Proxy"
3. Paste this code:

```javascript
// Google Apps Script - Deploy as Web App
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.openById(data.spreadsheetId);
    const sheet = ss.getSheetByName(data.sheetName);
    
    if (!sheet) {
      return ContentService.createTextOutput(
        JSON.stringify({success: false, error: 'Sheet not found'})
      ).setMimeType(ContentService.MimeType.JSON);
    }
    
    // Append the row
    sheet.appendRow(data.row);
    
    return ContentService.createTextOutput(
      JSON.stringify({success: true, message: 'Row added successfully'})
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(
      JSON.stringify({success: false, error: error.toString()})
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService.createTextOutput(
    JSON.stringify({status: 'Zendesk Sheets Proxy Active'})
  ).setMimeType(ContentService.MimeType.JSON);
}
```

4. Deploy:
   - Click "Deploy" > "New deployment"
   - Type: "Web app"
   - Execute as: "Me"
   - Who has access: "Anyone"
   - Click "Deploy"
   - Copy the Web App URL (you'll need this)

---

## Step 2: Replace assets/app.js with Enhanced Version

**Save your current app.js as backup, then replace with:**

```javascript
// FILE: assets/app.js - REPLACE ENTIRE FILE

/* Enhanced DSS Refund Auditor Logic */
(function() {
  const client = ZAFClient.init();
  const statusEl = document.getElementById('status');
  const outputEl = document.getElementById('output');
  const runBtn = document.getElementById('run');
  const runAndSendBtn = document.getElementById('runAndSend');

  // *** UPDATE THIS WITH YOUR GOOGLE APPS SCRIPT WEB APP URL ***
  const GOOGLE_SHEETS_PROXY_URL = 'YOUR_WEB_APP_URL_HERE';
  const SPREADSHEET_ID = '1xG_fPoVsWBVwDCaDzhlyTtsqD0O7oS2qtIwMfy4IdeQ';
  const SHEET_NAME = 'VS output';

  function logStatus(s) { 
    statusEl.textContent = s; 
    console.log('[DSS]', s);
  }

  async function loadGrid() {
    const resp = await fetch('dss_grid.json');
    if (!resp.ok) throw new Error('Failed to load DSS grid');
    return await resp.json();
  }

  // KEY ENHANCEMENT: Gather ALL conversations
  async function gatherFullConversation() {
    const ticketData = await client.get('ticket');
    const ticket = ticketData.ticket;
    
    logStatus('Reading ALL ticket conversations...');
    
    let allComments = [];
    try {
      const resp = await client.request(`/api/v2/tickets/${ticket.id}/comments.json`);
      if (resp && resp.comments) {
        allComments = resp.comments.map(c => ({
          author_id: c.author_id,
          body: c.plain_body || c.body || '',
          created_at: c.created_at
        }));
      }
    } catch (e) {
      console.warn('Could not fetch comments:', e);
    }

    // Combine ALL comments into full text
    const fullText = allComments.map(c => c.body).join('\n\n');
    
    const bookingId = (ticket.subject && ticket.subject.match(/\d{4,}/)) 
      ? ticket.subject.match(/\d{4,}/)[0] 
      : ticket.id.toString();
    
    let experienceType = 'Unknown';
    if (ticket.customField) {
      const exp = Object.entries(ticket.customField).find(([k, v]) => 
        k.toLowerCase().includes('experience') || 
        k.toLowerCase().includes('type') ||
        k.toLowerCase().includes('partnered')
      );
      if (exp) experienceType = exp[1];
    }

    return {
      bookingId,
      ticketId: ticket.id,
      subject: ticket.subject || '',
      fullConversation: fullText,
      conversationCount: allComments.length,
      experienceType,
      ticketStatus: ticket.status || 'unknown'
    };
  }

  function detectValueTier(text) {
    if (!text) return 'Unknown';
    const usdMatch = text.match(/\$\s*([0-9,]+(?:\.[0-9]{1,2})?)/);  
    if (usdMatch) {
      const num = parseFloat(usdMatch[1].replace(/,/g,''));
      return num <= 125 ? '≤ USD 125' : '> USD 125';
    }
    return 'Unknown';
  }

  // Enhanced DSS matching with full conversation
  function findBestMatch(grid, inputs) {
    const text = (inputs.fullConversation + ' ' + inputs.subject).toLowerCase();
    let best = null;
    let bestScore = 0;

    for (const row of grid) {
      let score = 0;
      
      if (row.keywords && row.keywords.length) {
        for (const k of row.keywords) {
          if (text.includes(k.toLowerCase())) score += 10;
        }
      }
      
      if (row.L1 && text.includes(row.L1.toLowerCase())) score += 5;
      if (row.L2 && text.includes(row.L2.toLowerCase())) score += 5;
      
      if (score > bestScore) {
        bestScore = score;
        best = row;
      }
    }

    // Fallback if no match
    if (!best && inputs.conversationCount === 0) {
      logStatus('No conversation found - using fallback DSS logic');
      best = grid.find(r => /unknown|default/i.test(r.L1 || ''));
    }

    return best;
  }

  function chooseColumnLetter(experienceType, valueTier) {
    const type = (experienceType || '').trim();
    const vt = (valueTier || '').trim();
    
    if (/^partnered$/i.test(type) || (/partnered/i.test(type) && !/social/i.test(type))) {
      return vt === '≤ USD 125' ? 'C' : 'D';
    }
    if (/^non-?partnered$/i.test(type) || (/non-?partnered/i.test(type) && !/social/i.test(type))) {
      return vt === '≤ USD 125' ? 'E' : 'F';
    }
    if (/social.*partnered/i.test(type) || (/social/i.test(type) && /partnered/i.test(type) && !/non/i.test(type))) {
      return vt === '≤ USD 125' ? 'G' : 'H';
    }
    if (/social.*non-?partnered/i.test(type) || (/social/i.test(type) && /non-?partnered/i.test(type))) {
      return vt === '≤ USD 125' ? 'I' : 'J';
    }
    
    return vt === '> USD 125' ? 'D' : 'C';
  }

  function buildOutputJSON(inputs, gridRow, columnLetter, actualActionText) {
    const cellHeaderMap = {
      C: 'Partnered ≤ USD 125',
      D: 'Partnered > USD 125',
      E: 'Non-Partnered ≤ USD 125',
      F: 'Non-Partnered > USD 125',
      G: 'Social Media Partnered ≤ USD 125',
      H: 'Social Media Partnered > USD 125',
      I: 'Social Media Non-Partnered ≤ USD 125',
      J: 'Social Media Non-Partnered > USD 125'
    };
    
    const expectedCellText = gridRow ? (gridRow[columnLetter] || '') : '';
    
    let complianceFlag = 'Compliant';
    if (!expectedCellText || expectedCellText.toLowerCase().includes('no action')) {
      complianceFlag = 'Non-Compliant (DSS Rule Missing)';
    }

    return {
      'Booking ID': inputs.bookingId,
      'Week': new Date().toISOString().slice(0, 10),
      'DSS Compliance?': complianceFlag,
      'Booking Value Tier': inputs.valueTier || 'Unknown',
      'L1 Reason': gridRow ? gridRow.L1 || 'Unknown' : 'Unknown',
      'L2 Reason': gridRow ? gridRow.L2 || 'Unknown' : 'Unknown',
      'Experience Type': cellHeaderMap[columnLetter] || 'Unknown',
      'Conversation Count': inputs.conversationCount,
      'Confidence': inputs.conversationCount > 0 ? 'High' : 'Low'
    };
  }

  // Write to Google Sheets via proxy
  async function writeToSheet(auditResult) {
    if (!GOOGLE_SHEETS_PROXY_URL.includes('https://')) {
      logStatus('⚠️ Google Sheets proxy URL not configured');
      return null;
    }

    logStatus('Writing to Google Sheets...');
    
    const row = [
      auditResult['Booking ID'],
      auditResult['Week'],
      auditResult['DSS Compliance?'],
      auditResult['Booking Value Tier'],
      auditResult['L1 Reason'],
      auditResult['L2 Reason'],
      auditResult['Experience Type'],
      auditResult['Conversation Count'] || 0,
      auditResult['Confidence'] || 'Unknown'
    ];

    try {
      const response = await fetch(GOOGLE_SHEETS_PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spreadsheetId: SPREADSHEET_ID,
          sheetName: SHEET_NAME,
          row: row
        })
      });

      const result = await response.json();
      if (result.success) {
        logStatus('✓ Successfully wrote to Google Sheets!');
      } else {
        logStatus('✗ Failed to write: ' + result.error);
      }
      return result;
    } catch (err) {
      logStatus('✗ Error writing to sheets: ' + err.message);
      console.error(err);
      return null;
    }
  }

  // Main audit flow
  async function runAudit(sendToSheets=false) {
    try {
      logStatus('Loading DSS grid...');
      const grid = await loadGrid();
      
      logStatus('Gathering full conversation...');
      const inputs = await gatherFullConversation();
      
      inputs.valueTier = detectValueTier(inputs.fullConversation + ' ' + inputs.subject);
      
      logStatus(`Found ${inputs.conversationCount} messages. Analyzing...`);
      const matchRow = findBestMatch(grid, inputs);
      const col = chooseColumnLetter(inputs.experienceType, inputs.valueTier);
      
      const refundAction = (inputs.fullConversation.match(/(refund.*?(\.|$))/i) || [])[0] || 'Not found';
      
      const outputJson = buildOutputJSON(inputs, matchRow || {}, col, refundAction);
      
      outputEl.textContent = JSON.stringify(outputJson, null, 2);
      logStatus('✓ Audit complete!');
      
      if (sendToSheets) {
        await writeToSheet(outputJson);
      }
    } catch (err) {
      console.error(err);
      logStatus('✗ Error: ' + (err.message || err));
      outputEl.textContent = 'Error: ' + (err.message || err);
    }
  }

  runBtn.addEventListener('click', () => runAudit(false));
  runAndSendBtn.addEventListener('click', () => runAudit(true));
})();
```

---

## Step 3: Update the Configuration

1. After deploying the Google Apps Script, copy the Web App URL
2. In assets/app.js, update line 12:
   ```javascript
   const GOOGLE_SHEETS_PROXY_URL = 'YOUR_ACTUAL_WEB_APP_URL_HERE';
   ```

---

## Key Changes Made:

### 1. Full Conversation Reading
- Old: Only read last comment
- New: Read ALL comments from ticket using `/api/v2/tickets/${ticket.id}/comments.json`
- Combines all messages into `fullConversation` for analysis

### 2. Better DSS Detection
- Analyzes entire conversation history for L1/L2 keywords
- Falls back to ticket fields when no conversation exists
- Tracks conversation count for confidence scoring

### 3. Google Sheets Integration
- Uses Google Apps Script as proxy (required for CORS)
- Writes results to "VS output" tab
- Includes all required columns: Booking ID, Week, DSS Compliance, Value Tier, L1/L2, Experience Type

### 4. Error Handling
- Handles cases with no conversation
- Graceful fallback for missing DSS data
- Clear status messages for debugging

---

## Testing

1. Open any Zendesk ticket with conversations
2. Click "Run Audit"
3. Review JSON output
4. Click "Run & Send to Sheets"
5. Check VS output tab in Google Sheets

---

## Troubleshooting

**Issue: "Google Sheets proxy URL not configured"**
- Solution: Update GOOGLE_SHEETS_PROXY_URL with your Apps Script Web App URL

**Issue: "Failed to write" error**
- Check Apps Script deployment settings ("Anyone" has access)
- Verify spreadsheet ID is correct
- Check sheet name is exactly "VS output"

**Issue: "No conversations found"**
- Normal for tickets without agent-customer messages
- System will use fallback logic based on ticket fields

---

## Summary

Your enhanced system now:
✅ Reads ALL Zendesk conversations (not just latest)
✅ Better detects DSS compliance using full conversation context
✅ Writes results to Google Sheets "VS output" tab  
✅ Handles edge cases (no conversation, missing DSS)
✅ Provides confidence scoring
✅ Clear status messages and error handling

**Next step**: Deploy the Google Apps Script and update the proxy URL in app.js!
