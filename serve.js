var express = require('express');
var app = express();
var neo4j = require('neo4j');
var db = new neo4j.GraphDatabase(process.env['GRAPHSTORY_URL']);
db.params = {userId: db.id};
var Hashids = require('hashids');
var hashids = new Hashids('Smaller cap, less plastic');

app.set('port', (process.env.PORT || 5000));

app.use('/public', express.static(__dirname + '/public'));

app.use(function (req, res, next) {
  console.log('GET ' + req.path);
  next();
});

app.get('/api/graphs', function(req, res) {
  db.query('MATCH (g:Graph) RETURN g', {}, function(err, result) {
    if (err) throw err;

    var graphlist = [];

    result.forEach(function(row) {
      var dbid = row['g'].id;
      var graphid = hashids.encode(dbid);
      graphlist.push({id:graphid});
    });

    res.json(graphlist);
  });
});

app.get('/api/graphs/:id', function(req, res) {
  var query = ['MATCH (g:Graph)-[*]-(n1:Node)--(n2:Node)',
    'WHERE id(g) = {graphid}',
    'RETURN n1, n2'
    ].join('\n');
  var params = {graphid: hashids.decode(req.params.id)};
  db.query(query, params, function(err, result) {
    if (err) throw err;
    if (result.length == 0) {
      return res.status(404).send('Graph does not exist');
    }

    var graph = {nodes:{}, title:''};

    result.forEach(function(row) {
      var n1id = hashids.encode(row['n1'].id);
      var n2id = hashids.encode(row['n2'].id);

      if (!graph.nodes[n1id]) {
        graph.nodes[n1id] = {};
        graph.nodes[n1id].title = row['n1'].data.title;
        graph.nodes[n1id].desc  = row['n1'].data.desc;
        graph.nodes[n1id].adjacencies = [];
      }
      
      graph.nodes[n1id].adjacencies.push(n2id);
    });

    res.json(graph);
  });
});

app.get('/*', function(req, res) {
  res.sendFile(__dirname + '/public/app.html');
});

app.listen(app.get('port'), function() {
  console.log('Listening on port ' + app.get('port'));
});

