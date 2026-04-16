/**
 * INPUT VALIDATION UTILITIES
 * Validates GPS coordinates, bus IDs, and user input
 */

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Validate GPS Latitude (-90 to 90)
 */
export function validateLatitude(lat: any): number {
  const num = Number(lat);
  if (isNaN(num) || num < -90 || num > 90) {
    throw new ValidationError(`Invalid latitude: ${lat}. Must be between -90 and 90`);
  }
  return num;
}

/**
 * Validate GPS Longitude (-180 to 180)
 */
export function validateLongitude(lng: any): number {
  const num = Number(lng);
  if (isNaN(num) || num < -180 || num > 180) {
    throw new ValidationError(`Invalid longitude: ${lng}. Must be between -180 and 180`);
  }
  return num;
}

/**
 * Validate Bus ID (non-empty string)
 */
export function validateBusId(busId: any): string {
  if (!busId || typeof busId !== 'string' || busId.trim().length === 0) {
    throw new ValidationError(`Invalid bus ID: ${busId}`);
  }
  return busId.trim();
}

/**
 * Validate GPS Accuracy (0-100 meters typical)
 */
export function validateAccuracy(accuracy: any): number | undefined {
  if (accuracy === null || accuracy === undefined) return undefined;
  const num = Number(accuracy);
  if (isNaN(num) || num < 0) {
    throw new ValidationError(`Invalid accuracy: ${accuracy}`);
  }
  return num;
}

/**
 * Validate Speed (0-200 km/h typical)
 */
export function validateSpeed(speed: any): number | undefined {
  if (speed === null || speed === undefined) return undefined;
  const num = Number(speed);
  if (isNaN(num) || num < 0 || num > 300) {
    throw new ValidationError(`Invalid speed: ${speed}`);
  }
  return num;
}

/**
 * Validate Email Format
 */
export function validateEmail(email: any): string {
  if (!email || typeof email !== 'string') {
    throw new ValidationError(`Invalid email: ${email}`);
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new ValidationError(`Invalid email format: ${email}`);
  }
  return email.toLowerCase();
}

/**
 * Validate Phone Number (basic)
 */
export function validatePhoneNumber(phone: any): string {
  if (!phone || typeof phone !== 'string') {
    throw new ValidationError(`Invalid phone: ${phone}`);
  }
  const phoneRegex = /^\+?[\d\s\-()]{10,}$/;
  if (!phoneRegex.test(phone)) {
    throw new ValidationError(`Invalid phone format: ${phone}`);
  }
  return phone;
}

/**
 * Validate Non-empty String
 */
export function validateString(value: any, fieldName: string, minLength = 1, maxLength = 255): string {
  if (!value || typeof value !== 'string') {
    throw new ValidationError(`${fieldName} must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed.length < minLength || trimmed.length > maxLength) {
    throw new ValidationError(`${fieldName} must be between ${minLength} and ${maxLength} characters`);
  }
  return trimmed;
}

/**
 * Validate Number Range
 */
export function validateNumberRange(value: any, fieldName: string, min: number, max: number): number {
  const num = Number(value);
  if (isNaN(num) || num < min || num > max) {
    throw new ValidationError(`${fieldName} must be between ${min} and ${max}`);
  }
  return num;
}

/**
 * Sanitize String (remove special characters that could cause injection)
 */
export function sanitizeString(str: string): string {
  return str
    .trim()
    .replace(/[<>\"'`]/g, '') // Remove potential XSS characters
    .substring(0, 255);
}

export default {
  ValidationError,
  validateLatitude,
  validateLongitude,
  validateBusId,
  validateAccuracy,
  validateSpeed,
  validateEmail,
  validatePhoneNumber,
  validateString,
  validateNumberRange,
  sanitizeString,
};
