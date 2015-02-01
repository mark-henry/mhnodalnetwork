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

App.NodeRoute = Ember.Route.extend({
  needs: 'graph',
  graph: Ember.computed.alias('controllers.graph'),
  model: function(params) {
    return this.store.find('node', params.node_slug);
  }
})

App.GraphController = Ember.ObjectController.extend({
  actions: {
    selectNode: function(nodeid) {
      console.log('transitioning to', nodeid);
      this.transitionToRoute('node', nodeid);
    }
  }
});

App.NetworkViewComponent = Ember.Component.extend({
  tagName: 'svg',
  attributeBindings: ['width', 'height'],
  force: d3.layout.force().distance(100).charge(-1000),
  update: function() {
    var linkskey = function(d) { return d };
    var links = this.get('links');
    this.force.links(links);
    var linkset = this.get('svg').select('.linkgroup').selectAll('.link').data(links);
    linkset.enter()
      .insert('line')
        .attr('class', 'link');
    linkset.exit().remove();

    var nodekey = function(d) { return d.title; };
    var nodes = this.get('nodes');
    this.force.nodes(nodes);
    var nodeset = this.get('svg').select('.nodegroup').selectAll('.node').data(nodes, nodekey);
    nodeset.enter()
      .append('text')
        .attr('dx', 12)
        .attr('dy', '.35em')
        .attr('class', 'node')
        .on('click', this.onNodeClick(this.get('controller')))
        .call(this.force.drag);
    nodeset.exit().remove();

    this.force.start();
  }.observes('nodes', 'links'),
  onNodeClick: function(controller) {
    return (function(d) {
      controller.send('selectNode', d.id);
    });
  },
  onTick: function () {
    this.get('svg').selectAll('.node')
      .attr('transform', function(d) { return 'translate(' + [d.x, d.y] + ')'; })
      .text(function(d) { return d.title || 'Unnamed Node'; })
      .attr('class', function(d) { return 'node'; });
    this.get('svg').selectAll('.link')
      .attr('x1', function(d) { return d.source.x; })
      .attr('y1', function(d) { return d.source.y; })
      .attr('x2', function(d) { return d.target.x; })
      .attr('y2', function(d) { return d.target.y; });
  },
  links: function() {
    var nodes = this.get('controller.nodes');
    var result = [];

    // TODO: Optimize this
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
      return { id: node.get('id'), title: node.get('title') };
    });
  }.property('controller.nodes.@each.title'),
  onResize: function () {
    var width  = $(window).width();
    var height = $(window).height();
    var center_x = width/2 + 110;

    this.force.size([center_x * 2, height]);
    this.set('width', $(window).width());
    this.set('height', $(window).height());
  }.on('init'),
  init: function() {
    this.force.on('tick', Ember.run.bind(this, this.onTick));
    $(window).on('resize', Ember.run.bind(this, this.onResize));
  },
  didInsertElement: function() {
    this.set('svg', d3.select(this.$()[0]));
    this.get('svg').append('g').attr('class', 'linkgroup');
    this.get('svg').append('g').attr('class', 'nodegroup');
    Ember.run.once(this, 'update');
  }
});
