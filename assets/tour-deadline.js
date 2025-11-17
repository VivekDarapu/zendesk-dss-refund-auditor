/**
 * Tour Deadline Monitor for Hagrid
 * Checks tour deadlines and displays status
 */

function initTourDeadlineMonitor(client) {
  console.log('Initializing Tour Deadline Monitor');
  
  // Get ticket data from Zendesk
  client.get('ticket').then(function(data) {
    const ticket = data.ticket;
    checkTourDeadline(ticket);
  }).catch(function(error) {
    console.error('Error loading ticket data:', error);
    showError('Unable to load ticket data');
  });
}

function checkTourDeadline(ticket) {
  // Extract relevant fields
  const customFields = ticket.customFields || [];
  
  // Look for tour date/time and city fields
  let tourDateTime = null;
  let tourCity = null;
  
  // Try to find tour-related custom fields
  customFields.forEach(field => {
    const fieldValue = field.value;
    if (!fieldValue) return;
    
    // Check if this looks like a date/time field
    if (typeof fieldValue === 'string' && (fieldValue.includes('-') || fieldValue.includes('/'))) {
      if (fieldValue.match(/\d{4}-\d{2}-\d{2}/) || fieldValue.match(/\d{2}\/\d{2}\/\d{4}/)) {
        tourDateTime = fieldValue;
      }
    }
    
    // Check if this looks like a city field
    if (typeof fieldValue === 'string' && CITY_TIMEZONES[fieldValue]) {
      tourCity = fieldValue;
    }
  });
  
  // If no tour data found, show info message
  if (!tourDateTime) {
    showInfo('No tour deadline information found in ticket');
    return;
  }
  
  // Calculate deadline
  const timezone = tourCity ? getTimezoneForCity(tourCity) : 'UTC';
  const tourDate = convertToTimezone(tourDateTime, timezone);
  
  // Display deadline status
  displayDeadlineStatus({
    tourDate: tourDate,
    tourCity: tourCity || 'Unknown',
    timezone: timezone
  });
}

function displayDeadlineStatus(deadlineInfo) {
  const container = document.getElementById('tour-deadline-content');
  if (!container) return;
  
  const { tourDate, tourCity, timezone } = deadlineInfo;
  const now = new Date();
  
  // Determine status
  let status = 'safe';
  let statusText = 'On Time';
  
  if (hasPassed(tourDate)) {
    status = 'passed';
    statusText = 'Deadline Passed';
  } else if (isApproaching(tourDate, 24)) {
    status = 'approaching';
    statusText = 'Approaching';
  }
  
  // Build HTML
  const html = `
    <div class="deadline-row">
      <span class="deadline-label">Tour City</span>
      <span class="deadline-value">${tourCity}</span>
    </div>
    <div class="deadline-row">
      <span class="deadline-label">Tour Date/Time</span>
      <span class="deadline-value">${formatDate(tourDate)}</span>
    </div>
    <div class="deadline-row">
      <span class="deadline-label">Time Remaining</span>
      <span class="deadline-value">${formatTimeRemaining(tourDate)}</span>
    </div>
    <div class="deadline-row">
      <span class="deadline-label">Status</span>
      <span class="status-badge ${status}">${statusText}</span>
    </div>
  `;
  
  container.innerHTML = html;
}

function showError(message) {
  const container = document.getElementById('tour-deadline-content');
  if (container) {
    container.innerHTML = `<div class="alert alert-danger">${message}</div>`;
  }
}

function showInfo(message) {
  const container = document.getElementById('tour-deadline-content');
  if (container) {
    container.innerHTML = `<div class="alert alert-info">${message}</div>`;
  }
}
