function debug() {
  if (process.env.DEBUG_ON) {
    console.log.apply(console, arguments);
  }
}

var express = require('express');
var bodyParser = require('body-parser');
var persistence = require('./persistence');
var app = express();

app.set('port', (process.env.PORT || 5000));

// Initialize database on startup
async function initializeDatabase() {
  try {
    console.log('Initializing database...');
    await persistence.initializeDatabase();
    console.log('Database initialization complete!');
  } catch (error) {
    console.error('Database initialization failed:', error);
  }
}

// Start server after database initialization
initializeDatabase().then(() => {
  app.listen(app.get('port'), function() {
    console.log('Listening on port ' + app.get('port'));
  });
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
  persistence.getAllGraphs().then(function(graphlist) {
    var response = { graphs: graphlist };
    res.json(response);
  }).catch(function(err) {
    console.log(err);
    res.status(500).end();
  });
});

app.get('/api/nodes/:node_slug', function(req, res) {
  var node_slug = req.params.node_slug;
  persistence.getNode(node_slug).then(function(node) {
    if (!node) {
      res.status(404).send('Node does not exist');
      return;
    }
    var response = { node: node };
    res.json(response);
  }).catch(function(err) {
    console.log(err);
    res.status(500).end();
  });
});

app.get('/api/graphs/:graph_slug', function(req, res) {
  var graph_slug = req.params.graph_slug;
  persistence.getGraph(graph_slug).then(function(graph) {
    var nodes = graph.nodes;
    graph.nodes = Object.keys(nodes);
    res.json({ graph: graph, nodes: nodes });
  }).catch(function(err) {
    console.log(err);
    res.status(500).end();
  });
});

app.put('/api/nodes/:node_slug', function(req, res) {
  debug(req.body);

  var incomingNode = {
    graph_slug: req.body.node.graph,
    name: req.body.node.name,
    desc: req.body.node.desc,
    adjacencies: req.body.node.adjacencies,
    slug: req.params.node_slug
  };

  persistence.putNode(incomingNode).then(function(){
    res.status(200).json({});
  }).catch(function(err) {
    console.log(err);
    res.status(404).end();
  });
});

app.post('/api/nodes', function(req, res) {
  debug('Persisting node', req.body);

  var newNode = {
    name: req.body.node.name,
    graph_slug: req.body.node.graph,
  };

  persistence.postNode(newNode).then(function(node) {
    res.json({ node: node });
  }).catch(function(err) {
    console.log(err);
    res.status(500).end();
  });
});

app.put('/api/graphs/:graph_slug', function(req, res) {
  var incomingGraph = {
    name: req.body.graph.name,
    nodes: req.body.graph.nodes,
    slug: req.params.graph_slug
  };

  persistence.putGraph(incomingGraph).then(function(err) {
    res.status(200).json({});
  }).catch(function(err) {
    console.log(err);
    res.status(500).end();
  })
});

app.delete('/api/nodes/:node_slug', function(req, res) {
  persistence.deleteNode(req.params.node_slug).then(function() {
    res.status(200).json({});
  }).catch(function(err) {   
    console.log(err);
    res.status(404).end();
  });
});

// If all else fails: send them app.html
app.get('/*', function(req, res) {
  res.sendFile(__dirname + '/public/app.html');
});
