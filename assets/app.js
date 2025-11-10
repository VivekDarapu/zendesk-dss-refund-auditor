/* app.js - DSS Refund Auditor Logic */
(function() {
  const client = ZAFClient.init();
  const statusEl = document.getElementById('status');
  const outputEl = document.getElementById('output');
  const runBtn = document.getElementById('run');
  const runAndSendBtn = document.getElementById('runAndSend');

  function logStatus(s) { statusEl.textContent = s; }

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

  // Extract ticket data and context
  async function gatherInputs() {
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

      // Extract booking ID from subject or custom field
      const bookingId = (ticket.subject && ticket.subject.match(/\d{4,}/)) 
        ? ticket.subject.match(/\d{4,}/)[0] 
        : ticket.id.toString();

      // Get experience type from custom fields
      let experienceType = 'Unknown';
      if (ticket.customField) {
        // Try to find experience type field
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
  }

  // Determine value tier from currency in text
  function detectValueTier(text) {
    if (!text) return 'Unknown';
    
    // Look for USD amounts
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

  // Find best matching DSS row
  function findBestMatch(grid, inputs) {
    const text = (inputs.latestComment + ' ' + inputs.subject).toLowerCase();
    let best = null;
    let bestScore = 0;

    for (const row of grid) {
      let score = 0;
      
      // Check keywords
      if (row.keywords && row.keywords.length) {
        for (const k of row.keywords) {
          if (text.includes(k.toLowerCase())) score += 10;
        }
      }
      
      // Check L1/L2 substring match
      if (row.L1 && text.includes(row.L1.toLowerCase())) score += 5;
      if (row.L2 && text.includes(row.L2.toLowerCase())) score += 5;
      
      if (score > bestScore) {
        bestScore = score;
        best = row;
      }
    }

    // Fallback to "Unknown" row if available
    if (!best) {
      const fallback = grid.find(r => 
        /unknown|other|default/i.test(r.L1 || '') || 
        /unknown|other|default/i.test(r.L2 || '')
      );
      if (fallback) best = fallback;
    }

    return best;
  }

  // Choose column letter based on experience type and value tier
  function chooseColumnLetter(experienceType, valueTier) {
    const type = (experienceType || '').trim();
    const vt = (valueTier || '').trim();
    
    // Partnered (not social)
    if (/^partnered$/i.test(type) || (/partnered/i.test(type) && !/social/i.test(type))) {
      return vt === '≤ USD 125' ? 'C' : vt === '> USD 125' ? 'D' : 'C';
    }
    
    // Non-Partnered (not social)
    if (/^non-?partnered$/i.test(type) || (/non-?partnered/i.test(type) && !/social/i.test(type))) {
      return vt === '≤ USD 125' ? 'E' : vt === '> USD 125' ? 'F' : 'E';
    }
    
    // Social Media Partnered
    if (/social.*partnered/i.test(type) || (/social/i.test(type) && /partnered/i.test(type) && !/non/i.test(type))) {
      return vt === '≤ USD 125' ? 'G' : vt === '> USD 125' ? 'H' : 'G';
    }
    
    // Social Media Non-Partnered
    if (/social.*non-?partnered/i.test(type) || (/social/i.test(type) && /non-?partnered/i.test(type))) {
      return vt === '≤ USD 125' ? 'I' : vt === '> USD 125' ? 'J' : 'I';
    }
    
    // Default: Partnered ≤ USD 125
    return vt === '> USD 125' ? 'D' : 'C';
  }

  // Severity ranking for refund actions
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

  // Build output JSON
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

    // Determine refund type verdict
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
      
      // Extract actual refund action from comment
      const refundSentence = (inputs.latestComment.match(/(refund.*?(\.|$))/i) || [])[0] || '';
      
      const outputJson = buildOutputJSON(inputs, matchRow || {}, col, refundSentence || '');
      
      // Display output
      outputEl.textContent = JSON.stringify(outputJson, null, 2);
      logStatus('Audit complete! ✓');
      
      if (sendExternal) {
        logStatus('External validation not configured.');
      }
    } catch (err) {
      console.error(err);
      logStatus('Error: ' + (err.message || err));
      outputEl.textContent = 'Error: ' + (err.message || err);
    }
  }

  // Wire button events
  runBtn.addEventListener('click', () => runAudit(false));
  runAndSendBtn.addEventListener('click', () => runAudit(true));

})();
