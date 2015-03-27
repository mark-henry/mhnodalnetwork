(function() {
'use strict';

NN.NetworkViewComponent = Ember.Component.extend({
  tagName: 'svg',
  attributeBindings: ['width', 'height'],
  nodes: [],
  visibleNodes: [],
  drawDistance: 3,

  init: function() {
    this.set('force', d3.layout.force().distance(60).charge(-5e2).gravity(.09));
    this.get('force').on('tick', Ember.run.bind(this, this.onTick));
    $(window).on('resize', Ember.run.bind(this, this.onResize));
  },

  didInsertElement: function() {
    this.set('svg', d3.select(this.$()[0]));
    this.get('svg').append('g').attr('class', 'linkgroup');
    this.get('svg').append('g').attr('class', 'nodegroup');
    Ember.run.once(this, 'update');
  },

  update: function() {
    var force = this.get('force');
    var nodes = this.get('visibleNodes');
    var links = this.get('links');
    
    force.nodes(nodes);
    force.links(links);

    var idkey = (function(d) { return d.id; });
    var nodename = (function(d) { return d.name; });
    var nodeSelection = this.get('svg').select('.nodegroup').selectAll('.node').data(nodes, idkey);
    nodeSelection.enter()
      .append('text')
        .attr('dx', 12).attr('dy', '.35em')
        .classed({
          'node': true,
          'selected': (function(d) { return d.selected; })
        })
        .text(nodename)
        .on('click', this.get('onClick')(this))
        .call(force.drag);
    nodeSelection.text(nodename);
    nodeSelection.exit().remove();

    var linkSelection = this.get('svg').select('.linkgroup').selectAll('.link').data(links);
    linkSelection.enter()
      .insert('line').attr('class', 'link');
    linkSelection.exit().remove();

    force.start();
  }.observes('visibleNodes', 'links'),

  links: function() {
    var nodes = this.get('nodes');
    var visibleNodes = this.get('visibleNodes');
    var result = [];

    // TODO: optimize
    nodes.forEach(function(source, sourceIndex) {
      var adjacencies = source.get('adjacencies');
      adjacencies.forEach(function(adjacent) {
        visibleNodes.forEach(function(target, targetIndex) {
          if (adjacent.get('id') == target.id) {
            var oppositeDirection = function(link) {
              return link.target == sourceIndex &&
                link.source == targetIndex;
            }
            if (!result.some(oppositeDirection)) {
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
  }.property('nodes.@each.adjacencies', 'visibleNodes'),

  streamingUpdateNodes: function() {
    var incomingNodes = this.get('nodes');
    var updatedNodes = this.get('visibleNodes');
    var _this = this;

    updatedNodes = updatedNodes.filter(function(existingNode) {
      return incomingNodes.isAny('id', existingNode.id);
    });

    incomingNodes.forEach(function(incomingNode) {
      var selected = incomingNode.get('id') == _this.get('selectedId');
      var existingNode = updatedNodes.findBy('id', incomingNode.get('id'));
      if (existingNode) {
        existingNode.name = incomingNode.get('name');
        existingNode.selected = selected;
        existingNode.fixed = selected;
      } else {
        var newNode = {
          id: incomingNode.get('id'),
          name: incomingNode.get('name') || 'Unnamed Node',
          selected: selected,
          fixed: selected,
        };
        if (selected || true) {
          newNode.x = newNode.px = _this.get('center_x');
          newNode.y = newNode.py = _this.get('center_y');
        }
        updatedNodes.push(newNode);
      }
    });

    this.set('visibleNodes', updatedNodes);
  }.observes('nodes.@each.name', 'selectedId'),

  onClick: function (_this) {
    return (function (d) {
      if (d3.event.defaultPrevented) return; // ignore drag
      _this.sendAction('select-action', d);
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

  onResize: function () {
    var width  = $(window).width() - 5;
    var height = $(window).height() - 5;
    var center_x = (width - 110)/2 + 110;
    var center_y = height/2;

    this.force.size([center_x * 2, height]);
    this.set('center_x', center_x);
    this.set('center_y', center_y);
    this.set('width', width);
    this.set('height', height);
  }.on('init')
});

})();