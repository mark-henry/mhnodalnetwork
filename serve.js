var express = require('express');
var app = express();
var neo4j = require('neo4j');
var db = new neo4j.GraphDatabase(process.env['GRAPHSTORY_URL']);
db.params = {userId: db.id};
var Hashids = require('hashids');
var hashids = new Hashids('Smaller cap, less plastic');
var LRU = require('lru-cache');
var cache = LRU({max: 500, maxAge: 1000 * 60 * 5});

app.set('port', (process.env.PORT || 5000));

app.use('/public', express.static(__dirname + '/public'));

app.use(function (req, res, next) {
  console.log('GET ' + req.path);
  next();
});

app.get('/api/graphs', function(req, res) {
  if (cache.has('graphlist')) {
    res.json(cache.get('graphlist'));
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

      cache.set('graphlist', graphlist);
      res.json(graphlist);
    });
  }
});

app.get('/api/nodes/:node_slug', function(req, res) {
  var node_slug = req.params.node_slug;
  if (cache.has(node_slug)) {
    res.json(cache.get(node_slug));
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
          cache.set(node.slug, node);
          res.json(node);
        });
      }
    });
  }
});

app.get('/api/graphs/:graph_slug', function(req, res) {
  var graph_slug = req.params.graph_slug;
  if (cache.has(graph_slug)) {
    res.json(cache.get(graph_slug));
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

        cache.set(graph.slug, graph);
        Object.keys(nodesforcache).forEach(function(key) {
          var node = nodesforcache[key];
          cache.set(node.slug, node);
        })
        res.json(graph);
      }
    });
  }
});

app.get('/*', function(req, res) {
  res.sendFile(__dirname + '/public/app.html');
});

app.listen(app.get('port'), function() {
  console.log('Listening on port ' + app.get('port'));
});

