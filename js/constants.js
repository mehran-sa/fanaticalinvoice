/**
 * Application-wide constants. No imports: this is the bottom of the dependency
 * graph, so every other module may safely import from here.
 */

/**
 * App release. index.html carries the same value in <meta name="sa-app-version">;
 * a mismatch means the browser mixed cached files from two releases.
 */
export const APP_VERSION = "2.10.1";

/**
 * Paper sizes a template can print on (capabilities.paper, default "a4").
 * Later printed pages have a 12mm top margin (js/print/print-styles.js).
 */
export const PAPER_SIZES = {
  a4: { id: "a4", label: "A4", width: 210, height: 297 },
  letter: { id: "letter", label: "US Letter", width: 215.9, height: 279.4 }
};
export const NEXT_PAGE_TOP_MARGIN_MM = 12;
export const paperFor = template => PAPER_SIZES[template?.capabilities?.paper] || PAPER_SIZES.a4;

/** Schema version written into exported/saved snapshots. */
export const DATA_VERSION = 2;

/**
 * localStorage keys. These keep their original names after the rename to
 * SA Invoice Generator so that invoices, templates and brands saved by earlier
 * versions are still found. Do not rename them.
 */
export const STORAGE_KEYS = {
  invoice: "invoiceStudioPro.v2",
  /** Copy of an autosave that could not be read, kept instead of overwritten. */
  invoiceBackup: "invoiceStudioPro.v2.unreadableBackup",
  templates: "invoiceStudio.templates.v1",
  brands: "invoiceStudio.brands.v1",
  sidebarWidth: "invoiceStudio.sidebarWidth",
  /* Added in 2.2.0: the saved-invoices library, logos shared by those
     invoices, the client address book and the last full backup time. */
  invoiceIndex: "invoiceStudio.invoiceIndex.v1",
  invoiceRecordPrefix: "invoiceStudio.invoice.",
  logos: "invoiceStudio.logos.v1",
  /** Keys present in the logos map: small, so it can be checked on every save. */
  logoIndex: "invoiceStudio.logoIndex.v1",
  clients: "invoiceStudio.clients.v1",
  lastBackupAt: "invoiceStudio.lastBackupAt",
  /* Added in 2.4.0: dismissed privacy note, snoozed backup reminder. */
  privacyNoticeHidden: "invoiceStudio.privacyNoticeHidden",
  backupReminderSnoozedUntil: "invoiceStudio.backupReminderSnoozedUntil",
  undoHintShown: "invoiceStudio.undoHintShown",
  /** Which sidebar panels were left open (added in 2.6.0). */
  panelsOpen: "invoiceStudio.panelsOpen"
};

/** "Later" on the backup reminder hides it for this many days. */
export const BACKUP_SNOOZE_DAYS = 7;

/** Days without a full backup before the app suggests making one. */
export const BACKUP_REMINDER_DAYS = 30;

/** Bounds applied to user-controlled numeric input. */
export const LIMITS = {
  logoWidth: { min: 40, max: 240, fallback: 120 },
  logoHeight: { min: 30, max: 140, fallback: 54 },
  /* min 0.3 so the A4 page can fit a phone screen ("Fit"). */
  zoom: { min: 0.3, max: 1.3, step: 0.1 },
  sidebar: { min: 320, max: 720, fallback: 430 },
  percent: { min: 0, max: 100 },
  columnWidth: { min: 5 },
  logoBytes: 3e6,
  /** Raster logos larger than this (longest side, px) are scaled down on upload. */
  logoMaxSide: 1200
};

/** Typing edits are written to storage after this pause rather than per key. */
export const AUTOSAVE_TYPING_DELAY_MS = 300;

/** StaffAsia green: the default accent for new invoices (saved invoices keep theirs). */
export const DEFAULT_ACCENT = "#46b751";
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
/**
 * Excel parsing worker. It loads SheetJS 0.20.3 from js/vendor, so Excel import
 * works offline and never contacts a CDN. Resolved relative to index.html.
 */
export const XLSX_WORKER_SRC = "js/import-export/xlsx-worker.js";
/** A spreadsheet that takes longer than this to parse is stopped. */
export const XLSX_PARSE_TIMEOUT_MS = 30000;

/** Number of visible columns the template-specific fixed widths are designed for. */
export const FIXED_WIDTH_COLUMN_COUNT = 4;

/**
 * Line-item property holding an amount taken as-is from an imported statement,
 * used only when the statement's quantity is 0 (quantity x rate cannot express
 * a non-zero amount then). Column keys can never contain "$", so this cannot
 * collide with a column. Editing the line's quantity or rate removes it.
 */
export const FIXED_AMOUNT_KEY = "$fixedAmount";

/** Column types edited as numbers and stored as numbers. */
export const NUMERIC_COLUMN_TYPES = ["number", "currency", "percentage"];

/** Toggleable invoice sections: [key, editor label]. Keys match data-section. */
export const SECTION_DEFS = [
  ["logo", "Logo"], ["company", "Company details"], ["client", "Client details"],
  ["invoiceDate", "Invoice date"], ["dueDate", "Due date"], ["reference", "Reference / PO"], ["balance", "Balance due"],
  ["notes", "Notes"], ["discount", "Discount"], ["tax", "Tax"], ["shipping", "Shipping"], ["payment", "Payment details"],
  ["terms", "Terms"], ["footer", "Footer"]
];

/**
 * Form controls whose values are persisted and restored verbatim.
 * Invoice status was removed in 2.2.0; a "status" value in older saved data or
 * files is ignored.
 */
export const FIELD_IDS = [
  "logoWidth", "logoHeight", "logoFit", "logoAlign", "logoFallback",
  "watermarkType", "watermarkText", "watermarkOpacity", "watermarkSize", "watermarkAngle", "watermarkLayout", "watermarkColor",
  "invoiceNumber", "invoiceDate", "dueDate",
  "currency", "reference", "companyName", "companyReg", "companyVat", "companyAddress", "companyPhone",
  "companyEmail", "companyWebsite", "clientName", "clientContact", "clientTax", "clientAddress", "clientEmail",
  "discount", "tax", "shipping", "notes", "paymentDetails", "terms", "template", "accent", "accentHex"
];

/** Reusable seller identity and visual setup; never invoice-specific data. */
export const BRAND_FIELD_IDS = [
  "companyName", "companyReg", "companyVat", "companyAddress", "companyPhone", "companyEmail", "companyWebsite",
  "currency", "template", "accent", "accentHex", "logoWidth", "logoHeight", "logoFit", "logoAlign", "logoFallback",
  "watermarkType", "watermarkText", "watermarkOpacity", "watermarkSize", "watermarkAngle", "watermarkLayout", "watermarkColor",
  "paymentDetails", "terms"
];

/** Field ids used by pre-v2 brand records that stored a nested company object. */
export const LEGACY_BRAND_COMPANY_FIELDS = {
  companyName: "name", companyReg: "reg", companyVat: "vat", companyAddress: "address",
  companyPhone: "phone", companyEmail: "email", companyWebsite: "website"
};

export const COMPANY_META_FALLBACK = "Add your company details";
export const CLIENT_META_FALLBACK = "Add client details";
