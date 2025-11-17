/* app.js - DSS Refund Auditor Logic (Standalone & sidebar compatible) */
(function() {
    // Google Sheets Proxy URL
    const GOOGLE_SHEETS_PROXY_URL = 'https://script.google.com/macros/s/AKfycbx98b4iwSD0SklSFfAROjWISTxN954BUGcZK6NxhHA_rc8aHJeI63zHlJ5hg_2Z2BBPuQ/exec';
  // Try to detect Zendesk context and ZAFClient
  let inZendesk = false;
  if (typeof ZAFClient !== 'undefined' && typeof ZAFClient.init === 'function') {
    try {
            // Use global client from config.js, or initialize if not available
              const client = window.client || ZAFClient.init();
              inZendesk = true;
    } catch (e) {
      client = null;
      inZendesk = false;
    }
          // Initialize Tour Deadline Monitor
    if (client && typeof initTourDeadlineMonitor === 'function') {
      initTourDeadlineMonitor(client);
    }
  }

  // DOM Elements
  const statusEl = document.getElementById('status');
  const outputEl = document.getElementById('output');
  const runBtn = document.getElementById('run');
  const runAndSendBtn = document.getElementById('runAndSend');

  function logStatus(s) {
    if (statusEl) statusEl.textContent = s;
    else console.log('[STATUS]', s);
  }

  // Load DSS grid from assets
  async function loadGrid() {
    try {
      const resp = await fetch('dss_grid.json');
      if (!resp.ok) throw new Error('Failed to load dss_grid.json');
      return await resp.json();
    } catch (err) {
      logStatus('Error loading DSS grid: ' + err.message);
      throw err;
    }
  }

  // Extract ticket data/context - supports standalone mode
  async function gatherInputs() {
    if (inZendesk && client) {
      // Zendesk environment
      try {
        const ticketData = await client.get('ticket');
        const ticket = ticketData.ticket;
        // Get comments
        let latestComment = '';
        try {
          const commentsResp = await client.request(`/api/v2/tickets/${ticket.id}/comments.json`);
          if (commentsResp && commentsResp.comments && commentsResp.comments.length > 0) {
            const lastComment = commentsResp.comments[commentsResp.comments.length - 1];
            latestComment = lastComment.plain_body || lastComment.body || '';
          }
        } catch (e) {
          console.warn('Could not fetch comments:', e);
        }
        // Extract booking ID
        const bookingId = (ticket.subject && ticket.subject.match(/\d{4,}/))
          ? ticket.subject.match(/\d{4,}/)[0] : ticket.id.toString();
        // Experience type from custom fields
        let experienceType = 'Unknown';
        if (ticket.customField) {
          const expField = Object.entries(ticket.customField || {}).find(([key, val]) =>
            key.toLowerCase().includes('experience') || key.toLowerCase().includes('type')
          );
          if (expField) experienceType = expField[1] || 'Unknown';
        }
        return {
          bookingId,
          ticketId: ticket.id,
          subject: ticket.subject || '',
          latestComment: latestComment.slice(0, 3000),
          experienceType,
          ticketStatus: ticket.status || 'unknown'
        };
      } catch (err) {
        logStatus('Error gathering inputs: ' + err.message);
        throw err;
      }
    } else {
      // Standalone: Prompt user for required info
      let subject = prompt('Enter subject (or some ticket details):', '');
      let latestComment = prompt('Enter the latest comment from the ticket:', '');
      let experienceType = prompt('Enter experience type (Partnered/Non-Partnered/Social...):', '');
      let ticketId = Math.floor(Math.random() * 1000000).toString();
      let bookingId = (subject && subject.match(/\d{4,}/)) ? subject.match(/\d{4,}/)[0] : ticketId;
      let ticketStatus = 'unknown';
      return {
        bookingId,
        ticketId,
        subject: subject || '',
        latestComment: (latestComment || '').slice(0, 3000),
        experienceType: experienceType || 'Unknown',
        ticketStatus
      };
    }
  }

  // All downstream logic is unchanged, reusing all core functions (detectValueTier, findBestMatch, chooseColumnLetter, etc.)
  function detectValueTier(text) {
    if (!text) return 'Unknown';
    const usdMatch = text.match(/\$\s*([0-9,]+(?:\.[0-9]{1,2})?)/);
    if (usdMatch) {
      const num = parseFloat(usdMatch[1].replace(/,/g,''));
      return num <= 125 ? '≤ USD 125' : '> USD 125';
    }
    const usdMatch2 = text.match(/([\d,]+(?:\.\d{1,2})?)\s*USD/i);
    if (usdMatch2) {
      const num = parseFloat(usdMatch2[1].replace(/,/g,''));
      return num <= 125 ? '≤ USD 125' : '> USD 125';
    }
    return 'Unknown';
  }

  function findBestMatch(grid, inputs) {
    const text = (inputs.latestComment + ' ' + inputs.subject).toLowerCase();
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
      if (score > bestScore) { bestScore = score; best = row; }
    }
    if (!best) {
      const fallback = grid.find(r =>
        /unknown|other|default/i.test(r.L1 || '') ||
        /unknown|other|default/i.test(r.L2 || '')
      );
      if (fallback) best = fallback;
    }
    return best;
  }

  function chooseColumnLetter(experienceType, valueTier) {
    const type = (experienceType || '').trim();
    const vt = (valueTier || '').trim();
    if (/^partnered$/i.test(type) || (/partnered/i.test(type) && !/social/i.test(type))) {
      return vt === '≤ USD 125' ? 'C' : vt === '> USD 125' ? 'D' : 'C';
    }
    if (/^non-?partnered$/i.test(type) || (/non-?partnered/i.test(type) && !/social/i.test(type))) {
      return vt === '≤ USD 125' ? 'E' : vt === '> USD 125' ? 'F' : 'E';
    }
    if (/social.*partnered/i.test(type) || (/social/i.test(type) && /partnered/i.test(type) && !/non/i.test(type))) {
      return vt === '≤ USD 125' ? 'G' : vt === '> USD 125' ? 'H' : 'G';
    }
    if (/social.*non-?partnered/i.test(type) || (/social/i.test(type) && /non-?partnered/i.test(type))) {
      return vt === '≤ USD 125' ? 'I' : vt === '> USD 125' ? 'J' : 'I';
    }
    // Default
    return vt === '> USD 125' ? 'D' : 'C';
  }

  function severityRank(refundText) {
    const t = (refundText || '').toLowerCase();
    if (/full refund|refund to original|refund \(original method\)/i.test(t)) return 1;
    if (/partial refund|% refund/i.test(t)) return 2;
    if (/full wallet credit|wallet credit full/i.test(t)) return 3;
    if (/partial wallet credit|credit to wallet partial/i.test(t)) return 4;
    if (/no refund|deny refund|no action/i.test(t)) return 5;
    return 3; // neutral
  }

  function compareSeverity(expectedText, actualText) {
    const exp = severityRank(expectedText);
    const act = severityRank(actualText);
    if (exp === act) return 'Match';
    if (act > exp) return 'Less severe (under-refunded)';
    if (act < exp) return 'More severe (over-refunded)';
    return 'Mismatch';
  }

  function buildOutputJSON(inputs, gridRow, columnLetter, actualActionText) {
    const cellHeaderMap = {
      C: 'Partnered ≤ USD 125', D: 'Partnered > USD 125',
      E: 'Non-Partnered ≤ USD 125', F: 'Non-Partnered > USD 125',
      G: 'Social Media Partnered ≤ USD 125', H: 'Social Media Partnered > USD 125',
      I: 'Social Media Non-Partnered ≤ USD 125', J: 'Social Media Non-Partnered > USD 125'
    };
    const expectedCellText = gridRow ? (gridRow[columnLetter] || '') : '';
    let refundTypeVerdict = 'Unknown';
    const refundText = actualActionText || '';
    if (/refund to original|full refund/i.test(refundText)) {
      refundTypeVerdict = 'Full refund (original method)';
    } else if (/partial refund|% refund/i.test(refundText)) {
      refundTypeVerdict = 'Partial refund';
    } else if (/wallet credit.*full|full.*wallet credit/i.test(refundText)) {
      refundTypeVerdict = 'Full wallet credit';
    } else if (/wallet credit|credit to wallet/i.test(refundText)) {
      refundTypeVerdict = 'Partial wallet credit';
    } else if (/no refund|deny refund/i.test(refundText)) {
      refundTypeVerdict = 'No refund';
    }
    const severityComparison = compareSeverity(expectedCellText, actualActionText);
    let complianceFlag = '';
    if (severityComparison === 'Match' || severityComparison === 'Less severe (under-refunded)') {
      complianceFlag = 'Compliant';
    } else if (severityComparison === 'More severe (over-refunded)') {
      complianceFlag = 'Non-Compliant';
    } else {
      complianceFlag = 'Non-Compliant (DSS Rule Misapplied)';
    }
    return {
      'Booking ID': inputs.bookingId || inputs.ticketId || '',
      'Week': new Date().toISOString().slice(0, 10),
      'DSS Compliance?': complianceFlag,
      'Booking Value Tier': inputs.valueTier || '',
      'L1 Reason': gridRow ? gridRow.L1 || '' : '',
      'L2 Reason': gridRow ? gridRow.L2 || '' : '',
      'DSS Grid Column Letter': columnLetter || '',
      'DSS Grid Column Header': cellHeaderMap[columnLetter] || '',
      'Experience Type': inputs.experienceType || '',
      'Refund Type Verdict': refundTypeVerdict,
      'Refund Verdict Detail': actualActionText || '',
      'Compliance Reason': severityComparison,
      'Compliance Explanation': `DSS expects: "${(expectedCellText||'').slice(0,150)}". Actual: "${(actualActionText||'').slice(0,150)}".`,
      'Refund Amount & Method': actualActionText || '',
      'DSS Rule Misapplied': complianceFlag.includes('Non-Compliant') ? 'Yes' : 'No',
      'DSS Severity Match': severityComparison,
      'Ideal Refund Action': expectedCellText || '',
      'Confidence': 'High',
      'Summary': `L1: ${gridRow ? gridRow.L1 : 'Unknown'}; L2: ${gridRow ? gridRow.L2 : 'Unknown'}; Col: ${cellHeaderMap[columnLetter] || 'N/A'}`
    };
  }

  // Main audit flow
  async function runAudit(sendExternal=false) {
    try {
      logStatus('Loading DSS grid...');
      const grid = await loadGrid();
      logStatus('Gathering ticket data...');
      const inputs = await gatherInputs();
      // Detect value tier
      inputs.valueTier = detectValueTier(inputs.latestComment + ' ' + inputs.subject);
      logStatus('Finding best DSS match...');
      const matchRow = findBestMatch(grid, inputs);
      const col = chooseColumnLetter(inputs.experienceType, inputs.valueTier);
      // Extract refund action
      const refundSentence = (inputs.latestComment.match(/(refund.*?(\.|$))/i) || [])[0] || '';
      const outputJson = buildOutputJSON(inputs, matchRow || {}, col, refundSentence || '');
      if (outputEl) outputEl.textContent = JSON.stringify(outputJson, null, 2);
      else console.log('[AUDIT]', outputJson);
      logStatus('Audit complete! ✓');
      if (sendExternal) {
      logStatus('Sending to Google Sheets...');
      try {
        const response = await fetch(GOOGLE_SHEETS_PROXY_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(outputJson)
        });
        if (response.ok) {
          logStatus('✓ Sent to Google Sheets successfully!');
        } else {
          logStatus('Failed to send to Google Sheets: ' + response.statusText);
        }
      } catch (err) {
        console.error('Google Sheets error:', err);
        logStatus('Error sending to Google Sheets: ' + err.message);
      }      }
    } catch (err) {
      console.error(err);
      logStatus('Error: ' + (err.message || err));
      if (outputEl) outputEl.textContent = 'Error: ' + (err.message || err);
      else alert(err.message || err);
    }
  }

  // Wire up buttons if present
  if (runBtn) runBtn.addEventListener('click', () => runAudit(false));
  if (runAndSendBtn) runAndSendBtn.addEventListener('click', () => runAudit(true));

  // Optionally auto-run in standalone (if not in Zendesk & not started from UI)
  if (!inZendesk && !runBtn && !runAndSendBtn) {
    runAudit();
  }
})();
