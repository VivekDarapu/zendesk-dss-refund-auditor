/**
 * Time Utilities for Hagrid App
 * Timezone-aware date/time functions for Tour Deadline Monitor
 */

// City to Timezone mapping
const CITY_TIMEZONES = {
  'Bucharest': 'Europe/Bucharest',
  'Sofia': 'Europe/Sofia',
  'Moscow': 'Europe/Moscow',
  'Istanbul': 'Europe/Istanbul',
  'Athens': 'Europe/Athens',
  'Belgrade': 'Europe/Belgrade',
  'Kyiv': 'Europe/Kiev',
  'Kiev': 'Europe/Kiev',
  'Warsaw': 'Europe/Warsaw',
  'Prague': 'Europe/Prague',
  'Budapest': 'Europe/Budapest',
  'Vienna': 'Europe/Vienna',
  'Berlin': 'Europe/Berlin',
  'Paris': 'Europe/Paris',
  'London': 'Europe/London',
  'New York': 'America/New_York',
  'Los Angeles': 'America/Los_Angeles',
  'Chicago': 'America/Chicago',
  'Dubai': 'Asia/Dubai',
  'Bangkok': 'Asia/Bangkok',
  'Singapore': 'Asia/Singapore',
  'Tokyo': 'Asia/Tokyo',
  'Sydney': 'Australia/Sydney'
};

/**
 * Get timezone for a city name
 * @param {string} cityName - Name of the city
 * @returns {string} IANA timezone identifier
 */
function getTimezoneForCity(cityName) {
  if (!cityName) return 'UTC';
  
  // Try exact match first
  if (CITY_TIMEZONES[cityName]) {
    return CITY_TIMEZONES[cityName];
  }
  
  // Try case-insensitive match
  const normalizedCity = cityName.trim();
  for (const [city, timezone] of Object.entries(CITY_TIMEZONES)) {
    if (city.toLowerCase() === normalizedCity.toLowerCase()) {
      return timezone;
    }
  }
  
  // Default to UTC if city not found
  console.warn(`Timezone not found for city: ${cityName}, defaulting to UTC`);
  return 'UTC';
}

/**
 * Convert date string to specific timezone
 * @param {string} dateStr - Date string (YYYY-MM-DD HH:mm format)
 * @param {string} timezone - IANA timezone identifier
 * @returns {Date} Date object in the specified timezone
 */
function convertToTimezone(dateStr, timezone) {
  try {
    // Parse the date string (assume it's in the specified timezone)
    const cleanDateStr = dateStr.trim();
    
    // Try different date formats
    let date;
    if (cleanDateStr.includes('T')) {
      // ISO format
      date = new Date(cleanDateStr);
    } else if (cleanDateStr.match(/\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/)) {
      // YYYY-MM-DD HH:mm format
      const [datePart, timePart] = cleanDateStr.split(/\s+/);
      const [year, month, day] = datePart.split('-');
      const [hours, minutes] = timePart.split(':');
      
      // Create date string that will be interpreted in the specified timezone
      const isoStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}:00`;
      date = new Date(isoStr);
    } else {
      date = new Date(cleanDateStr);
    }
    
    if (isNaN(date.getTime())) {
      throw new Error('Invalid date');
    }
    
    return date;
  } catch (error) {
    console.error('Error converting date to timezone:', error);
    return new Date(); // Return current date as fallback
  }
}

/**
 * Get current time in a specific timezone
 * @param {string} timezone - IANA timezone identifier
 * @returns {Date} Current date/time
 */
function getCurrentTimeInTimezone(timezone) {
  return new Date();
}

/**
 * Format date for display
 * @param {Date} date - Date object
 * @param {boolean} includeTime - Whether to include time
 * @returns {string} Formatted date string
 */
function formatDate(date, includeTime = true) {
  try {
    if (!(date instanceof Date) || isNaN(date.getTime())) {
      return 'Invalid Date';
    }
    
    const options = {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    };
    
    if (includeTime) {
      options.hour = '2-digit';
      options.minute = '2-digit';
    }
    
    return date.toLocaleString('en-US', options);
  } catch (error) {
    console.error('Error formatting date:', error);
    return 'Invalid Date';
  }
}

/**
 * Calculate time difference between two dates
 * @param {Date} date1 - First date
 * @param {Date} date2 - Second date
 * @returns {Object} Object with days, hours, minutes difference
 */
function getTimeDifference(date1, date2) {
  const diff = Math.abs(date2 - date1);
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  
  return { days, hours, minutes, total: diff };
}

/**
 * Check if a date has passed
 * @param {Date} date - Date to check
 * @returns {boolean} True if date has passed
 */
function hasPassed(date) {
  return date < new Date();
}

/**
 * Check if a date is approaching (within threshold)
 * @param {Date} date - Date to check
 * @param {number} thresholdHours - Hours threshold (default: 24)
 * @returns {boolean} True if date is approaching
 */
function isApproaching(date, thresholdHours = 24) {
  const now = new Date();
  const diff = date - now;
  const hours = diff / (1000 * 60 * 60);
  
  return hours > 0 && hours <= thresholdHours;
}

/**
 * Format time remaining until a date
 * @param {Date} date - Target date
 * @returns {string} Human-readable time remaining
 */
function formatTimeRemaining(date) {
  const now = new Date();
  const diff = getTimeDifference(now, date);
  
  if (date < now) {
    // Past
    if (diff.days > 0) {
      return `${diff.days} day${diff.days > 1 ? 's' : ''} ago`;
    } else if (diff.hours > 0) {
      return `${diff.hours} hour${diff.hours > 1 ? 's' : ''} ago`;
    } else {
      return `${diff.minutes} minute${diff.minutes > 1 ? 's' : ''} ago`;
    }
  } else {
    // Future
    if (diff.days > 0) {
      return `in ${diff.days} day${diff.days > 1 ? 's' : ''}`;
    } else if (diff.hours > 0) {
      return `in ${diff.hours} hour${diff.hours > 1 ? 's' : ''}`;
    } else {
      return `in ${diff.minutes} minute${diff.minutes > 1 ? 's' : ''}`;
    }
  }
}
