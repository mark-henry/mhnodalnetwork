App = Em.Application.create({
  LOG_TRANSITIONS: true
});

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
  model: function(params) {
    return this.store.find('node', params.node_slug);
  }
})

App.GraphController = Ember.ObjectController.extend({
});

App.NodeController = Ember.ObjectController.extend({
  needs: 'graph',
  actions: {
    selectNode: function(nodeid) {
      this.transitionToRoute('node', nodeid);
    }
  },
  nodes: Ember.computed.alias("controllers.graph.nodes")
});

App.NetworkViewComponent = Ember.Component.extend({
  tagName: 'svg',
  attributeBindings: ['width', 'height'],
  force: d3.layout.force().distance(100).charge(-1000),
  update: function() {
    var force = this.get('force');
    var nodes = this.get('nodes');
    var links = this.get('links');
    
    force.nodes(nodes);
    force.links(links);

    var idkey = (function(d) { return d.id; });
    var nodetitle = (function(d) { return d.title; });
    var nodeSelection = this.get('svg').select('.nodegroup').selectAll('.node').data(nodes, idkey);
    nodeSelection.enter()
      .append('text')
        .attr('dx', 12).attr('dy', '.35em')
        .classed({
          'node': true,
          'selected': (function(d) { return d.selected; })
        })
        .text(nodetitle)
        .on('click', this.get('onClick')(this))
        .call(force.drag);
    nodeSelection.text(nodetitle);
    nodeSelection.exit().remove();

    var linkSelection = this.get('svg').select('.linkgroup').selectAll('.link').data(links);
    linkSelection.enter()
      .insert('line').attr('class', 'link');
    linkSelection.exit().remove();

    force.start();
  }.observes('nodes', 'links'),
  onClick: function (_this) {
    return (function (d) {
      d.px = _this.get('center_x');
      d.py = _this.get('center_y');
      d.fixed = true;
      _this.get('force').start();
      _this.get('controller').send('selectNode', d.id);
    })
  },
  onTick: function () {
    this.get('svg').selectAll('.node')
      .attr('transform', function(d) { return 'translate(' + [d.x, d.y] + ')'; })
      .attr('class', function(d) { return d.selected ? 'node selected' : 'node'; });
    this.get('svg').selectAll('.link')
      .attr('x1', function(d) { return d.source.x; })
      .attr('y1', function(d) { return d.source.y; })
      .attr('x2', function(d) { return d.target.x; })
      .attr('y2', function(d) { return d.target.y; });
  },
  links: function() {
    var nodes = this.get('controller.nodes');
    var result = [];

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
  }.property('controller.nodes.@each.adjacencies', 'nodes'),
  nodes: function() {
    var _this = this;
    return this.get('controller.nodes').map(
      function (node) {
        var selected = (node.get('id') == _this.get('controller.id'));
        var result = {
          id: node.get('id'),
          title: node.get('title') || 'Unnamed Node',
          selected: selected,
          fixed: selected
        }
        if (selected) {
          result.px = _this.get('center_x');
          result.py = _this.get('center_y');
        }
        return result;
      }
    );
  }.property('controller.nodes', 'controller.nodes.[]', 'controller.nodes.@each.id', 'controller.nodes.@each.title', 'controller.id', 'center_x', 'center_y'),
  onResize: function () {
    var width  = $(window).width();
    var height = $(window).height();
    var center_x = (width - 110)/2 + 110;
    var center_y = height/2;

    this.force.size([center_x * 2, height]);
    this.set('center_x', center_x);
    this.set('center_y', center_y);
    this.set('width', width);
    this.set('height', height);
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
