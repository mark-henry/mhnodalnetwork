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
  console.log(req.method, req.url);
  next();
});

app.get('/api/graphs', function(req, res) {
  if (cache.has('graphs')) {
    res.json(cache.get('graphs'));
  }
  else {
    db.query('MATCH (g:Graph) RETURN g', {}, function(err, result) {
      if (err) {
        console.log('Error in GET /api/graphs:', err);
        res.status(404).end();
        return;
      }

      var graphlist = [];

      result.forEach(function(row) {
        var graphid = row['g'].id;
        var graphslug = hashids.encode(graphid);
        graphlist.push({slug:graphslug});
      });

      var response = { graphs: graphlist };
      cache.set('graphs', response);
      res.json(response);
    });
  }
});

app.get('/api/nodes/:node_slug', function(req, res) {
  var node_slug = req.params.node_slug;
  var cache_key = 'nodes/' + node_slug;
  if (cache.has(cache_key)) {
    res.json(cache.get(cache_key));
  }
  else {
    var node = db.getNodeById(hashids.decode(node_slug), function(err, result) {
      if (err || !result) {
        res.status(404).send('Node does not exist');
      }
      else {
        var node = {};
        node.slug  = hashids.encode(result.id);
        node.name = result.data.name;
        node.desc  = result.data.desc;
        node.adjacencies = [];

        var query = 'MATCH (adj:Node)--(n:Node) WHERE id(n) = {nodeid} RETURN adj';
        var params = {nodeid: result.id};
        db.query(query, params, function(err, result) {
          if (err) {
            console.log('500 Error:', err);
            res.status(500).end();
            return;
          }

          result.forEach(function(row) {
            adjacentslug = hashids.encode(row['adj'].id);
            node.adjacencies.push(adjacentslug);
          });

          var response = { 'node': node };
          cache.set(cache_key, response);
          res.json(response);
        });
      }
    });
  }
});

app.get('/api/graphs/:graph_slug', function(req, res) {
  var graph_slug = req.params.graph_slug;

  var query = ['MATCH (g:Graph)-[*]-(n1:Node)--(n2:Node)',
    'WHERE id(g) = {graphid}',
    'RETURN n1, n2'
    ].join('\n');
  var params = {graphid: hashids.decode(req.params.graph_slug)};
  db.query(query, params, function(err, result) {
    if (err || result.length == 0) {
      res.status(404).send('Graph does not exist');
    }
    else {
      var graph = { slug: req.params.graph_slug, nodes: [] };
      var nodes = {};

      result.forEach(function(row) {
        var n1slug = hashids.encode(row['n1'].id);
        var n2slug = hashids.encode(row['n2'].id);
        graph.nodes.push(n1slug);

        if (!nodes[n1slug]) {
          nodes[n1slug] = {};
          nodes[n1slug].slug = n1slug;
          nodes[n1slug].name = row['n1'].data.name;
          nodes[n1slug].desc  = row['n1'].data.desc;
          nodes[n1slug].adjacencies = [];
        }
        nodes[n1slug].adjacencies.push(n2slug);
      });

      var response = { graph: graph, nodes: [] };

      Object.keys(nodes).forEach(function(key) {
        var node = nodes[key];
        response.nodes.push(node);

        var node_cache_key = 'nodes/' + node.slug;
        cache.set(node_cache_key, {node: node});
      });

      res.json(response);
    }
  });
});

app.put('/api/nodes/:node_slug', function(req, res) {
  var node_slug = req.params.node_slug;
  var cache_key = 'nodes/' + node_slug;
  var nodeid = hashids.decode(node_slug);
  var updatedNode = {
    name: req.body.node.name,
    desc: req.body.node.desc,
    adjacencies: req.body.node.adjacencies,
    slug: node_slug
  };

  db.getNodeById(nodeid, function(err, node) {
    if (err) {
      console.log('Error:', err);
      res.status(404).end();
      return;
    }

    node.data.name = updatedNode.name || '';
    node.data.desc = updatedNode.desc || '';

    node.save(function(err) {
      if (err) {
        console.log('500 Error:', err);
        res.status(500).end();
        return;
      }
      cache.set(cache_key, { node: updatedNode });
      res.status(200).json({}); 
    });
  });
});

app.post('/api/nodes', function(req, res) {
  console.log(req.body);

  //var query = 'CREATE (n:Node {name:})'

  req.body.node.slug = req.body.node.name;
  res.status(200).json(req.body);
});

app.put('/api/graphs/:graph_slug', function(req, res) {
  console.log(req.body);

  res.status(200).end();
});

// If all else fails: send them app.html
app.get('/*', function(req, res) {
  res.sendFile(__dirname + '/public/app.html');
});