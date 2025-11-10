/* auto-trigger-app.js - Auto-Trigger Refund Audit System with LLM Integration */

// This file extends the base app.js with auto-trigger capabilities
// It listens for refund tag additions and automatically runs audits

(async function() {
  'use strict';

  // Initialize ZAF client
  const client = ZAFClient.init();

  // Global state
  let config = null;
  let dssGrid = null;
  let conversationAnalyzer = null;
  let sheetsWriter = null;
  let isProcessing = false;

  // Initialize the system
  async function initialize() {
    try {
      console.log('Initializing Auto-Trigger Refund Auditor...');

      // Load configuration
      config = await loadConfig();
      console.log('Configuration loaded');

      // Validate configuration
      const validation = validateConfig(config);
      if (!validation.valid) {
        console.error('Configuration validation failed:', validation.errors);
        displayStatus('Configuration error - check console', 'error');
        return;
      }

      // Load DSS grid
      dssGrid = await loadDSSGrid();
      console.log('DSS grid loaded:', dssGrid.length, 'scenarios');

      // Initialize conversation analyzer
      conversationAnalyzer = new ConversationAnalyzer(config);
      console.log('Conversation analyzer initialized');

      // Initialize sheets writer  
      sheetsWriter = new SimplifiedSheetsWriter(config);
      console.log('Sheets writer initialized');

      // Set up event listeners
      setupEventListeners();

      displayStatus('Auto-trigger system active', 'success');
    } catch (error) {
      console.error('Initialization error:', error);
      displayStatus(`Initialization failed: ${error.message}`, 'error');
    }
  }

  // Set up Zendesk event listeners
  function setupEventListeners() {
    // Listen for ticket updates (tag changes)
    client.on('ticket.tags.changed', handleTagChange);
    
    // Listen for app activation
    client.on('app.activated', handleAppActivation);

    console.log('Event listeners set up');
  }

  // Handle tag change events
  async function handleTagChange(event) {
    try {
      console.log('Tag change detected:', event);

      // Get current ticket tags
      const ticketData = await client.get('ticket');
      const tags = ticketData.ticket.tags;

      // Check if any tag matches the refund pattern
      const refundTags = tags.filter(tag => 
        config.triggers.tagPattern.test(tag)
      );

      if (refundTags.length > 0 && config.triggers.autoRun) {
        console.log('Refund tag(s) detected:', refundTags);
        displayStatus('Refund tag detected - starting auto audit...', 'info');
        
        // Run automatic audit
        await runAutoAudit(refundTags[0]);
      }
    } catch (error) {
      console.error('Error handling tag change:', error);
    }
  }

  // Handle app activation
  async function handleAppActivation() {
    console.log('App activated');
    displayStatus('Monitoring for refund tags...', 'info');
  }

  // Run automatic audit when refund tag is added
  async function runAutoAudit(refundTag) {
    if (isProcessing) {
      console.log('Already processing an audit, skipping');
      return;
    }

    isProcessing = true;
    const startTime = Date.now();

    try {
      displayStatus('Running audit...', 'info');

      // Step 1: Gather ticket data
      const ticketData = await gatherTicketData();
      console.log('Ticket data gathered:', ticketData);

      // Step 2: Extract ticket fields for DSS matching
      const inputs = extractTicketInputs(ticketData);
      console.log('Ticket inputs extracted:', inputs);

      // Step 3: Run DSS decision logic
      const dssDecision = runDSSLogic(inputs);
      console.log('DSS decision:', dssDecision);

      // Step 4: Get conversation text
      displayStatus('Reading conversation...', 'info');
      const conversation = await getConversationText(ticketData);
      console.log('Conversation retrieved:', conversation.length, 'characters');

      // Step 5: Get conversation summary
      displayStatus('Analyzing conversation...', 'info');
      const summary = await conversationAnalyzer.getSummary(conversation);

      // Step 6: Analyze compliance with LLM
      displayStatus('Checking compliance...', 'info');
      const complianceResult = await conversationAnalyzer.analyzeCompliance(
        conversation,
        dssDecision.decision,
        {
          refundAmount: inputs.refundAmount,
          reason: inputs.customerReason
        }
      );

      console.log('Compliance analysis complete:', complianceResult);

      // Step 7: Prepare audit result data
      const auditResult = {
        ticketId: ticketData.ticket.id,
        tagAdded: refundTag,
        customerName: ticketData.ticket.requester.name || 'Unknown',
        orderId: inputs.orderId || 'N/A',
        productType: inputs.productType || 'N/A',
        reasonCategory: inputs.customerReason || 'N/A',
        refundAmount: inputs.refundAmount || 'N/A',
        dssDecision: dssDecision.decision || 'No Match',
        conversationSummary: summary,
        complianceStatus: complianceResult.status,
        complianceDetails: complianceResult.explanation,
        agentName: ticketData.ticket.assignee.user.name || 'Unassigned',
        auditDuration: Date.now() - startTime
      };

      // Step 8: Write to Google Sheets
      displayStatus('Writing to Google Sheets...', 'info');
      await sheetsWriter.writeAuditResult(auditResult);

      // Step 9: Display result
      const statusMessage = `Audit complete: ${complianceResult.status} (${complianceResult.apiUsed})`;
      displayStatus(statusMessage, complianceResult.status === 'COMPLIANT' ? 'success' : 'warning');

      // Display results in UI
      displayAuditResults(auditResult, dssDecision, complianceResult);

    } catch (error) {
      console.error('Auto audit error:', error);
      displayStatus(`Audit failed: ${error.message}`, 'error');
    } finally {
      isProcessing = false;
    }
  }

  // Gather all ticket data needed for audit
  async function gatherTicketData() {
    const data = await client.get([
      'ticket',
      'ticket.requester',
      'ticket.assignee',
      'ticket.customField:*'
    ]);
    return data;
  }

  // Extract inputs for DSS logic
  function extractTicketInputs(ticketData) {
    const ticket = ticketData.ticket;
    
    // Extract from custom fields or ticket data
    // Adjust field names based on your Zendesk setup
    return {
      productType: findCustomField(ticket, 'product_type') || 'Unknown',
      customerReason: findCustomField(ticket, 'refund_reason') || ticket.subject,
      refundAmount: findCustomField(ticket, 'refund_amount') || 'Unknown',
      orderId: findCustomField(ticket, 'order_id') || 'N/A',
      purchaseDate: findCustomField(ticket, 'purchase_date') || 'Unknown',
      daysSincePurchase: calculateDaysSince(findCustomField(ticket, 'purchase_date')),
      priorRefunds: findCustomField(ticket, 'prior_refunds') || 0
    };
  }

  // Find custom field value
  function findCustomField(ticket, fieldName) {
    if (!ticket.customFields) return null;
    
    for (const field of ticket.customFields) {
      if (field.name && field.name.toLowerCase().includes(fieldName.toLowerCase())) {
        return field.value;
      }
    }
    return null;
  }

  // Calculate days since date
  function calculateDaysSince(dateString) {
    if (!dateString) return null;
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffMs = now - date;
      return Math.floor(diffMs / (1000 * 60 * 60 * 24));
    } catch {
      return null;
    }
  }

  // Run DSS decision logic (reuse from app.js)
  function runDSSLogic(inputs) {
    for (const scenario of dssGrid) {
      if (matchesScenario(scenario, inputs)) {
        return {
          decision: scenario.decision,
          scenario: scenario,
          matched: true
        };
      }
    }
    return {
      decision: 'No matching scenario found',
      scenario: null,
      matched: false
    };
  }

  // Check if inputs match a scenario
  function matchesScenario(scenario, inputs) {
    // Match L1 conditions
    if (scenario.l1_keyword && scenario.l1_keyword !== '-') {
      const keywords = scenario.l1_keyword.split('|').map(k => k.trim().toLowerCase());
      const matchFound = keywords.some(keyword => 
        inputs.productType.toLowerCase().includes(keyword)
      );
      if (!matchFound) return false;
    }

    // Match L2 conditions
    if (scenario.l2_keyword && scenario.l2_keyword !== '-') {
      const keywords = scenario.l2_keyword.split('|').map(k => k.trim().toLowerCase());
      const matchFound = keywords.some(keyword => 
        inputs.customerReason.toLowerCase().includes(keyword)
      );
      if (!matchFound) return false;
    }

    // Additional condition checks can be added here
    return true;
  }

  // Get full conversation text from ticket
  async function getConversationText(ticketData) {
    const ticketId = ticketData.ticket.id;
    
    try {
      // Request comments/conversation from Zendesk
      const commentsResp = await client.request({
        url: `/api/v2/tickets/${ticketId}/comments.json`,
        type: 'GET'
      });

      if (!commentsResp.comments) {
        return 'No conversation available';
      }

      // Format conversation
      const conversation = commentsResp.comments.map((comment, index) => {
        const author = comment.author_id ? `Agent` : `Customer`;
        const body = comment.plain_body || comment.body || '';
        return `[${author}]: ${body}`;
      }).join('\n\n');

      return conversation;
    } catch (error) {
      console.error('Error fetching conversation:', error);
      return 'Error retrieving conversation';
    }
  }

  // Load DSS grid from JSON
  async function loadDSSGrid() {
    try {
      const resp = await fetch('dss_grid.json');
      if (!resp.ok) throw new Error('Failed to load dss_grid.json');
      return await resp.json();
    } catch (error) {
      console.error('Error loading DSS grid:', error);
      throw error;
    }
  }

  // Display status message
  function displayStatus(message, type = 'info') {
    const statusEl = document.getElementById('status');
    if (statusEl) {
      statusEl.textContent = message;
      statusEl.className = `status status-${type}`;
    }
    console.log(`[${type.toUpperCase()}] ${message}`);
  }

  // Display audit results in UI
  function displayAuditResults(auditResult, dssDecision, complianceResult) {
    const outputEl = document.getElementById('output');
    if (!outputEl) return;

    outputEl.innerHTML = `
      <div class="audit-results">
        <h3>Audit Results</h3>
        
        <div class="result-section">
          <h4>Ticket Information</h4>
          <p><strong>Ticket ID:</strong> ${auditResult.ticketId}</p>
          <p><strong>Customer:</strong> ${auditResult.customerName}</p>
          <p><strong>Agent:</strong> ${auditResult.agentName}</p>
          <p><strong>Tag:</strong> ${auditResult.tagAdded}</p>
        </div>

        <div class="result-section">
          <h4>DSS Decision</h4>
          <p><strong>Recommended Action:</strong> ${auditResult.dssDecision}</p>
          <p><strong>Product:</strong> ${auditResult.productType}</p>
          <p><strong>Reason:</strong> ${auditResult.reasonCategory}</p>
        </div>

        <div class="result-section">
          <h4>Compliance Analysis</h4>
          <p class="compliance-status ${complianceResult.status.toLowerCase()}">
            <strong>Status:</strong> ${complianceResult.status}
          </p>
          <p><strong>Analysis:</strong> ${auditResult.complianceDetails}</p>
          <p><strong>API Used:</strong> ${complianceResult.apiUsed}</p>
        </div>

        <div class="result-section">
          <h4>Conversation Summary</h4>
          <p>${auditResult.conversationSummary}</p>
        </div>

        <p class="audit-meta">Audit completed in ${auditResult.auditDuration}ms | Results written to Google Sheets</p>
      </div>
    `;
  }

  // Start the system
  initialize();

})();
