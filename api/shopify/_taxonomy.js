// api/shopify/_taxonomy.js
// Curated Shopify STANDARD product-attribute metafields (namespace "shopify").
// Each is type list.metaobject_reference: the value is a JSON array of metaobject GIDs.
// Maps are specific to cchairandbeauty.myshopify.com but stable. Underscore prefix => not a route.
// Used by enrich.js (to show the AI the allowed values) and create-product/update-product (to write GIDs).

export const ATTRS = [
  { key: 'suitable-for-hair-type', label: 'Suitable for hair type', values: {
    'Dry':'gid://shopify/Metaobject/283700068730','All hair types':'gid://shopify/Metaobject/283700658554','Damaged':'gid://shopify/Metaobject/283700756858','Curly':'gid://shopify/Metaobject/312097735034','Dull':'gid://shopify/Metaobject/312097800570','Colored':'gid://shopify/Metaobject/313321816442','Brittle':'gid://shopify/Metaobject/385109098874','Thick':'gid://shopify/Metaobject/390829801850','Dyed':'gid://shopify/Metaobject/400457924986','Treated':'gid://shopify/Metaobject/400457957754','Sensitive':'gid://shopify/Metaobject/400457990522','Normal':'gid://shopify/Metaobject/427333157242','Fine':'gid://shopify/Metaobject/436131758458','Oily':'gid://shopify/Metaobject/439958176122','Straight':'gid://shopify/Metaobject/442540360058','Blonde':'gid://shopify/Metaobject/442948616570' } },
  { key: 'hair-type', label: 'Hair type', values: {
    'Curly':'gid://shopify/Metaobject/283703378298','Dry':'gid://shopify/Metaobject/312682643834','Wavy':'gid://shopify/Metaobject/329509044602','Straight':'gid://shopify/Metaobject/390337397114','Normal':'gid://shopify/Metaobject/390337429882' } },
  { key: 'suitable-for-skin-type', label: 'Suitable for skin type', values: {
    'All skin types':'gid://shopify/Metaobject/283702788474','Dry':'gid://shopify/Metaobject/393155707258','Combination':'gid://shopify/Metaobject/393212559738','Oily':'gid://shopify/Metaobject/393212625274','Sensitive':'gid://shopify/Metaobject/396383551866','Very dry':'gid://shopify/Metaobject/400609247610','Problem':'gid://shopify/Metaobject/401293050234' } },
  { key: 'product-form', label: 'Product form', values: {
    'Liquid':'gid://shopify/Metaobject/283699970426','Cream':'gid://shopify/Metaobject/283701215610','Lotion':'gid://shopify/Metaobject/283702952314','Mousse':'gid://shopify/Metaobject/283705278842','Solid':'gid://shopify/Metaobject/283707998586','Ointment':'gid://shopify/Metaobject/283709112698','Gel':'gid://shopify/Metaobject/312682676602','Foam':'gid://shopify/Metaobject/313241436538','Spray':'gid://shopify/Metaobject/313455870330','Powder':'gid://shopify/Metaobject/313460982138','Oil':'gid://shopify/Metaobject/324180050298','Stick':'gid://shopify/Metaobject/329124118906','Pressed powder':'gid://shopify/Metaobject/390757548410','Pencil':'gid://shopify/Metaobject/391008551290','Serum':'gid://shopify/Metaobject/397823443322','Paste':'gid://shopify/Metaobject/400150299002' } },
  { key: 'target-gender', label: 'Target gender', values: {
    'Unisex':'gid://shopify/Metaobject/283699937658','Female':'gid://shopify/Metaobject/313330565498','Male':'gid://shopify/Metaobject/313461375354' } },
  { key: 'age-group', label: 'Age group', values: {
    'Universal':'gid://shopify/Metaobject/283700691322','Adults':'gid://shopify/Metaobject/283702919546','All ages':'gid://shopify/Metaobject/283707408762','Kids':'gid://shopify/Metaobject/324178444666','Teens':'gid://shopify/Metaobject/391008027002' } },
  { key: 'hold-level', label: 'Hold level (styling products)', values: {
    'Light':'gid://shopify/Metaobject/312683266426','Medium':'gid://shopify/Metaobject/329508979066' } },
  { key: 'hair-care-finish', label: 'Hair care finish', values: {
    'Glossy':'gid://shopify/Metaobject/283705246074','Shiny':'gid://shopify/Metaobject/283708096890' } },
  { key: 'cosmetic-function', label: 'Cosmetic function', values: {
    'Brightening':'gid://shopify/Metaobject/283702690170','Hydrating':'gid://shopify/Metaobject/283702821242','Nourishing':'gid://shopify/Metaobject/283702854010','Moisturizing':'gid://shopify/Metaobject/283710095738','Soothing':'gid://shopify/Metaobject/393511829882','Protecting':'gid://shopify/Metaobject/401292099962','Repairing':'gid://shopify/Metaobject/401292132730','Healing':'gid://shopify/Metaobject/401292165498','Exfoliating':'gid://shopify/Metaobject/401292984698','Cleansing':'gid://shopify/Metaobject/427336499578' } },
  { key: 'conditioner-effect', label: 'Conditioner effect', values: {
    'Moisturizing':'gid://shopify/Metaobject/283700625786','Nourishing':'gid://shopify/Metaobject/283700724090','Strengthening':'gid://shopify/Metaobject/283700789626','Revitalizing':'gid://shopify/Metaobject/283700822394','Smoothing':'gid://shopify/Metaobject/283700855162','Anti-frizz':'gid://shopify/Metaobject/385109066106','Detangling':'gid://shopify/Metaobject/391115997562','Shine':'gid://shopify/Metaobject/396912427386','Protection':'gid://shopify/Metaobject/396912460154','Repair':'gid://shopify/Metaobject/396912492922','Color protection':'gid://shopify/Metaobject/441010323834' } },
  { key: 'skin-care-effect', label: 'Skin care effect', values: {
    'Brightening':'gid://shopify/Metaobject/283708522874','Nourishing':'gid://shopify/Metaobject/283708555642','Whitening':'gid://shopify/Metaobject/283708588410','Hydrating':'gid://shopify/Metaobject/312098619770','Refreshing':'gid://shopify/Metaobject/312098685306','Moisturizing':'gid://shopify/Metaobject/312098718074','Cleansing':'gid://shopify/Metaobject/313462849914','Pore refining':'gid://shopify/Metaobject/313462882682','Revitalizing':'gid://shopify/Metaobject/329130967418','Protection':'gid://shopify/Metaobject/346350387578','Anti-dark circle':'gid://shopify/Metaobject/391010091386','Anti-redness':'gid://shopify/Metaobject/391010156922','Anti-blemish':'gid://shopify/Metaobject/391010189690','Soothing':'gid://shopify/Metaobject/393212526970','Anti-aging':'gid://shopify/Metaobject/393288188282','Firming':'gid://shopify/Metaobject/396383584634','Anti-puffiness':'gid://shopify/Metaobject/396383617402','Repairing':'gid://shopify/Metaobject/396756156794','Anti-wrinkle':'gid://shopify/Metaobject/397823508858','Regenerating':'gid://shopify/Metaobject/397823541626','Smoothing':'gid://shopify/Metaobject/397823607162','Illuminating':'gid://shopify/Metaobject/397823639930','Healing':'gid://shopify/Metaobject/397823672698','Exfoliating':'gid://shopify/Metaobject/400150331770','Purifying':'gid://shopify/Metaobject/400150364538','Anti-acne':'gid://shopify/Metaobject/401292296570','Anti-dark spot':'gid://shopify/Metaobject/401292329338','Softening':'gid://shopify/Metaobject/401292362106','Strengthening':'gid://shopify/Metaobject/401292394874','Uneven skin tone':'gid://shopify/Metaobject/449743847802' } }
];

