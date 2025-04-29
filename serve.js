var DEBUG = false;
function debug() {
  if (DEBUG) {
    console.log.apply(console, arguments);
  }
}

var express = require('express');
var bodyParser = require('body-parser');
var app = express();

const neo4j = require('neo4j-driver');
const driver = neo4j.driver(
  process.env['GRAPHSTORY_URL'],
  neo4j.auth.basic('neo4j', 'password'),
  { encrypted: 'ENCRYPTION_OFF' }
);

var Hashids = require('hashids');
var hashids = new Hashids('Smaller cap, less plastic');

var LRU = require('lru-cache');
var cache = LRU({max: 500, maxAge: 1000 * 60 * 5}); // Cache up to 500 items for 5 minutes.

app.set('port', (process.env.PORT || 5000));
app.listen(app.get('port'), function() {
  console.log('Listening on port ' + app.get('port'));
});

app.use('/public', express.static(__dirname + '/public'));
app.use('/favicon.ico', express.static(__dirname + '/public/favicon.ico'));

app.use(bodyParser.json());

app.use(function (req, res, next) {
  debug(req.method, req.url);
  next();
});

///
// Endpoint: /graphs/:graph_slug
//   GET / PUT / POST
// Endpoint: /nodes/:node_slug
//   GET / PUT / POST / DELETE
///

async function runQuery(query, params = {}) {
  const session = driver.session();
  try {
    const result = await session.run(query, params);
    return result;
  } finally {
    await session.close();
  }
}

function extractRecords(result) {
  return result.records.map(record => record.toObject());
}

function extractSingleRecord(result) {
  return result.records.length > 0 ? result.records[0].toObject() : null;
}

app.get('/api/graphs', async (req, res) => {
  try {
    const graphlist = await getAllGraphs();
    var response = { graphs: graphlist };
    res.json(response);
  } catch (err) {
    debug('Error in GET /api/graphs:', err);
    res.status(500).end();
  }
});

app.get('/api/nodes/:node_slug', async (req, res) => {
  var node_slug = req.params.node_slug;

  try {
    const node = await getNode(node_slug);
    if (!node) {
      res.status(404).send('Node does not exist');
      return;
    }
    var response = { node: node };
    res.json(response);
  } catch (err) {
    console.error('Error in GET /api/nodes/:node_slug:', err);
    res.status(500).end();
  }
});

app.get('/api/graphs/:graph_slug', async (req, res) => {
  var graph_slug = req.params.graph_slug;

  try {
    const graph = await getGraph(graph_slug);
    if (!graph) {
      res.status(404).send('Graph does not exist');
      return;
    }

    var nodes = [];
    for (const node_slug of graph.nodes) {
      var cachedNode = cache.get('node/' + node_slug);
      if (cachedNode) {
        nodes.push(cachedNode);
      }
    }

    res.json({ graph: graph, nodes: nodes });
  } catch (err) {
    console.error('Error in GET /api/graphs/:graph_slug:', err);
    res.status(500).end();
  }
});

app.put('/api/nodes/:node_slug', async (req, res) => {
  debug(req.body);

  var incomingNode = {
    name: req.body.node.name,
    desc: req.body.node.desc,
    adjacencies: req.body.node.adjacencies || [],
    slug: req.params.node_slug
  };

  try {
    await putNode(incomingNode);
    res.status(200).json({});
  } catch (err) {
    console.error('Error in PUT /api/nodes/:node_slug:', err);
    if (err.message.includes('bad hashid')) {
       res.status(404).send('Node does not exist (bad hashid)');
    } else {
       res.status(500).end();
    }
  }
});

app.post('/api/nodes', async (req, res) => {
  debug('Persisting node', req.body);

  var newNode = {
    name: req.body.node.name
  };
  var graph_slug = req.body.node.graph_slug;

  if (!graph_slug) {
    console.error('Error in POST /api/nodes: Missing graph_slug');
    return res.status(400).send('Missing graph context (graph_slug)');
  }

  try {
    const createdNode = await postNode(newNode, graph_slug); 
    res.json({ node: createdNode });
  } catch (err) {
    console.error('Error in POST /api/nodes:', err);
    res.status(500).end();
  }
});

