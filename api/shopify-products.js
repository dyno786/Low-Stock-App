// api/shopify-products.js
// Fetches all Shopify product barcodes using GraphQL bulk operations.
//
// Three modes (via ?action= query param):
//   ?action=start   → submits bulk query, returns {operationId}
//   ?action=poll&id=<id>  → checks status; if done, downloads JSONL and returns barcodes
//   (default GET)   → checks for existing recent operation, starts new one if needed

export const config = { runtime: 'edge' };

const API_VERSION = '2024-04';

const BULK_QUERY = `
{
  products {
    edges {
      node {
        id
        title
        variants {
          edges {
            node {
              id
              barcode
            }
          }
        }
      }
    }
  }
}`.trim();

const BULK_RUN_MUTATION = `
mutation {
  bulkOperationRunQuery(
    query: """
${BULK_QUERY}
"""
  ) {
    bulkOperation {
      id
      status
    }
    userErrors {
      field
      message
    }
  }
}`;

const CURRENT_OP_QUERY = `
{
  currentBulkOperation(type: QUERY) {
    id
    status
    errorCode
    createdAt
    completedAt
    objectCount
    fileSize
    url
    partialDataUrl
  }
}`;

const OP_BY_ID_QUERY = (id) => `
{
  node(id: "${id}") {
    ... on BulkOperation {
      id
      status
      errorCode
      createdAt
      completedAt
      objectCount
      fileSize
      url
      partialDataUrl
    }
  }
}`;

async function shopifyGraphQL(store, token, query) {
  const res = await fetch(`https://${store}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query })
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Shopify GraphQL ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  if (data.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(data.errors).slice(0, 200)}`);
  }
  return data.data;
}

async function startBulkOp(store, token) {
  const data = await shopifyGraphQL(store, token, BULK_RUN_MUTATION);
  const r = data.bulkOperationRunQuery;
  if (r.userErrors && r.userErrors.length) {
    const errMsg = r.userErrors.map(e => e.message).join('; ');
    if (errMsg.toLowerCase().includes('already in progress')) {
      const cur = await shopifyGraphQL(store, token, CURRENT_OP_QUERY);
      if (cur.currentBulkOperation) return cur.currentBulkOperation;
    }
    throw new Error(errMsg);
  }
  return r.bulkOperation;
}

async function checkOp(store, token, id) {
  if (id) {
    const data = await shopifyGraphQL(store, token, OP_BY_ID_QUERY(id));
    return data.node;
  }
  const data = await shopifyGraphQL(store, token, CURRENT_OP_QUERY);
  return data.currentBulkOperation;
}

async function downloadAndParse(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
  const text = await res.text();

  const products = {};
  const barcodes = {};

  text.split('\n').forEach(line => {
    if (!line.trim()) return;
    let obj;
    try { obj = JSON.parse(line); } catch { return; }
    if (obj.id && obj.id.includes('/Product/')) {
      products[obj.id] = obj.title || '';
    } else if (obj.id && obj.id.includes('/ProductVariant/')) {
      const bc = (obj.barcode || '').trim();
      if (bc) {
        const productGid = obj.__parentId || '';
        const productId = productGid.split('/').pop();
        const variantId = obj.id.split('/').pop();
        barcodes[bc] = {
          productId,
          variantId,
          title: products[productGid] || ''
        };
      }
    }
  });

  return barcodes;
}

export default async function handler(req) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
  };
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: cors });

  const store = process.env.SHOPIFY_STORE;
  const token = process.env.SHOPIFY_TOKEN;
  if (!store || !token) {
    return new Response(JSON.stringify({
      error: 'Missing SHOPIFY_STORE or SHOPIFY_TOKEN env vars'
    }), { status: 500, headers: cors });
  }

  const url = new URL(req.url);
  const action = url.searchParams.get('action') || 'auto';
  const requestedId = url.searchParams.get('id') || '';

  try {
    if (action === 'start') {
      const op = await startBulkOp(store, token);
      return new Response(JSON.stringify({
        status: op.status,
        operationId: op.id
      }), { status: 200, headers: { ...cors, 'Cache-Control': 'no-store' } });
    }

    if (action === 'poll') {
      const op = await checkOp(store, token, requestedId);
      if (!op) {
        return new Response(JSON.stringify({
          error: 'Bulk operation not found',
          operationId: requestedId
        }), { status: 404, headers: cors });
      }
      if (op.status === 'COMPLETED' && op.url) {
        const barcodes = await downloadAndParse(op.url);
        return new Response(JSON.stringify({
          status: 'COMPLETED',
          operationId: op.id,
          count: Object.keys(barcodes).length,
          objectCount: op.objectCount ? parseInt(op.objectCount) : null,
          barcodes
        }), {
          status: 200,
          headers: { ...cors, 'Cache-Control': 's-maxage=600, stale-while-revalidate=1800' }
        });
      }
      if (op.status === 'FAILED' || op.status === 'CANCELED' || op.status === 'EXPIRED') {
        return new Response(JSON.stringify({
          status: op.status,
          operationId: op.id,
          errorCode: op.errorCode || null,
          error: `Bulk op ended in ${op.status}` + (op.errorCode ? ` (${op.errorCode})` : '')
        }), { status: 200, headers: cors });
      }
      return new Response(JSON.stringify({
        status: op.status,
        operationId: op.id,
        objectCount: op.objectCount ? parseInt(op.objectCount) : 0
      }), { status: 200, headers: { ...cors, 'Cache-Control': 'no-store' } });
    }

    // Default "auto" mode
    const current = await checkOp(store, token);
    if (current && current.status === 'COMPLETED' && current.url) {
      const barcodes = await downloadAndParse(current.url);
      return new Response(JSON.stringify({
        status: 'COMPLETED',
        operationId: current.id,
        count: Object.keys(barcodes).length,
        objectCount: current.objectCount ? parseInt(current.objectCount) : null,
        barcodes,
        reused: true
      }), {
        status: 200,
        headers: { ...cors, 'Cache-Control': 's-maxage=600, stale-while-revalidate=1800' }
      });
    }
    if (current && (current.status === 'RUNNING' || current.status === 'CREATED')) {
      return new Response(JSON.stringify({
        status: current.status,
        operationId: current.id,
        objectCount: current.objectCount ? parseInt(current.objectCount) : 0,
        message: 'Bulk op already running — poll until complete'
      }), { status: 200, headers: { ...cors, 'Cache-Control': 'no-store' } });
    }
    const op = await startBulkOp(store, token);
    return new Response(JSON.stringify({
      status: op.status,
      operationId: op.id,
      message: 'New bulk op started — poll until complete'
    }), { status: 200, headers: { ...cors, 'Cache-Control': 'no-store' } });

  } catch (e) {
    return new Response(JSON.stringify({
      error: e.message || 'Unknown error',
      action
    }), { status: 500, headers: cors });
  }
}
