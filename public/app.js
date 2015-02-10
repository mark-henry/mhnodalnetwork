(function() {

App = Em.Application.create({
  // LOG_TRANSITIONS: true
});

DS.RESTAdapter.reopen({
  namespace: 'api'
});

App.Router.reopen({
  location: 'auto'
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

App.Router.map(function() {
  this.resource('graph', {path: '/graph/:graph_slug'}, function() {
    this.resource('node', {path: '/node/:node_slug'});
  });
});

App.GraphRoute = Ember.Route.extend({
  model: function(params) {
    return this.store.find('graph', params.graph_slug);
  }
});

App.NodeRoute = Ember.Route.extend({
  model: function(params) {
    return this.store.find('node', params.node_slug);
  },
  actions: {
    showModal: function(name, model) {
      return this.render('delete-node-modal', {
        into: 'node',
        outlet: 'modal',
        model: model
      });
    },
    closeModal: function() {
      return this.disconnectOutlet({
        outlet: 'modal',
        parentView: 'graph'
      });
    },
    deleteNode: function(node) {
      console.log('delete node', this.get('id'));
    }
  }
});

App.GraphController = Ember.ObjectController.extend({
});

App.NodeController = Ember.ObjectController.extend({
  needs: 'graph',
  actions: {
    selectNode: function(node) {
      this.transitionToRoute('node', node.id);
    },
    newNode: function(nodeName) {
      var _this = this;
      console.log('create node', nodeName);
      this.createNewNode(nodeName)
        .then(function(newNode) {
          _this.transitionToRoute('node', newNode.id);
        }
      );
    },
    addLink: function(nodeToLinkTo) {
      console.log('add link from', this.get('id'), 'to', nodeToLinkTo.get('id'), nodeToLinkTo.get('title'));
      this.get('adjacencies').addObject(nodeToLinkTo);
      this.model.save();
    },
    deleteLink: function(link) {
      this.get('adjacencies').removeObject(link);
      this.model.save();
    },
    newNodeAndAddLink: function(nodeName) {
      var sourceNode = this.get('model');
      this.createNewNode(nodeName)
        .then(function(newNode) {
          sourceNode.get('adjacencies').addObject(newNode);
          _this.transitionToRoute('node', newNode.get('id'));
        }
      );
    }
  },
  createNewNode: function(nodeName) {
    var _this = this;
    return this.store.createRecord('node', { title: nodeName }).save()
      .then(function(newNode) {
          _this.get('nodes').addObject(newNode);
          _this.model.save();
          return newNode;
        }
      );
  },
  save: function() {
    this.get('model').save();
  },
  autoSave: function() {
    Ember.run.debounce(this, this.save, 1500);
  }.observes('title', 'desc'),
  nodes: Ember.computed.alias('controllers.graph.nodes')
});

// twitter-typeahead by thefrontside (customized)
// https://github.com/thefrontside/ember-cli-twitter-typeahead/
App.NodeSearchComponent = Ember.TextField.extend({
  classNames: [ 'form-control' ],

  keyUp: function(event) {
    if (event.which === 13) {
      var $dropdownMenu = this.$().siblings('.tt-dropdown-menu');
      var $suggestions = $dropdownMenu.find('.tt-suggestion:not(.enter-suggest)');
      if ($suggestions.length) {
        $suggestions.first().click();
      } else {
        this.sendAction('select-without-match-action', this.$().val());
      }
    }
  },

  setSelectionValue: function() {
    var selection = this.get('selection');
    if (selection) {
      this.$().typeahead('val', selection.get('title'));
    }
    this.sendAction('select-action', this.get('selection'));
    this.$().typeahead('val', '');
  },

  _filterContent: function(query) {
    var regex = new RegExp(query, 'i');
    return this.get('content').filter(function(node) {
      return regex.test(node.get('title'));
    }).map(function(thing) {
      return thing;
    });
  },

  _initializeTypeahead: function() {
    var typeaheadParams = {
        minLength: 0,
        displayKey: function(node) {
          return node.get('title');
        }.bind(this),
        source: function(query, cb) {
          var content = this.get('content');
          if (!query || query === '*') {
            return cb(content);
          }
          cb(this._filterContent(query));
        }.bind(this),
        templates: {
          footer: function(object) {
            return '';
          }.bind(this),
          empty: function(object) {
              return '';
          }.bind(this)
        }
      };
    this.$().typeahead({ }, typeaheadParams)
      .on('typeahead:selected typeahead:autocompleted',
        Ember.run.bind(this, function(e, obj, dataSet) {
          this.set('selection', obj);
        })
      );
  },

  focusIn: function() {
    this.$().select();
  },

  focusOut: function() {
    var query = this.$().typeahead('val');
    var results = this._filterContent(query);
    if (Ember.$.trim(query).length) {
      if (results.length) {
        this.set('selection', results[0]);
      }
    }
  },

  didInsertElement: function() {
    this.set('$', this.$);
    Ember.run.scheduleOnce('afterRender', this, '_initializeTypeahead');
  }.on('didInsertElement'),

  setTypeaheadValue: Ember.observer('selection', function() {
    Ember.run.once(this, 'setSelectionValue');
  }),

  close: function() {
    this.$().typeahead('close');
  },

  destroyTypeahead: Ember.observer(function() {
    this.$().typeahead('destroy');
  }).on('willDestroyElement')
});

App.NetworkViewComponent = Ember.Component.extend({
  tagName: 'svg',
  attributeBindings: ['width', 'height'],
  nodes: [],
  visibleNodes: [],
  drawDistance: 3,

  init: function() {
    this.set('force', d3.layout.force().distance(100).charge(-300).gravity(.018));
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
            oppositeDirection = function(link) {
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
        existingNode.title = incomingNode.get('title');
        existingNode.selected = selected;
        existingNode.fixed = selected;
      } else {
        var newNode = {
          id: incomingNode.get('id'),
          title: incomingNode.get('title') || 'Unnamed Node',
          selected: selected,
          fixed: selected,
        };
        if (selected) {
          newNode.x = newNode.px = _this.get('center_x');
          newNode.y = newNode.py = _this.get('center_y');
        }
        updatedNodes.push(newNode);
      }
    });

    this.set('visibleNodes', updatedNodes);
  }.observes('nodes.@each.title', 'selectedId'),

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