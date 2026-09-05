export type LeadStatus = "not_contacted" | "contacted" | "replied" | "interested" | "client";
export type OutreachStatus = "new" | "contacted" | "replied" | "interested" | "client" | "not_interested";

export type LeadHistoryAction =
  | "created"
  | "analyzed"
  | "instagram_found"
  | "message_generated"
  | "copied_message"
  | "opened_instagram"
  | "status_changed"
  | "note_added"
  | "tag_added";

export type InstagramInfo = {
  username: string | null;
  url: string | null;
  followers?: number | null;
  source?: "website" | "contact-page" | "google" | "bio" | "manual" | null;
};

export type WebsiteAnalysis = {
  speed: number;
  design: number;
  mobile: number;
  seo: number;
  weakScore: number;
  issues: string[];
  opportunities: string[];
  contactPage?: string | null;
  hasHttps?: boolean;
  hasTitle?: boolean;
  hasDescription?: boolean;
  hasInstagram?: boolean;
  hasContactCta?: boolean;
  analyzedAt: string;
};

export type LeadHistoryItem = {
  id: string;
  action: LeadHistoryAction;
  label: string;
  date: string;
};

export type CrmLead = {
  id: string;
  name: string;
  company: string;
  address: string;
  website: string;
  maps: string;
  googleMapsUrl: string;
  rating: number | null;
  phone?: string | null;
  email: string | null;
  emailSource?: string | null;
  instagram: InstagramInfo;
  contactPage?: string | null;
  screenshotUrl?: string | null;
  performance: number;
  seo: number;
  accessibility: number;
  bestPractices: number;
  design: number;
  mobile: number;
  speed: number;
  weakScore: number;
  reasons: string[];
  issues: string[];
  opportunities: string[];
  status: LeadStatus;
  outreachStatus?: OutreachStatus;
  contactCount?: number;
  lastContactedPhone?: string | null;
  lastContactMessage?: string | null;
  notes: string[];
  tags: string[];
  history: LeadHistoryItem[];
  lastAction?: string | null;
  contactedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  niche?: string;
};

export type Lead = CrmLead;

export type OutreachRecipient = {
  name: string;
  email: string;
  website?: string;
  performance?: number;
  seo?: number;
  accessibility?: number;
  weakScore?: number;
};
