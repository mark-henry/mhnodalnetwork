(function() {
  //http://stackoverflow.com/a/901144/678708
  function getParameterByName(name) {
    name = name.replace(/[\[]/, "\\\[").replace(/[\]]/, "\\\]");
      var regexS = "[\\?&]" + name + "=([^&#]*)";
      var regex = new RegExp(regexS);
      var results = regex.exec(parent.window.location.href);
      if(results == null) {
        return "";
      } else {
        return decodeURIComponent(results[1].replace(/\+/g, " "));
      }
  }

  ENV = { RAISE_ON_DEPRECATION: true }

  App = Em.Application.create({
    ready: function() {
      $("textarea.steppable,input.steppable[type=text]").live('keydown mousewheel', function(e){
        if (event.which == 38 || event.which == 40 || event.type == 'mousewheel') {
          e.preventDefault();
          var val = $(this).val();
          var cursorIndex = $(this).caret().start;
          var cursorString = [val.slice(0, cursorIndex), 'CURSOR', val.slice(cursorIndex)].join('');
          var re = /(-?\d*)CURSOR\s*(-?\d*)/g
          var matches = re.exec(cursorString);
          var number = 1
          if(event.altKey) number *= 10
          if(event.ctrlKey) number *= 10
          if(event.shiftKey) number *= 10
          var result = parseInt(matches[1] + matches[2]) + (event.which == 40 || event.wheelDelta < 0 ? -number : number);
          if(!isNaN(result)){
            $(this).val(cursorString.replace(re, result));
          }
          $(this).caret(matches.index, matches.index);
        }
      });

      $(window).resize(function () {
        App.graph.resize($(window).height(), $(window).width())
      });

      $("#charge").live('change', function() {
        App.graph.set('charge', $(this).val())
      })

      App.graph.svg = d3.select("#chart").append("svg:svg").attr("width", App.graph.width).attr("height", App.graph.height);

      this.initialize();
      this.graph.draw();
    },
    Router: Ember.Router.extend({
      enableLogging: true,
      root: Ember.Route.extend({
        index: Ember.Route.extend({
          route: '/'
        })
      })
    }),
    ApplicationController: Ember.Controller.extend({
    })
  });

  App.graph = Ember.Object.create({
    init: function() {
      this._super();

      this.width =  $(window).width()
      this.height = $(window).height()
      this.rcx = this.width/2 + 110
      this.rcy = this.height/2
      this.radius = 240
      this.colors = d3.scale.category10().range()
      this.nodes = [] // the node with index 0 is fixed to the center and has a high charge
      this.links = []
      this.charge = 1000

      this.force = d3.layout.force().charge(function(d, i) {
        return i == 0 ? 0 : -App.graph.get('charge')
      }).size([this.rcx*2, this.height]);

      //TODO
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
      this.redraw()
    },
    draw: function(){
      var graph = App.graph

      numVertices = 10

      // magic vertex
      this.nodes = [{fixed: true, x: this.rcx, y: this.rcy}]
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

      this.force.nodes(this.nodes)
      this.force.links(this.links)
      this.force.start()
      
      this.drawLines()
      this.drawCircles()
    },
    drawCircles: function() {
      var circles = this.svg.selectAll("circle")
      .data(this.nodes)
      circles.enter()
      .append("svg:circle")
      circles.attr("r", function(d, i) { return i == 0 ? 0 : 5 })
      .attr("class", function(d, i) { return i == 0 ? 'magic-vertex' : 'vertex' })
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
    },
    redraw: function() {
        this.draw();
    }.observes('charge')
  });
})();
