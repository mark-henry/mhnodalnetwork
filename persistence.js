const { Client } = require('pg');

var Hashids = require('hashids');
var hashids = new Hashids('Smaller cap, less plastic');

var LRU = require('lru-cache');
var cache = LRU({max: 1000, maxAge: 1000 * 60 * 5});

function debug() {
  if (process.env.DEBUG_ON) {
    console.log.apply(console, arguments);
  }
}

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

client.connect();

/**
 * Deletes the node corresponding to the given node_slug from the database.
 * @returns nothing
 */
exports.deleteNode = async function deleteNode(node_slug) {
  var nodeid = hashids.decode(node_slug)[0];
  if (!nodeid) {
    throw new Error('Node does not exist (bad hashid)');
  }

  await client.query('DELETE FROM nodes WHERE id = $1', [nodeid]);

  // For each object this node used to be connected to, refresh its cache entry
  cache.get(node_slug).adjacencies.forEach(function(adjacent) {
    cache.del(adjacent);
  });
  cache.del(node_slug);
};

/**
 * Persists a new graph or updates an existing graph to the database
 * @param {name: string, slug: string} graph - graph object
 */
exports.putGraph = async function putGraph(graph) {
  const graphid = hashids.decode(graph.slug)[0];
  if (!graphid) {
    throw new Error('Node does not exist (bad hashid)');
  }
  await client.query(
    `INSERT INTO graphs (id, name) VALUES ($1, $2)
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
    [graphid, graph.name]);

  cache.del(graph.slug);
}

/**
 * Creates a new node and returns it. The returned node contains the new slug id.
 * @param {name, desc} newNode 
 * @returns the new node
 */
exports.postNode = async function postNode(node) {
  var graph_id = hashids.decode(node.graph_slug)[0];
  if (!graph_id) {
    throw new Error('Graph does not exist (bad hashid)');
  }

  var res = await client.query(
    `INSERT INTO nodes (graph_id, name, descr)
    VALUES ($1, $2, $3) RETURNING *`,
    [graph_id, node.name, node.desc]);

  var newNode = res.rows[0];
  newNode.slug = hashids.encode(newNode.id);
  slug_cache(newNode);
  return newNode;
}

/**
 * Retrieves all Graphs from the database
 * @returns {list} list of graphs like {slug:encoded_id}
 */
exports.getAllGraphs = async function getAllGraphs() {
  var res = await client.query('SELECT * FROM graphs');

  return res.rows.map(row => {
    row.slug = hashids.encode(row.id);
  });
}

/**
 * Retrieves a node from the database
 * @returns a node object like { slug: encoded_slug, name, desc, adjacencies }
 */
exports.getNode = async function getNode(node_slug) {
  if (cache.has(node_slug)) {
    debug('   Retrieved from cache');
    return cache.get(node_slug);
  }

  var nodeid = hashids.decode(node_slug)[0];
  if (!nodeid) {
    throw new Error(`Node ${node_slug} does not exist (bad hashid)`);
  }

  const node_res = await client.query(
    'SELECT name, descr from nodes WHERE id = $1;', [nodeid]);
  if (!node_res.rows.length) {
    throw new Error(`Node ${nodeid} does not exist`);
  }
  var node = node_res.rows[0];
  node.slug = node_slug;

  const adj_res = await client.query(
    `SELECT n2 FROM edges WHERE n1 = $1 UNION
    SELECT n1 FROM edges WHERE n2 = $1`, [nodeid]);
  node.adjacencies = adj_res.rows.map(row => {
    return hashids.encode(row.n1 || row.n2);
  });

  return node;
}

/**
 * Updates an existing node.
 * @param node { slug, name, desc, adjacencies }
 */
exports.putNode = async function putNode(node) {
  var nodeId = hashids.decode(node.slug)[0];
  if (!nodeId) {
    throw new Error('Node does not exist (bad hashid)');
  }

  var graphId = hashids.decode(node.graph_slug)[0];
  if (!graphId) {
    throw new Error('Graph does not exist (bad hashid)');
  }

  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO nodes (graph_id, id, name, descr) VALUES ($1, $2, $3, $4)
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, descr = EXCLUDED.descr`,
      [graphId, nodeId, node.name, node.desc]);
    await client.query('INSERT INTO edges (n1, n2) VALUES ' +
      node.adjacencies.map(adj => {
        var adjId = hashids.decode(adj)[0];
        return `(${Math.min(nodeId, adjId)}, ${Math.max(nodeId, adjId)})`;
      }).join(', ') +
      ' ON CONFLICT (n1, n2) DO NOTHING');
    await client.query('COMMIT');
    slug_cache(node);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
}

/**
 * Fetches the graph corresponding to the provided slug, or a new empty graph
 * if no corresponding graph exists.
 * @param graph_slug encoded slug. Once decoded, designates the id for a
 * Graph object.
 * @returns graph object like: { slug: slug, nodes: [{slug, name, desc, adjacencies: [slug]}] }
 */
exports.getGraph = async function getGraph(graph_slug) {
  var graphid = hashids.decode(graph_slug)[0];
  if (!graphid) {
    throw new Error('Graph does not exist (bad hashid)');
  }

  const res = await client.query('SELECT name FROM graphs WHERE id = $1', [graphid]);
  if (!res.rows.length) {
    debug(`Graph ${graphid} does not exist, creating an empty graph`);
    await client.query('INSERT INTO graphs (id) VALUES ($1)', [graphid]);
    return { slug: graph_slug, nodes: [] };
  }
  
  const graph = res.rows[0];
  graph.slug = graph_slug;
  const nodes_res = await client.query(
    `SELECT nodes.id, nodes.name, nodes.descr, edges.n1, edges.n2 
    FROM nodes LEFT OUTER JOIN edges ON 
    (nodes.id = edges.n1 or nodes.id = edges.n2) 
    WHERE nodes.graph_id = $1`,
    [graphid]);
  const nodes = {};
  nodes_res.rows.forEach(row => {
    const id_slug = hashids.encode(row.id);
    nodes[id_slug] = nodes[id_slug] || { slug: id_slug, adjacencies: {} };
    nodes[id_slug].name = row.name;
    nodes[id_slug].desc = row.descr;

    if (!row.n1) { return }
    const n1_slug = hashids.encode(row.n1);
    const n2_slug = hashids.encode(row.n2);
    nodes[n1_slug] = nodes[n1_slug] || { slug: n1_slug, adjacencies: {} };
    nodes[n2_slug] = nodes[n2_slug] || { slug: n2_slug, adjacencies: {} };
    
    nodes[n1_slug].adjacencies[n2_slug] = true;
    nodes[n2_slug].adjacencies[n1_slug] = true;
  }, []);
  Object.values(nodes).forEach(node => {
    node.adjacencies = Object.keys(node.adjacencies);
  });
  graph.nodes = nodes;
  return graph;
}

/**
 * Cache an object in the slug cache
 */
function slug_cache(object) {
  cache.set(object.slug, object);
  debug('cached object', object.slug, object);
}