export type Metrics = {
  performance: number;
  seo: number;
  accessibility: number;
  bestPractices: number;
};

export type PhoneType = "mobile" | "landline" | "non-geographic" | "special" | "unknown" | "invalid";

export type PhoneNumberData = {
  original: string;
  normalizedNational: string | null;
  normalizedE164: string | null;
  type: PhoneType;
  prefix: string | null;
  valid: boolean;
  source: "google" | "website";
  sourceUrl: string | null;
  isMobile: boolean;
};

export type AuditDetail = {
  category: "performance" | "seo" | "accessibility" | "best-practices" | "technical";
  label: string;
  value?: string;
  severity: "high" | "medium" | "info";
};

export type Lead = Metrics & {
  placeId: string | null;
  searchOrder?: number;
  name: string;
  address: string;
  website: string;
  googleWebsiteUri?: string | null;
  resolvedWebsiteUri?: string | null;
  websiteFinal?: string | null;
  websiteMismatch?: boolean;
  maps: string;
  businessStatus: string | null;
  primaryType: string | null;
  types: string[];
  location: { latitude: number | null; longitude: number | null } | null;
  distanceKm?: number | null;
  rating: number | null;
  userRatingCount: number | null;
  email: string | null;
  emailSource?: string | null;
  phones: PhoneNumberData[];
  mobilePhones: PhoneNumberData[];
  hasMobilePhone: boolean;
  hasWebsiteMobilePhone: boolean;
  weakScore: number;
  reasons: string[];
  auditAvailable?: boolean;
  auditError?: string | null;
  auditDetails?: AuditDetail[];
};

export type OutreachRecipient = {
  name: string;
  email: string;
  website?: string;
  performance?: number;
  seo?: number;
  accessibility?: number;
  weakScore?: number;
};
