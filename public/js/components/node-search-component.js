(function () {
'use strict';

// twitter-typeahead by thefrontside (customized)
// https://github.com/thefrontside/ember-cli-twitter-typeahead/
NN.NodeSearchComponent = Ember.TextField.extend({
  classNames: [ 'form-control' ],

  keyUp: function(event) {
    if (event.which === 13) {
      var $dropdownMenu = this.$().siblings('.tt-dropdown-menu');
      var $suggestions = $dropdownMenu.find('.tt-suggestion:not(.enter-suggest)');
      if ($suggestions.length) {
        $suggestions.first().click();
      } else {
        this.sendAction('select-without-match-action', this.$().val());
        this.clearInput();
      }
    }
  },

  clearInput: function() {
    this.$().typeahead('val', '');
  },

  setSelectionValue: function() {
    var selection = this.get('selection');
    if (selection) {
      this.$().typeahead('val', selection.get('name'));
    }
    this.sendAction('select-action', this.get('selection'));
    this.clearInput();
  },

  _filterContent: function(query) {
    var regex = new RegExp(query, 'i');
    return this.get('content').filter(function(node) {
      return regex.test(node.get('name'));
    }).map(function(thing) {
      return thing;
    });
  },

  _initializeTypeahead: function() {
    var typeaheadParams = {
        minLength: 0,
        displayKey: function(node) {
          return node.get('name');
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

})();