app.put('/api/graphs/:graph_slug', async (req, res) => {
  var incomingGraph = {
    name: req.body.graph.name,
    nodes: req.body.graph.nodes || [],
    slug: req.params.graph_slug
  };

  try {
    await putGraph(incomingGraph);
    res.status(200).json({});
  } catch (err) {
    console.error('Error in PUT /api/graphs/:graph_slug:', err);
     if (err.message.includes('bad hashid')) {
       res.status(404).send('Graph does not exist (bad hashid)');
    } else {
       res.status(500).end();
    }
  }
});

app.delete('/api/nodes/:node_slug', async (req, res) => {
  try {
    await deleteNode(req.params.node_slug);
    res.status(200).json({});
  } catch (err) {
    console.error('Error in DELETE /api/nodes/:node_slug:', err);
    if (err.message.includes('bad hashid')) {
       res.status(404).send('Node does not exist (bad hashid)');
    } else {
       res.status(500).end();
    }
  }
});

// If all else fails: send them app.html
app.get('/*', function(req, res) {
  res.sendFile(__dirname + '/public/app.html');
});

// ////
// Database utility functions
// Also removes the node and its neighbors from the cache.
async function deleteNode(node_slug) {
  // Deletes the node corresponding to the given node_slug from the database.
  // Removes the node and its neighbors from the cache.
  const nodeid = neo4j.integer.toNumber(hashids.decode(node_slug)[0]);
  if (nodeid === undefined || nodeid === null || isNaN(nodeid)) {
    throw new Error('Error: Node does not exist (bad hashid)');
  }

  const query = `
    MATCH (n:Node {id: $nodeid})
    OPTIONAL MATCH (n)--(oth:Node) 
    WITH n, collect(distinct oth) as others
    DETACH DELETE n 
    RETURN others
  `;
  const params = { nodeid: nodeid };

  const session = driver.session();
  try {
    const result = await session.run(query, params);
    cache.del('node/' + node_slug);

    if (result.records.length > 0) {
       const others = result.records[0].get('others');
       others.forEach(function(othNode) {
         const otherId = othNode.identity;
         if (otherId) {
            cache.del('node/' + hashids.encode(neo4j.integer.toNumber(otherId)));
         }
       });
    }
    const summary = result.summary;
    if (summary.counters.updates().nodesDeleted === 0) {
        debug(`Node ${node_slug} (id: ${nodeid}) not found or already deleted.`);
    }

  } finally {
    await session.close();
  }
}

async function putGraph(graph) {
  // Updates an existing graph in the database (PUT assumes that the graph
  //  already exists). Associates the specified nodes with the graph.
  const graph_id = neo4j.integer.toNumber(hashids.decode(graph.slug)[0]);
   if (graph_id === undefined || graph_id === null || isNaN(graph_id)) {
    throw new Error('Error: Graph does not exist (bad hashid)');
  }

  cache.del('graph/' + graph.slug);

  const node_ids = graph.nodes.map(node_slug => {
     const nodeId = neo4j.integer.toNumber(hashids.decode(node_slug)[0]);
     if (nodeId === undefined || nodeId === null || isNaN(nodeId)) {
         throw new Error(`Error: Invalid node slug ${node_slug} in graph update`);
     }
     return nodeId;
  });

  const query = `
    MATCH (g:Graph {id: $graph_id})
    WITH g
    MATCH (n:Node) WHERE n.id IN $node_ids
    MERGE (g)-[:CONTAINS]->(n)
    RETURN count(n) as nodes_linked
  `;
  const params = {
    graph_id: graph_id,
    node_ids: node_ids,
  };

  const session = driver.session();
   try {
     const result = await session.run(query, params);
     if (result.records.length === 0) {
         throw new Error('Error: Graph not found during update.');
     }
     const nodesLinked = neo4j.integer.toNumber(result.records[0].get('nodes_linked'));
     debug(`Linked ${nodesLinked} nodes to graph ${graph.slug}`);

     slug_cache('graph/' + graph.slug, graph);

  } finally {
    await session.close();
  }
}

