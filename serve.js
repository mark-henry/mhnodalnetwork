var DEBUG = true;
function debug() {
  if (DEBUG) {
    console.log.apply(console, arguments);
  }
}

var express = require('express');
var bodyParser = require('body-parser');
var app = express();

var neo4j = require('neo4j');
var db = new neo4j.GraphDatabase(process.env['GRAPHSTORY_URL']);
db.params = {userId: db.id};

var Hashids = require('hashids');
var hashids = new Hashids('Smaller cap, less plastic');

var LRU = require('lru-cache');
var cache = LRU({max: 500, maxAge: 1000 * 60 * 5});

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

app.get('/api/graphs', function(req, res) {
  getAllGraphs(function(err, graphlist) {
    if (err) {
      debug('Error in GET /api/graphs:', err);
      res.status(404).end();
      return;
    }

    var response = { graphs: graphlist };
    res.json(response);
  });
});

app.get('/api/nodes/:node_slug', function(req, res) {
  var node_slug = req.params.node_slug;

  getNode(node_slug, function(err, node) {
    if (err) {
      console.log(err);
      res.status(500).end();
      return;
    }
    if (!node) {
      res.status(404).send('Node does not exist');
      return;
    }

    var response = { node: node };
    res.json(response);
  });
});

app.get('/api/graphs/:graph_slug', function(req, res) {
  var graph_slug = req.params.graph_slug;

  getGraph(graph_slug, function(err, graph) {
    if (err) {
      console.log(err);
      res.status(500).end();
      return;
    }

    var nodes = [];
    graph.nodes.forEach(function(node_slug) {
      var cachedNode = cache.get('node/' + node_slug);
      if (cachedNode) {
        nodes.push(cachedNode);
      }
    });
    
    res.json({ graph: graph, nodes: nodes });
  });
});

app.put('/api/nodes/:node_slug', function(req, res) {
  debug(req.body);

  var incomingNode = {
    name: req.body.node.name,
    desc: req.body.node.desc,
    adjacencies: req.body.node.adjacencies,
    slug: req.params.node_slug
  };

  putNode(incomingNode, function(err) {
    if (err) {
      console.log(err);
      res.status(404).end();
    }
    else {
      res.status(200).json({});
    }
  })
});

app.post('/api/nodes', function(req, res) {
  debug('Persisting node', req.body);

  var newNode = {
    name: req.body.node.name
  };

  postNode(newNode, function(err, node) {
    if (err) {
      console.log(err);
      res.status(500).end();
      return;
    }

    res.json({ node: node });
  });
});

app.put('/api/graphs/:graph_slug', function(req, res) {
  var incomingGraph = {
    name: req.body.graph.name,
    nodes: req.body.graph.nodes,
    slug: req.params.graph_slug
  };

  putGraph(incomingGraph, function(err) {
    if (err) {
      console.log(err);
      res.status(500).end();
      return;
    }

    res.status(200).json({});
  });
});

app.delete('/api/nodes/:node_slug', function(req, res) {
  deleteNode(req.params.node_slug, function(err) {
    if (err) {
      console.log(err);
      res.status(404).end();
      return;
    }

    res.status(200).json({});
  })
});

// If all else fails: send them app.html
app.get('/*', function(req, res) {
  res.sendFile(__dirname + '/public/app.html');
});


// ////
// Database utility functions

function deleteNode(node_slug, callback) {
  // Deletes the node corresponding to the given node_slug from the database.
  // param callback: function(err)
  // Returns nothing.

  var nodeid = hashids.decode(node_slug)[0];
  if (!nodeid) {
    callback('Error: Node does not exist (bad hashid)', {});
    return;
  }

  var query = 'MATCH (n:Node {id:{nodeid}})-[r]-(oth)' +
    'delete n, r return oth';
  var params = { nodeid: nodeid };
  db.query(query, params, function(err, result) {
    if (!err) {
      cache.del(node_slug);

      // For each object this node used to be connected to, refresh its cache entry
      result.forEach(function(row) {
        cache.del(hashids.encode(row['oth'].id));
      });
    }
    callback(err);
  });
}

function putGraph(graph, callback) {
  // Updates an existing graph to the database (PUT assumes that the graph
  //  already exists).
  // param graph: graph like { }
  // param callback: function(err)
  // Returns nothing.

  cache.del(graph.slug);

  // Build the query.
  // For each node in the graph, ensure a CONTAINS relationship between the 
  //  graph and that node. This keeps orphaned nodes in the graph.
  var graph_id = hashids.decode(graph.slug)[0];
  var node_ids = [];
  graph.nodes.forEach(function(node_slug) {
    node_id = hashids.decode(node_slug)[0];
    node_ids.push(node_id);
  });

  var query = 'MATCH (g:Graph {id: {graph_id}}) ' +
    'FOREACH (id in {node_ids} | ' +
      'MERGE (g)-[:CONTAINS]->(n:Node {id:id}))';
  var params = {
    graph_id: graph_id,
    node_ids: node_ids
  };

  var incomingGraph = graph;
  db.query(query, params, function(err, result) {
    if (!err) {
      slug_cache(incomingGraph);
    }
    callback(err);
  });
}

function postNode(newNode, callback) {
  // Creates a new node and returns it via callback. The returned node
  //  contains the new slug value.

  makenewid(function(err, newid) {
    if (err) {
      callback(err, {});
      return;
    }

    console.log()
    var query = 'CREATE (n:Node {name:{name}, id:{node_id}}) RETURN n, id(n)';
    var params = {
      name: newNode.name,
      node_id: newid
    };
    db.query(query, params, function(err, result) {
      if (err) {
        callback(err, {});
        return;
      }

      newNode.slug = hashids.encode(newid);
      
      slug_cache(newNode);
      callback(err, newNode);
    });
  });
}

