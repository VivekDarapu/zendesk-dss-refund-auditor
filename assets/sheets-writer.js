/* sheets-writer.js - Google Sheets Integration for Refund Audit Results */

// Google Sheets Writer Class
class SheetsWriter {
  constructor(config) {
    this.spreadsheetId = config.googleSheets.spreadsheetId;
    this.sheetName = config.googleSheets.sheetName;
    this.apiEndpoint = config.googleSheets.apiEndpoint;
    this.serviceAccountEmail = config.googleSheets.serviceAccountEmail;
    this.serviceAccountKey = config.googleSheets.serviceAccountKey;
    this.columns = config.googleSheets.columns;
    this.accessToken = null;
    this.tokenExpiry = null;
  }

  // Get OAuth2 access token using service account JWT
  async getAccessToken() {
    // Check if we have a valid cached token
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    try {
      // Create JWT for service account authentication
      const jwt = await this.createJWT();
      
      // Exchange JWT for access token
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion: jwt
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to get access token: ${response.status}`);
      }

      const data = await response.json();
      this.accessToken = data.access_token;
      this.tokenExpiry = Date.now() + (data.expires_in - 60) * 1000; // Refresh 1 min early
      
      return this.accessToken;
    } catch (error) {
      console.error('Error getting access token:', error);
      throw error;
    }
  }

  // Create JWT for service account (simplified - in production use a library)
  async createJWT() {
    // In a real implementation, you would:
    // 1. Create JWT header and payload
    // 2. Sign with private key from service account
    // 3. Encode as base64url
    
    // For Zendesk app, this should be handled server-side
    // This is a placeholder - actual implementation needs proper JWT library
    throw new Error('JWT creation should be handled by backend proxy server');
  }

  // Initialize sheet (create if doesn't exist, add headers if empty)
  async initializeSheet() {
    try {
      const token = await this.getAccessToken();
      
      // Check if sheet exists
      const sheetsResponse = await fetch(
        `${this.apiEndpoint}/${this.spreadsheetId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      if (!sheetsResponse.ok) {
        throw new Error('Failed to access spreadsheet');
      }

      const spreadsheet = await sheetsResponse.json();
      const sheetExists = spreadsheet.sheets.some(
        sheet => sheet.properties.title === this.sheetName
      );

      // Create sheet if it doesn't exist
      if (!sheetExists) {
        await this.createSheet();
      }

      // Add headers if sheet is empty
      await this.ensureHeaders();
      
      return true;
    } catch (error) {
      console.error('Error initializing sheet:', error);
      throw error;
    }
  }

  // Create new sheet
  async createSheet() {
    const token = await this.getAccessToken();
    
    const response = await fetch(
      `${this.apiEndpoint}/${this.spreadsheetId}:batchUpdate`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          requests: [
            {
              addSheet: {
                properties: {
                  title: this.sheetName
                }
              }
            }
          ]
        })
      }
    );

    if (!response.ok) {
      throw new Error('Failed to create sheet');
    }
  }

  // Ensure headers exist in first row
  async ensureHeaders() {
    const token = await this.getAccessToken();
    
    // Check if headers exist
    const range = `${this.sheetName}!A1:Z1`;
    const response = await fetch(
      `${this.apiEndpoint}/${this.spreadsheetId}/values/${encodeURIComponent(range)}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );

    const data = await response.json();
    
    // If no values or first row is empty, add headers
    if (!data.values || data.values.length === 0 || data.values[0].length === 0) {
      await this.writeHeaders();
    }
  }

  // Write column headers
  async writeHeaders() {
    const token = await this.getAccessToken();
    const range = `${this.sheetName}!A1`;
    
    const response = await fetch(
      `${this.apiEndpoint}/${this.spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          values: [this.columns]
        })
      }
    );

    if (!response.ok) {
      throw new Error('Failed to write headers');
    }
  }

  // Write audit result to sheet
  async writeAuditResult(auditData) {
    try {
      const token = await this.getAccessToken();
      
      // Format data as row
      const row = this.formatAuditRow(auditData);
      
      // Append to sheet
      const range = `${this.sheetName}!A:A`;
      const response = await fetch(
        `${this.apiEndpoint}/${this.spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            values: [row]
          })
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Failed to write audit result: ${JSON.stringify(error)}`);
      }

      const result = await response.json();
      console.log('Audit result written to sheet:', result);
      return result;
    } catch (error) {
      console.error('Error writing audit result:', error);
      throw error;
    }
  }

  // Format audit data as row matching column structure
  formatAuditRow(auditData) {
    return [
      auditData.bookingId || '',
      new Date().toISOString().split('T')[0], // Week (date)
      auditData.dssCompliance || '',
      auditData.bookingValueTier || '',
      auditData.l1Reason || '',
      auditData.l2Reason || '',
      auditData.experienceType || '',
      auditData.refundTypeVerdict || '',
      auditData.refundAmountMethod || '',
      auditData.dssRuleMisapplied || '',
      auditData.dssSeverityMatch || '',
      auditData.spContacted || ''
    ];
  }

  // Batch write multiple audit results
  async writeMultipleResults(auditDataArray) {
    try {
      const token = await this.getAccessToken();
      const rows = auditDataArray.map(data => this.formatAuditRow(data));
      
      const range = `${this.sheetName}!A:A`;
      const response = await fetch(
        `${this.apiEndpoint}/${this.spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            values: rows
          })
        }
      );

      if (!response.ok) {
        throw new Error('Failed to write batch results');
      }

      return await response.json();
    } catch (error) {
      console.error('Error writing batch results:', error);
      throw error;
    }
  }
}

// Simplified writer for testing (uses Google Apps Script Web App as proxy)
class SimplifiedSheetsWriter {
  constructor(config) {
    this.spreadsheetId = config.googleSheets.spreadsheetId;
    this.sheetName = config.googleSheets.sheetName;
    this.columns = config.googleSheets.columns;
    // Use Google Apps Script Web App URL (you'll create this)
    this.proxyUrl = config.googleSheets.proxyUrl || '';
  }

  // Write audit result using proxy
  async writeAuditResult(auditData) {
    try {
      const row = this.formatAuditRow(auditData);
      
      const response = await fetch(this.proxyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          spreadsheetId: this.spreadsheetId,
          sheetName: this.sheetName,
          row: row
        })
      });

      if (!response.ok) {
        throw new Error(`Proxy request failed: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error writing via proxy:', error);
      throw error;
    }
  }

  formatAuditRow(auditData) {
    return [
      auditData.bookingId || '',
      new Date().toISOString().split('T')[0], // Week (date)
      auditData.dssCompliance || '',
      auditData.bookingValueTier || '',
      auditData.l1Reason || '',
      auditData.l2Reason || '',
      auditData.experienceType || '',
      auditData.refundTypeVerdict || '',
      auditData.refundAmountMethod || '',
      auditData.dssRuleMisapplied || '',
      auditData.dssSeverityMatch || '',
      auditData.spContacted || ''
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SheetsWriter, SimplifiedSheetsWriter };
}
