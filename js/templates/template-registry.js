/**
 * Central registry of invoice templates.
 *
 * Adding a template means creating a descriptor module and registering it in
 * app.js. No other module needs to change: the renderer, the print module and
 * the Design tab all read capabilities from the descriptor rather than testing
 * template names.
 *
 * @typedef {Object} TemplateLabels
 * @property {string} title @property {string} bill @property {string} status
 * @property {string} balance @property {string} note @property {string} payment
 * @property {string} terms @property {string} date @property {string} due
 * @property {string} ref
 *
 * @typedef {Object} TemplateCapabilities
 * @property {string}  invoiceNoPrefix
 * @property {Function} formatDate               Date formatter for meta rows.
 * @property {Function} companyMeta              Builds the seller address block.
 * @property {boolean} structuredPayment         Render payment as a key/value table.
 * @property {boolean} repairNoteTypo
 * @property {boolean} hideReferenceRowWhenEmpty
 * @property {boolean} paymentIgnoresSectionToggle
 * @property {boolean} dropRateWhenAmount        Hide Rate when Amount is present.
 * @property {boolean} dropSkuWhenDescription
 * @property {string[]|null} fixedColumnWidths   Applied at 4 visible columns.
 * @property {{byKey: Object, byRole: Object}|null} headerLabels
 * @property {boolean} showTableTotalRow
 * @property {boolean} separatePaymentPage       Payment starts a new printed page.
 *
 * @typedef {Object} TemplateDescriptor
 * @property {string} id @property {string} name @property {string} cssClass
 * @property {string} fontStack
 * @property {TemplateLabels} labels
 * @property {TemplateCapabilities} capabilities
 */

/** @type {Map<string, TemplateDescriptor>} */
const registry = new Map();

let fallbackId = null;

/** Registers a template. The first one registered becomes the fallback. */
export function register(template) {
  if (!template || !template.id) throw new Error("Template descriptor needs an id.");
  registry.set(template.id, template);
  if (fallbackId === null) fallbackId = template.id;
  return template;
}

export const has = id => registry.has(id);

export const list = () => [...registry.values()];

export const ids = () => [...registry.keys()];

/**
 * Resolves a template descriptor. Unknown ids fall back to the first
 * registered template so a corrupt import cannot break rendering.
 */
export function get(id) {
  return registry.get(id) || registry.get(fallbackId);
}

/** Test seam. */
export function reset() {
  registry.clear();
  fallbackId = null;
}