async function postNode(newNode, graph_slug) {
  // Creates a new node with the given name, associates it with the specified graph,
  // and returns the newly created node object including its slug.
  const graph_id = neo4j.integer.toNumber(hashids.decode(graph_slug)[0]);
  if (graph_id === undefined || graph_id === null || isNaN(graph_id)) {
    throw new Error(`Error: Invalid graph slug provided: ${graph_slug}`);
  }

  const newid = await makenewid();

  const query = `
    MATCH (g:Graph {id: $graph_id}) 
    CREATE (n:Node {name: $name, id: $node_id, desc: ''}) 
    MERGE (g)-[:CONTAINS]->(n) 
    RETURN n 
  `;
  const params = {
    graph_id: graph_id,
    name: newNode.name,
    node_id: newid
  };

  const session = driver.session();
  try {
     const result = await session.run(query, params);

     if (result.records.length === 0) {
       throw new Error('Failed to create node in database.');
     }

     const record = result.records[0];
     const createdNodeData = record.get('n').properties;
     const nodeSlug = hashids.encode(newid);

     const createdNode = {
       slug: nodeSlug,
       name: createdNodeData.name,
       desc: createdNodeData.desc,
       adjacencies: []
     };

     slug_cache('node/' + createdNode.slug, createdNode);
     return createdNode;

  } finally {
    await session.close();
  }
}

async function getAllGraphs() {
  // Retrieves all Graphs from the database.
  // Returns: list of graph slugs like {slug: encoded_id}.
  const cache_key = 'graphs';
  if (cache.has(cache_key)) {
    return cache.get(cache_key);
  }

  const query = 'MATCH (g:Graph) RETURN g.id as graphid';
  const result = await runQuery(query);

  const graphlist = result.records.map(record => {
    const graphid = record.get('graphid');
    const numericGraphId = neo4j.integer.toNumber(graphid);
    return { slug: hashids.encode(numericGraphId) };
  });

  cache.set(cache_key, graphlist);
  return graphlist;
}

async function getNode(node_slug) {
  // Retrieves a node from the database by its slug.
  // Returns a node object like:
  //  { slug: encoded_slug, name, desc, adjacencies: [slugs] }
  const cache_key = 'node/' + node_slug;
  if (cache.has(cache_key)) {
    debug('   Retrieved node from cache:', node_slug);
    return cache.get(cache_key);
  }

  const nodeid = neo4j.integer.toNumber(hashids.decode(node_slug)[0]);
  if (nodeid === undefined || nodeid === null || isNaN(nodeid)) {
     console.warn("Attempted to get node with bad hashid:", node_slug);
     return null;
  }

  const query = `
    MATCH (n:Node {id: $nodeid})
    OPTIONAL MATCH (n)-[:EDGE]-(adj:Node)
    RETURN n, collect(adj) as adjacencies
  `;
  const params = { nodeid: nodeid };

  const session = driver.session();
  try {
     const result = await session.run(query, params);

     if (result.records.length === 0) {
        debug("Node not found in DB:", node_slug, "ID:", nodeid);
        return null;
     }

     const record = result.records[0];
     const nodeData = record.get('n').properties;
     const adjacentNodes = record.get('adjacencies');

     const node = {
       slug: node_slug,
       name: nodeData.name,
       desc: nodeData.desc,
       adjacencies: adjacentNodes.map(adjNode => {
           const adjId = adjNode.properties.id;
           if (adjId === undefined || adjId === null) {
               console.error("Adjacent node missing 'id' property:", adjNode);
               return null;
           }
           return hashids.encode(neo4j.integer.toNumber(adjId));
       }).filter(slug => slug !== null)
     };

     slug_cache(cache_key, node);
     return node;

  } finally {
    await session.close();
  }
}

async function putNode(incomingNode) {
  // Updates an existing node (PUT assumes that the node already exists).
  // param incomingNode: one node like { slug, name, desc, adjacencies: [slugs] }
  const nodeid = neo4j.integer.toNumber(hashids.decode(incomingNode.slug)[0]);
   if (nodeid === undefined || nodeid === null || isNaN(nodeid)) {
    throw new Error('Error: Node does not exist (bad hashid)');
  }

  const cache_key = 'node/' + incomingNode.slug;

  const adjacent_ids = incomingNode.adjacencies.map(adj_slug => {
     const adjId = neo4j.integer.toNumber(hashids.decode(adj_slug)[0]);
      if (adjId === undefined || adjId === null || isNaN(adjId)) {
         throw new Error(`Error: Invalid adjacent node slug ${adj_slug} in node update`);
      }
      return adjId;
  });

  const session = driver.session();
  try {
      await session.executeWrite(async tx => {
          const updateQuery = `
              MATCH (n1:Node {id: $nodeid})
              OPTIONAL MATCH (n1)-[oldedge:EDGE]-()
              DELETE oldedge
              SET n1.name = $name, n1.desc = $desc
              WITH n1
              UNWIND $adjacent_ids as adjId
              MATCH (adj:Node {id: adjId})
              MERGE (n1)-[:EDGE]->(adj)
              RETURN count(adj) as edges_created
          `;
          const params = {
              nodeid: nodeid,
              name: incomingNode.name || '',
              desc: incomingNode.desc || '',
              adjacent_ids: adjacent_ids
          };
          debug('params for putNode:', params);
          const result = await tx.run(updateQuery, params);
          debug("Node update result summary:", result.summary.counters.updates());
      });

      cache.del(cache_key);

  } finally {
    await session.close();
  }
}