// Build the metafields array for ProductInput / productUpdate from AI-chosen labels.
// chosen = { 'product-form': ['Cream'], 'suitable-for-hair-type': ['Curly','Dry'], ... }
export function attrMetafields(chosen) {
  const out = [];
  if (!chosen || typeof chosen !== 'object') return out;
  for (const def of ATTRS) {
    const picked = chosen[def.key];
    if (!Array.isArray(picked) || !picked.length) continue;
    const gids = [];
    for (const label of picked) {
      const gid = def.values[label] || def.values[String(label).trim()];
      if (gid && gids.indexOf(gid) < 0) gids.push(gid);
    }
    if (gids.length) {
      out.push({ namespace: 'shopify', key: def.key, type: 'list.metaobject_reference', value: JSON.stringify(gids) });
    }
  }
  return out;
}

// Compact text block of allowed values, for the AI prompt.
export function attrOptionsText() {
  return ATTRS.map(d => '- ' + d.key + ' (' + d.label + '): ' + Object.keys(d.values).join(', ')).join('\n');
}

// ── Taxonomy categories ───────────────────────────────────────────────────────
// Shopify's standard attribute metafields are category-gated: a product must be
// assigned a taxonomy category before its attributes are accepted. These three
// categories cover the vast majority of CC's listable stock. `keys` are the
// attributes that are actually valid for that category (verified against the
// metafield-definition constraints), so we only ever write valid ones.
export const TAXO_CATEGORIES = [
  { label: 'Hair Care', gid: 'gid://shopify/TaxonomyCategory/hb-3-10',
    hint: 'shampoo, conditioner, hair oil, leave-in, hair treatment/masque, hair lotion, hair food, braid spray, relaxer, hair serum, scalp care, moisturiser for hair',
    keys: ['suitable-for-hair-type', 'hair-type', 'hair-care-finish', 'conditioner-effect'] },
  { label: 'Hair Styling Products', gid: 'gid://shopify/TaxonomyCategory/hb-3-10-10',
    hint: 'styling gel, edge control / edge tamer, hair wax, pomade, mousse, holding or finishing spray, curl custard, styling gum, setting lotion',
    keys: ['hold-level', 'hair-care-finish', 'suitable-for-hair-type', 'hair-type', 'conditioner-effect'] },
  { label: 'Skin Care', gid: 'gid://shopify/TaxonomyCategory/hb-3-2-9',
    hint: 'body butter, body/hand/face lotion or cream, shea/cocoa butter, skin serum, body oil, petroleum jelly, soap, skin moisturiser',
    keys: ['suitable-for-skin-type', 'product-form', 'cosmetic-function', 'skin-care-effect'] }
];

export function categoryFor(label) {
  if (!label) return null;
  const l = String(label).trim().toLowerCase();
  for (const c of TAXO_CATEGORIES) if (c.label.toLowerCase() === l) return c;
  return null;
}

export function categoryOptionsText() {
  return TAXO_CATEGORIES.map(c => '- ' + c.label + ': ' + c.hint).join('\n');
}
