App = Em.Application.create({
  LOG_TRANSITIONS: true
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

App.GraphController = Ember.ObjectController.extend({
});

App.NetworkViewComponent = Ember.Component.extend({
  tagName: 'svg',
  attributeBindings: ['width', 'height'],
  force: d3.layout.force().distance(100).charge(-1000),
  links: function() {
    var nodes = this.get('controller.nodes');
    var result = [];

    // TODO: bro, do you even optimize?
    nodes.forEach(function(source, sourceIndex) {
      var adjacencies = source.get('adjacencies');
      adjacencies.forEach(function(adjacent) {
        nodes.forEach(function(target, targetIndex) {
          if (adjacent.get('id') == target.get('id')) {
            if (!result.some(function (link) { return link.target == sourceIndex; })) {
              result.push({
                source: sourceIndex,
                target: targetIndex
              });
            }
          }
        });
      });
    });

    return result;
  }.property('nodes.@each.adjacencies'),
  nodes: function() {
    return this.get('controller.nodes').map(function(node){
      return { title: node.get('title') };
    });
  }.property('controller.nodes.@each.title'),
  onTick: function () {
    this.get('svg').selectAll('.node')
      .attr('transform', function(d) { return 'translate(' + [d.x, d.y] + ')'; });
    this.get('svg').selectAll('.node > text')
      .text(function(d) { return d.title || 'Untitled Node'; });
    this.get('svg').selectAll('.link')
      .attr('x1', function(d) { return d.source.x; })
      .attr('y1', function(d) { return d.source.y; })
      .attr('x2', function(d) { return d.target.x; })
      .attr('y2', function(d) { return d.target.y; });
  },
  onResize: function () {
    var width  = $(window).width();
    var height = $(window).height();
    var center_x = width/2 + 110;

    this.force.size([center_x * 2, height]);
    this.set('width', $(window).width());
    this.set('height', $(window).height());
  }.on('init'),
  update: function() {
    console.log('view.update');

    var linkskey = function(d) { return d };
    var links = this.get('links');
    this.force.links(links);
    var linkset = this.get('svg').selectAll('.link').data(links);
    linkset.enter()
      .append('line')
        .attr('class', 'link');
    linkset.exit().remove();

    var nodekey = function (d) { return d.title };
    var nodes = this.get('nodes');
    this.force.nodes(nodes);
    var nodeset = this.get('svg').selectAll('.node').data(nodes, nodekey);
    nodeset.enter()
      .append('g')
        .attr('class', 'node')
        .call(this.force.drag)
      .append('text')
        .attr('dx', 12)
        .attr('dy', '.35em')
        .attr('text-anchor', 'middle')
        .attr('class', 'nodelabel')
    nodeset.exit().remove();

    this.force.start();
  }.observes('nodes', 'links'),
  init: function() {
    this.force.on('tick', Ember.run.bind(this, this.onTick));
    $(window).on('resize', Ember.run.bind(this, this.onResize));
  },
  didInsertElement: function() {
    this.set('svg', d3.select(this.$()[0]));
    Ember.run.once(this, 'update');
  }
});

App.graph = Ember.Object.extend({
  init: function() {
    this.width =  $(window).width();
    this.height = $(window).height();
    this.center = { x: this.width/2 + 110, y: this.height/2 };
    this.radius = 240;
    this.colors = d3.scale.category10().range();
    this.nodes = [];
    this.links = [];

    this.force = d3.layout.force().distance(100).charge(-1000).size([this.center.x*2, this.height]);

    this.force.on('tick', (function(view) {
      return function () {
        view.svg.selectAll('circle')
          .attr('cx', function(d) { return d.x; })
          .attr('cy', function(d) { return d.y; });

        view.svg.selectAll('line.link')
          .attr('x1', function(d) { return d.source.x; })
          .attr('y1', function(d) { return d.source.y; })
          .attr('x2', function(d) { return d.target.x; })
          .attr('y2', function(d) { return d.target.y; });
      }
    })(this));
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
    var circles = this.svg.selectAll('circle')
      .data(this.nodes)
    circles.enter()
      .append('svg:circle')
    circles.attr('r', function(d, i) { return 5 })
      .attr('class', function(d, i) { return 'node' })
      .attr('cx', function(d) { return d.x; })
      .attr('cy', function(d) { return d.y; })
      .call(this.force.drag);
    circles.exit().remove();
  },
  drawLines: function(){
    var lines = this.svg.selectAll('line.link')
    .data(this.links)
    lines.enter()
    .append('svg:line')
    lines.attr('class', 'link')
    .attr('x1', function(d) { return d.source.x; })
    .attr('y1', function(d) { return d.source.y; })
    .attr('x2', function(d) { return d.target.x; })
    .attr('y2', function(d) { return d.target.y; })
    lines.exit().remove()
  }
});