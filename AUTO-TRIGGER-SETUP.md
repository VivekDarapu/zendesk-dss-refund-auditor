# Auto-Trigger Setup Guide

## Overview

This guide will help you set up the automatic refund audit system that triggers when refund tags are added to tickets.

## Prerequisites

- Zendesk instance with admin access
- Google Gemini API key: `AIzaSyARtXsC6LTTRDNiIJbHWso4iQNA2SHWHw`
- Hugging Face API key: `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`
- Google Sheets URL: https://docs.google.com/spreadsheets/d/1xG_fPoVsWBVwDCaDzhlyTtsqD0O7oS2qtIwMfy4IdeQ/edit

## Step 1: Configure API Keys in Zendesk

1. Go to Zendesk Admin Center
2. Navigate to Apps and integrations > Apps > Zendesk Support apps
3. Find your installed "DSS Refund Auditor" app
4. Click "Settings"
5. Add the following secure settings:
   - `googleGeminiApiKey`: AIzaSyARtXsC6LTTRDNiIJbHWso4iQNA2SHWHw
   - `huggingfaceApiKey`: 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

## Step 2: Set Up Google Sheets Integration

### Option A: Google Apps Script Proxy (Recommended)

1. Open your Google Sheet
2. Go to Extensions > Apps Script
3. Replace the code with:

```javascript
function doPost(e) {
  const ss = SpreadsheetApp.openById('1xG_fPoVsWBVwDCaDzhlyTtsqD0O7oS2qtIwMfy4IdeQ');
  const sheet = ss.getSheetByName('Refund Audits') || ss.insertSheet('Refund Audits');
  
  const data = JSON.parse(e.postData.contents);
  sheet.appendRow(data.row);
  
  return ContentService.createTextOutput(JSON.stringify({success: true}));
}
```

4. Deploy as Web App:
   - Click Deploy > New deployment
   - Type: Web app
   - Execute as: Me
   - Who has access: Anyone
   - Copy the Web App URL

5. Add proxy URL to config.js:
   ```javascript
   proxyUrl: 'YOUR_WEB_APP_URL_HERE'
   ```

## Step 3: Update manifest.json Permissions

Ensure your manifest.json includes:

```json
{
  "permissions": [
    "read",
    "write",
    "ticket.tags",
    "ticket.requester",
    "ticket.assignee",
    "ticket.customFields"
  ],
  "events": [
    "ticket.tags.changed"
  ]
}
```

## Step 4: Configure Tag Triggers

The system auto-triggers on ANY tag containing "refund" (case-insensitive).

Examples:
- `refund_approved` ✅
- `partial_refund` ✅
- `REFUND_PENDING` ✅
- `customer_complaint` ❌

## Step 5: Update iframe.html

Replace the `<script>` tags in iframe.html:

```html
<script src="https://assets.zendesk.com/apps/sdk/2.0/zaf_sdk.js"></script>
<script src="config.js"></script>
<script src="conversation-analyzer.js"></script>
<script src="sheets-writer.js"></script>
<script src="auto-trigger-app.js"></script>
```

## Step 6: Testing

### Test the Auto-Trigger:

1. Open any ticket in Zendesk
2. Add a tag containing "refund" (e.g., `refund_test`)
3. Open the DSS Refund Auditor app sidebar
4. Check the status messages:
   - "Refund tag detected - starting auto audit..."
   - "Running audit..."
   - "Reading conversation..."
   - "Analyzing conversation..."
   - "Checking compliance..."
   - "Writing to Google Sheets..."
   - "Audit complete: COMPLIANT/NON-COMPLIANT"

5. Verify results in Google Sheets

### Test Fallback API:

To test Hugging Face fallback:
1. Temporarily break Gemini API key in config
2. Add refund tag
3. Check console logs for "Trying fallback API"

## Step 7: Monitor and Debug

### Console Logs:
Open browser DevTools (F12) to see:
- Tag detection events
- API calls and responses
- Compliance analysis results
- Sheets write confirmations

### Common Issues:

**Issue**: "Configuration validation failed"
- **Fix**: Check all API keys are set in Zendesk secure settings

**Issue**: "Failed to write audit result"
- **Fix**: Verify Google Apps Script proxy URL is correct and deployed

**Issue**: "Both primary and fallback APIs failed"
- **Fix**: Check API keys are valid and not rate-limited

**Issue**: "No conversation available"
- **Fix**: Ensure ticket has comments/conversation history

## Google Sheets Output Format

Each audit creates one row with these columns:
1. Timestamp
2. Ticket ID
3. Tag Added
4. Customer Name  
5. Order ID
6. Product Type
7. Reason Category
8. Refund Amount
9. DSS Decision
10. Conversation Summary
11. Compliance Status (COMPLIANT/NON-COMPLIANT/UNKNOWN)
12. Compliance Details
13. Agent Name
14. Audit Duration (ms)

## Security Best Practices

⚠️ **CRITICAL**: 
- Never commit API keys to Git
- Use Zendesk secure settings for production
- Restrict Google Sheets access
- Review Google Apps Script permissions
- Monitor API usage for anomalies

## Production Checklist

- [ ] API keys configured in Zendesk secure settings
- [ ] Google Sheets proxy deployed and tested
- [ ] Sheet headers added (row 1)
- [ ] manifest.json permissions updated
- [ ] Auto-trigger tested on sample tickets
- [ ] Compliance analysis verified
- [ ] Error handling tested
- [ ] Team trained on reading Sheets output

## Support

For issues:
1. Check browser console for errors
2. Verify API keys are valid
3. Test Google Sheets proxy manually
4. Review Zendesk app logs

## API Key Management

### Google Gemini API
- **Dashboard**: https://ai.google.dev/
- **Free tier**: 60 requests/minute
- **Monitor usage**: Check Google AI Studio

### Hugging Face API
- **Dashboard**: https://huggingface.co/settings/tokens
- **Rate limits**: Varies by model
- **Monitor usage**: Check HF account dashboard

### Updating Keys

1. Zendesk Admin > Apps > Your App > Settings
2. Update secure settings
3. Reload app in sidebar
4. Test with new tag addition

---

**Status**: Ready for deployment
**Last Updated**: Current session
**Version**: 2.0 (Auto-Trigger Edition)