async function getGraph(graph_slug) {
  // Fetches a graph and all its contained nodes and their adjacencies.
  // Caches the graph structure and the individual nodes.
  // param graph_slug: encoded slug for the Graph object.
  // Returns a graph object like: { slug: slug, nodes: [node_slugs] }
  const cache_key = 'graph/' + graph_slug;
  if (cache.has(cache_key)) {
    debug(' Retrieved graph from cache:', graph_slug);
    return cache.get(cache_key);
  }

  const graphid = neo4j.integer.toNumber(hashids.decode(graph_slug)[0]);
  if (graphid === undefined || graphid === null || isNaN(graphid)) {
    console.warn("Attempted to get graph with bad hashid:", graph_slug);
    return null;
  }

  const query = `
    MATCH (g:Graph {id: $graphid})-[:CONTAINS]->(n1:Node)
    OPTIONAL MATCH (n1)-[:EDGE]-(n2:Node)
    RETURN g, n1, collect(n2) as neighbors
  `;
  const params = { graphid: graphid };

  const session = driver.session();
  try {
      const result = await session.run(query, params);

      if (result.records.length === 0) {
          debug("Graph not found or empty:", graph_slug, "ID:", graphid);
          return null;
      }

      const nodeSlugs = new Set();
      const nodesToCache = {};

      result.records.forEach(record => {
          const n1Node = record.get('n1');
          const n1Props = n1Node.properties;
          const n1Id = neo4j.integer.toNumber(n1Props.id);
          const n1Slug = hashids.encode(n1Id);

          nodeSlugs.add(n1Slug);

          if (!nodesToCache[n1Slug]) {
              nodesToCache[n1Slug] = {
                  slug: n1Slug,
                  name: n1Props.name,
                  desc: n1Props.desc,
                  adjacencies: new Set()
              };
          }

          const neighbors = record.get('neighbors');
          neighbors.forEach(n2Node => {
              const n2Props = n2Node.properties;
              const n2Id = neo4j.integer.toNumber(n2Props.id);
              const n2Slug = hashids.encode(n2Id);
              nodesToCache[n1Slug].adjacencies.add(n2Slug);
          });
      });

      Object.values(nodesToCache).forEach(node => {
          node.adjacencies = Array.from(node.adjacencies);
          slug_cache('node/' + node.slug, node);
      });

      const graph = { slug: graph_slug, nodes: Array.from(nodeSlugs) };

      slug_cache(cache_key, graph);
      return graph;

  } finally {
      await session.close();
  }
}

async function makenewid() {
  // Gets a new autoincremented ID from the database using a counter node.
  const query = `
    MERGE (id:IDCounter)
    ON CREATE SET id.counter = 1
    ON MATCH SET id.counter = id.counter + 1
    RETURN id.counter AS newid
  `;

  const session = driver.session();
   try {
     const result = await session.executeWrite(async tx => {
       return await tx.run(query);
     });

     if (result.records.length !== 1) {
       throw new Error('Failed to retrieve new ID from IDCounter.');
     }
     const newId = neo4j.integer.toNumber(result.records[0].get('newid'));
     return newId;

  } catch (err) {
      console.error('Error making new ID:', err);
      throw err;
  } finally {
    await session.close();
  }
}

function slug_cache(key_with_prefix, object) {
  cache.set(key_with_prefix, object);
  debug('cached object', key_with_prefix);
}

process.on('SIGINT', async () => {
  console.log('\\nGracefully shutting down from SIGINT (Ctrl-C)');
  await driver.close();
  console.log('Neo4j driver closed.');
  process.exit(0);
});
