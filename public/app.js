App = Em.Application.create({
  LOG_TRANSITIONS: true,
  ready: function() {
    $(window).resize(function () {
      App.graph.resize($(window).height(), $(window).width())
    });
  }
});

// Routing & Data
App.Router.map(function() {
  this.resource('graph', {path: '/graph/:graph_slug'}, function() {
    this.resource('node', {path: '/node/:node_slug'});
  });
});

App.Router.reopen({
  location: 'auto'
});

DS.RESTAdapter.reopen({
  namespace: 'api'
});

App.ApplicationSerializer = DS.RESTSerializer.extend({
  primaryKey: 'slug',
  normalizeHash: function(type, hash) {
    hash.id = hash.slug;
    return this._super(type, hash); 
  }
});

App.Node = DS.Model.extend({
  title: DS.attr('string'),
  desc: DS.attr('string'),
  adjacencies: DS.hasMany('node', {async: true})
});

App.Graph = DS.Model.extend({
  title: DS.attr('string'),
  nodes: DS.hasMany('node', {async: true})
});

App.GraphRoute = Ember.Route.extend({
  model: function(params) {
    return this.store.find('graph', params.graph_slug);
  }
});

App.GraphController = Ember.Controller.extend({
  init: function() {
    App.graph.svg = d3.select("#chart").append("svg:svg")
      .attr("width", App.graph.width).attr("height", App.graph.height);

    this.force = d3.layout.force().distance(100).charge(-1000).size([this.rcx*2, this.height]);

    this.force.on("tick", this.onTick);

    App.graph.draw();
  },
  onTick: function(data) {
    var graph = App.graph;

    graph.svg.selectAll("circle")
    .attr("cx", function(d) { return d.x; })
    .attr("cy", function(d) { return d.y; });

    graph.svg.selectAll("line.link")
    .attr("x1", function(d) { return d.source.x; })
    .attr("y1", function(d) { return d.source.y; })
    .attr("x2", function(d) { return d.target.x; })
    .attr("y2", function(d) { return d.target.y; });
  }
});

// Todo: refactor into oblivion
App.graph = Ember.Object.create({
  init: function() {
    this.width =  $(window).width()
    this.height = $(window).height()
    this.rcx = this.width/2 + 110
    this.rcy = this.height/2
    this.radius = 240
    this.colors = d3.scale.category10().range()
    this.nodes = []
    this.links = []

    this.force = d3.layout.force().distance(100).charge(-1000).size([this.rcx*2, this.height]);

    this.force.on("tick", function(e) {
      var graph = App.graph

      graph.svg.selectAll("circle")
      .attr("cx", function(d) { return d.x; })
      .attr("cy", function(d) { return d.y; });

      graph.svg.selectAll("line.link")
      .attr("x1", function(d) { return d.source.x; })
      .attr("y1", function(d) { return d.source.y; })
      .attr("x2", function(d) { return d.target.x; })
      .attr("y2", function(d) { return d.target.y; });
    });
  },
  resize: function(height, width){
    this.svg.attr('height', height).attr('width', width)
    this.set('height', height)
    this.set('width', width)
    this.set('rcx', width/2 + 110)
    this.set('rcy', height/2)
    this.force.size([this.rcx*2, height]);
  },
  draw: function(){
    var graph = App.graph

    numVertices = 10

    // magic vertex
    this.nodes = [{fixed: false, x: this.rcx, y: this.rcy}]
    // arrange nodes in a circle
    this.nodes = this.nodes.concat(d3.range(numVertices).map(function(d, i) {
      return {
        x: this.rcx,
        y: this.rcy
      }
    }))

    graph.links = []
    this.nodes.forEach(function(node, i) {
      graph.links.push({source: graph.nodes[1], target: graph.nodes[i]})
    })

    this.force.nodes(this.nodes);
    this.force.links(this.links);
    this.force.start();
    
    this.drawLines();
    this.drawCircles();
  },
  drawCircles: function() {
    var circles = this.svg.selectAll("circle")
    .data(this.nodes)
    circles.enter()
    .append("svg:circle")
    circles.attr("r", function(d, i) { return 5 })
    .attr("class", function(d, i) { return 'node' })
    .attr("cx", function(d) { return d.x; })
    .attr("cy", function(d) { return d.y; })
    .call(this.force.drag);
    circles.exit().remove();
  },
  drawLines: function(){
    var lines = this.svg.selectAll("line.link")
    .data(this.links)
    lines.enter()
    .append("svg:line")
    lines.attr("class", "link")
    .attr("x1", function(d) { return d.source.x; })
    .attr("y1", function(d) { return d.source.y; })
    .attr("x2", function(d) { return d.target.x; })
    .attr("y2", function(d) { return d.target.y; })
    lines.exit().remove()
  }
});