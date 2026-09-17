/**
 * Application-wide constants. No imports: this is the bottom of the dependency
 * graph, so every other module may safely import from here.
 */

/** Schema version written into exported/saved snapshots. */
export const DATA_VERSION = 2;

export const STORAGE_KEYS = {
  invoice: "invoiceStudioPro.v2",
  templates: "invoiceStudio.templates.v1",
  brands: "invoiceStudio.brands.v1",
  sidebarWidth: "invoiceStudio.sidebarWidth"
};

/** Bounds applied to user-controlled numeric input. */
export const LIMITS = {
  logoWidth: { min: 40, max: 240, fallback: 120 },
  logoHeight: { min: 30, max: 140, fallback: 54 },
  zoom: { min: 0.6, max: 1.3, step: 0.1 },
  sidebar: { min: 320, max: 720, fallback: 430 },
  percent: { min: 0, max: 100 },
  columnWidth: { min: 5 },
  logoBytes: 3e6
};

export const DEFAULT_ACCENT = "#2563eb";
export const DEFAULT_DUE_DAYS = 14;
export const TOAST_MS = 2200;
export const PRINT_SETTLE_MS = 180;
/** Extra settle time after web fonts report ready, before opening the dialog. */
export const PRINT_FONT_SETTLE_MS = 80;
/** Undo history depth, and how long typing is coalesced into one entry. */
export const HISTORY_LIMIT = 60;
export const HISTORY_DEBOUNCE_MS = 700;

export const LOGO_HINT_DEFAULT = "PNG, JPG, WEBP or SVG. Maximum 3 MB.";
export const SIDEBAR_RESIZE_MIN_VIEWPORT = 1180;
export const XLSX_CDN = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";

/** Number of visible columns the template-specific fixed widths are designed for. */
export const FIXED_WIDTH_COLUMN_COUNT = 4;

/** Column types edited as numbers and stored as numbers. */
export const NUMERIC_COLUMN_TYPES = ["number", "currency", "percentage"];

/** Toggleable invoice sections: [key, editor label]. Keys match data-section. */
export const SECTION_DEFS = [
  ["logo", "Logo"], ["company", "Company details"], ["client", "Client details"], ["status", "Invoice status"],
  ["invoiceDate", "Invoice date"], ["dueDate", "Due date"], ["reference", "Reference / PO"], ["balance", "Balance due"],
  ["notes", "Notes"], ["discount", "Discount"], ["tax", "Tax"], ["shipping", "Shipping"], ["payment", "Payment details"],
  ["terms", "Terms"], ["footer", "Footer"]
];

/** Form controls whose values are persisted and restored verbatim. */
export const FIELD_IDS = [
  "logoWidth", "logoHeight", "logoFit", "logoAlign", "invoiceNumber", "status", "invoiceDate", "dueDate",
  "currency", "reference", "companyName", "companyReg", "companyVat", "companyAddress", "companyPhone",
  "companyEmail", "companyWebsite", "clientName", "clientContact", "clientTax", "clientAddress", "clientEmail",
  "discount", "tax", "shipping", "notes", "paymentDetails", "terms", "template", "accent", "accentHex"
];

/** Reusable seller identity and visual setup; never invoice-specific data. */
export const BRAND_FIELD_IDS = [
  "companyName", "companyReg", "companyVat", "companyAddress", "companyPhone", "companyEmail", "companyWebsite",
  "currency", "template", "accent", "accentHex", "logoWidth", "logoHeight", "logoFit", "logoAlign",
  "paymentDetails", "terms"
];

/** Field ids used by pre-v2 brand records that stored a nested company object. */
export const LEGACY_BRAND_COMPANY_FIELDS = {
  companyName: "name", companyReg: "reg", companyVat: "vat", companyAddress: "address",
  companyPhone: "phone", companyEmail: "email", companyWebsite: "website"
};

/** Status pill colours: [text, background, border]. */
export const STATUS_STYLES = {
  Draft: ["#475467", "#f2f4f7", "#d0d5dd"],
  Due: ["#18794e", "#ecfdf3", "#abefc6"],
  Paid: ["#175cd3", "#eff8ff", "#b2ddff"],
  "Partially Paid": ["#9a6700", "#fffaeb", "#fedf89"],
  Overdue: ["#b42318", "#fef3f2", "#fecdca"],
  Cancelled: ["#667085", "#f2f4f7", "#d0d5dd"]
};
export const STATUS_STYLE_FALLBACK = ["#475467", "#f2f4f7", "#d0d5dd"];

export const COMPANY_META_FALLBACK = "Add your company details";
export const CLIENT_META_FALLBACK = "Add client details";
