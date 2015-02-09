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
      if (err) throw err;

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
      if (err) throw err;
      if (!result) {
        res.status(404).send('Node does not exist');
      }
      else {
        var node = {};
        node.slug  = hashids.encode(result.id);
        node.title = result.data.title;
        node.desc  = result.data.desc;
        node.adjacencies = [];

        var query = 'MATCH (adj:Node)--(n:Node) WHERE id(n) = {nodeid} RETURN adj';
        var params = {nodeid: result.id};
        db.query(query, params, function(err, result) {
          if (err) throw err;
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
  var cache_key = 'graphs/' + graph_slug;
  if (cache.has(cache_key)) {
    res.json(cache.get(cache_key));
  }
  else {
    var query = ['MATCH (g:Graph)-[*]-(n1:Node)--(n2:Node)',
      'WHERE id(g) = {graphid}',
      'RETURN n1, n2'
      ].join('\n');
    var params = {graphid: hashids.decode(req.params.graph_slug)};
    db.query(query, params, function(err, result) {
      if (err) throw err;
      if (result.length == 0) {
        res.status(404).send('Graph does not exist');
      }
      else {
        var graph = {slug: req.params.graph_slug, nodes: []};
        var nodesforcache = {};
        result.forEach(function(row) {
          var n1slug = hashids.encode(row['n1'].id);
          var n2slug = hashids.encode(row['n2'].id);
          graph.nodes.push(n1slug);

          if (!nodesforcache[n1slug]) {
            nodesforcache[n1slug] = {};
            nodesforcache[n1slug].title = row['n1'].data.title;
            nodesforcache[n1slug].desc  = row['n1'].data.desc;
            nodesforcache[n1slug].adjacencies = [];
          }
          nodesforcache[n1slug].adjacencies.push(n2slug);
        });

        Object.keys(nodesforcache).forEach(function(key) {
          var node = nodesforcache[key];
          var node_cache_key = 'nodes/' + node.slug;
          cache.set(node_cache_key, {node: node});
        });
        var response = { graph: graph };
        cache.set(cache_key, response);
        res.json(response);
      }
    });
  }
});

app.put('/api/nodes/:node_slug', function(req, res) {
  console.log(req.body);
  res.json({});
});

app.post('/api/nodes', function(req, res) {
  console.log(req.body);
  req.body.node.slug = req.body.node.title;
  res.json(req.body);
});

// If all else fails: send them app.html
app.get('/*', function(req, res) {
  res.sendFile(__dirname + '/public/app.html');
});