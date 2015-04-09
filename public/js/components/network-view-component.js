(function() {
'use strict';

NN.NetworkViewComponent = Ember.Component.extend({
  tagName: 'svg',
  attributeBindings: ['width', 'height'],
  nodes: [],
  visibleNodes: [],
  drawDistance: 3,

  init: function() {
    this.set('force', d3.layout.force().distance(60).charge(-4e2).gravity(.07));
    this.get('force').on('tick', Ember.run.bind(this, this.onTick));
    $(window).on('resize', Ember.run.bind(this, this.onResize));
  },

  didInsertElement: function() {
    this.set('svg', d3.select(this.$()[0]));
    this.get('svg').append('g').attr('class', 'linkgroup');
    this.get('svg').append('g').attr('class', 'nodegroup');
    Ember.run.once(this, 'redraw');
    Ember.run.once(this, 'streamingUpdateNodes');
  },

  redraw: function() {
    var force = this.get('force');
    var nodes = this.get('visibleNodes');
    var links = this.get('links');
    
    force.nodes(nodes);
    force.links(links);

    var idkey = (function(d) { return d.id; });
    var nodename = (function(d) { return d.name || '[Unnamed Node]'; });
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
    var _this = this;

    // this.nodes is an Ember-ey collection. this.visibleNodes is a collection
    //  of normal objects, which is how d3 likes it. So we first have to jump
    //  this impedance gap by flattening this.nodes:
    var incomingNodes = this.nodes.map(function(node) {
      return {
        id: node.get('id'),
        name: node.get('name')
      }
    });
    // Fortunately, we're only concerned with these few fields, since the
    //  output of this function is only seen by d3.

    // Split the incoming nodes up into three sets.
    // The entry set is those nodes which are new since the last update.
    // The update set is those nodes which are not new but have been edited
    //  since the last update.
    // The exit set is those nodes which have been deleted since the
    //  last update.
    var entrySet = incomingNodes.reject(function(node) {
      return _this.visibleNodes.some(function(existingNode) {
        return existingNode.id == node.id;
      });
    });
    var updateSet = incomingNodes.filter(function(node) {
      var existingNode = _this.visibleNodes.findBy('id', node.id);
      return existingNode && (existingNode.name != node.name)
    });
    var exitSet = this.visibleNodes.reject(function(node) {
      return incomingNodes.some(function(incomingNode) {
        return incomingNode.id == node.id;
      });
    });

    console.log(entrySet.length, 'entering,', updateSet.length, 'updated,',
      exitSet.length, 'exiting');

    // Process entry set
    this.visibleNodes.pushObjects(entrySet);
    // Process update set
    this.set('visibleNodes', this.visibleNodes.map(function(node) {
      if (updateSet.isAny('id', node.id)) {
        return updateSet.findBy('id', node.id);
      }
      else {
        return node;
      }
    }));
    // Process exit set
    this.set('visibleNodes', this.visibleNodes.reject(function(node) {
      return node in exitSet;
    }));

    // Modify the node that is currently selected by the user
    this.set('visibleNodes', this.visibleNodes.map(function(node) {
      var isSelected = (node.id == _this.get('selectedId'));
      node.selected = node.fixed = isSelected;
      if (isSelected) {
        node.x = node.px = _this.get('center_x');
        node.y = node.py = _this.get('center_y');
      }
      return node;
    }));
  }.observes('nodes.@each.name', 'selectedId'),
  
  onClick: function (_this) {
    return (function (d) {
      if (d3.event.defaultPrevented) return;  // ignore drag
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