function getAllGraphs(callback) {
  // Retrieves all Graphs from database
  // Returns: list of graphs like {slug:encoded_id}, ready for REST

  if (cache.has('graphs')) {
    callback(null, cache.get('graphs'));
    return;
  }

  db.query('MATCH (g:Graph) RETURN g', {}, function(err, result) {
    var graphlist = [];
    
    if (!err) {
      result.forEach(function(row) {
        var graphid = row['g'].id;
        var graphslug = hashids.encode(graphid);
        graphlist.push({slug:graphslug});
     });
    }

    cache.set('graphs', graphlist);
    callback(err, graphlist);
  });
}


function getNode(node_slug, callback) {
  // Retrieves a node from the database
  // Returns a REST-ready node object like
  //  { slug: encoded_slug, name, desc, adjacencies }

  if (cache.has(node_slug)) {
    debug('   Retrieved from cache');
    callback(null, cache.get(node_slug));
    return;
  }

  var nodeid = hashids.decode(node_slug)[0];
  if (!nodeid) {
    callback("Error: Node does not exist (bad hashid)", {});
    return;
  }

  var params = { nodeid: nodeid };
  var query = 'START n=node({nodeid}) OPTIONAL MATCH (n:Node)-[:EDGE]-(adj) RETURN n, adj';
  db.query(query, params, function(err, result) {
    var node = null;

    if (result && result[0]) {
      var gottenNode = result[0]["n"]
      node = {
        slug: node_slug,
        name: gottenNode.data.name,
        desc: gottenNode.data.desc
      };

      node.adjacencies = [];
      result.forEach(function(row) {
        if (row['adj']) {
          adjacentslug = hashids.encode(row['adj'].id);
          node.adjacencies.push(adjacentslug);
        }
      });
    }

    cache.set(node_slug, node);
    callback(err, node);
  });
}

function putNode(incomingNode, callback) {
  // Updates an existing node (PUT assumes that the node already exists).
  // param incomingNode: one node like { slug, name, desc, adjacencies }
  // Returns nothing.

  var nodeid = hashids.decode(incomingNode.slug)[0];

  var adjacent_ids = []
  incomingNode.adjacencies.forEach(function(adj) {
    adjacent_ids.push(hashids.decode(adj)[0]);
  });

  var query = ['MATCH (n1 {id:{nodeid}})',
    'OPTIONAL MATCH adj WHERE adj.id IN {adjacent_ids}',
    'OPTIONAL MATCH n1-[oldedge:EDGE]-()',
    'DELETE oldedge',
    'SET n1={n1props}',
    'WITH n1, adj',
    'WHERE NOT adj IS NULL',
    'MERGE (n1)-[:EDGE]->(adj)',
  ].join('\n');
  var params = {
    nodeid: nodeid,
    adjacent_ids: adjacent_ids,
    n1props: {
      name: incomingNode.name || '',
      desc: incomingNode.desc || '',
      id: nodeid
    }
  };
  debug('params for db call:', params);
  db.query(query, params, function(err) {
    if (!err) {
      slug_cache(incomingNode);
    }
    callback(err);
  });
}

function getGraph(graph_slug, callback) {
  // Fetches and returns (via callback) a graph corresponding to
  //  the provided slug.
  // If the graph does not exist, yields  a new, empty graph.
  // Has the side effect of fetching and caching all nodes
  //  in the requested graph.
  // param graph_slug: encoded slug. Once decoded, designates the id for a
  //  Graph object. Any and all nodes on any path with the Graph are
  //  considered part of the graph.
  // param callback: function of (err, response), where response is a
  //  graph object like: { slug:slug, nodes:[nodes] }

  var cache_key = 'graph/' + graph_slug;
  if (cache.has(graph_slug)) {
    callback(null, cache.get(graph_slug));
    debug(' Retrieved from cache');
    return;
  }

  var query = ['MATCH (g:Graph {id:{graphid}})--(n1:Node)',
    'OPTIONAL MATCH (n1)--(n2:Node)',
    'RETURN DISTINCT n1, n2'
    ].join('\n');
  var params = { graphid: hashids.decode(graph_slug)[0] };
  db.query(query, params, function(err, result) {
    if (err) {
      callback(err, result);
      return;
    }

    nodeSlugs = {};
    var sideload = {};

    result.forEach(function(row) {
      var n1slug = hashids.encode(row['n1'].id);
      nodeSlugs[n1slug] = n1slug;

      if (!sideload[n1slug]) {
        sideload[n1slug] = {
          slug: n1slug,
          name: row['n1'].data.name,
          desc: row['n1'].data.desc,
          adjacencies: []
        };
      }

      if (row['n2'] != null) {
        var n2slug = hashids.encode(row['n2'].id);
        sideload[n1slug].adjacencies.push(n2slug);
      }
    });

    Object.keys(sideload).forEach(function(key) {
      slug_cache(sideload[key]);
    });

    var graph = { slug: graph_slug, nodes: Object.keys(nodeSlugs) };

    slug_cache(graph);
    callback(err, graph);
  });
}

function makenewid(callback) {
  // This helper function gets a new autoincremented ID from the database.

  var query = ['MERGE (id:IDCounter)',
    'ON CREATE SET id.counter = 1',
    'ON MATCH SET id.counter = id.counter + 1',
    'RETURN id.counter AS newid'].join('\n');
  db.query(query, function(err, result) {
    if (err || result.length != 1) {
      console.log('Error making new ID:', err);
      callback(err, result);
      return;
    }

    callback(null, result[0]['newid']);
  });
}

function slug_cache(object) {
  cache.set(object.slug, object);
  debug('cached object', object.slug);
}
