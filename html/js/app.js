$(function() { 
  var statusURL =  '../scripts/status.js/json';
  var backgroundColor = '#ffffff';
  var SEP = '_SEP_';
  var colors = [
    '#3366cc','#dc3912','#ff9900','#109618','#990099','#0099c6','#dd4477',
    '#66aa00','#b82e2e','#316395','#994499','#22aa99','#aaaa11','#6633cc',
    '#e67300','#8b0707','#651067','#329262','#5574a6','#3b3eac','#b77322',
    '#16d620','#b91383','#f4359e','#9c5935','#a9c413','#2a778d','#668d1c',
    '#bea413','#0c5922','#743411'
  ];

  var svgDoc;
  var db = {};

  $('#ovn').chart({
    type:'topn',
    stack:false,
    sep:SEP,
    metric:'top-ovn',
    legendHeadings:['OVN Switch','Src. MAC','Dst. MAC','Src. IP','Dst. IP'],
    colors:colors.slice(2),
    backgroundColor:backgroundColor,
    units:'Bits per Second'
  }, db);
  $('#ovs').chart({
    type:'trend',
    stack:false,
    metrics:['ovs-systime','ovs-usertime','ovs-missrate'],
    legend:['OVS System','OVS User','OVS DP Miss'],
    colors:colors,
    backgroundColor:backgroundColor,
    units:'Percent'
  },db);
  $('#docker').chart({
    type:'topn',
    stack:false,
    sep:SEP,
    metric:'top-docker',
    legendHeadings:['Src. Container','Dst. Container','Src. IP','Dst. IP'],
    colors:colors.slice(6),
    backgroundColor:backgroundColor,
    units:'Bits per Second'
  },db);
  $('#containercpu').chart({
    type:'topn',
    stack:false,
    sep:SEP,
    metric:'top-container',
    legendHeadings:['Container'],
    colors:colors.slice(8),
    backgroundColor:backgroundColor,
    units:'%CPU'
  },db);
  $('#ecmp').chart({
    type:'topn',
    stack:true,
    sep:SEP,
    metric:'top-ecmp',
    legendHeadings:['Outer Src. IP','Outer Dst. IP','VNI','Inner Src. MAC','Inner Dst. MAC','Inner Src. IP','Inner Dst. IP'],
    colors:colors.slice(4),
    backgroundColor:backgroundColor,
    units:'Bits per Second'
  }, db);

  function updateStatus(data) {
    if(!svgDoc) return;
    if(!data) return;

    if(data.links) {
      var links = data.links;
      for(var link in links) {
        var linkObj = $('#'+link,svgDoc);
        var props = links[link];
        if(props.color) linkObj.css({'stroke':props.color});
        if(props.width) linkObj.css({'stroke-width':props.width});
      }
    }
    if(data.nodes) {
      var nodes = data.nodes;
      for(var node in nodes) {
        var nodeObj = $('#'+node,svgDoc);
        var props = nodes[node];
        if(props.color) nodeObj.css({'fill':props.color});
      }
    }
  }

  function updateTrend(data) {
    if(!data 
      || !data.trend 
      || !data.trend.times 
      || data.trend.times.length == 0) return;

    if(db.trend) {
      // merge in new data
      var maxPoints = db.trend.maxPoints;
      var remove = db.trend.times.length > maxPoints ? db.trend.times.length - maxPoints : 0;
      db.trend.times = db.trend.times.concat(data.trend.times);
      if(remove) db.trend.times = db.trend.times.slice(remove);
      for(var name in db.trend.trends) {
        db.trend.trends[name] = db.trend.trends[name].concat(data.trend.trends[name]);
        if(remove) db.trend.trends[name] = db.trend.trends[name].slice(remove);
      }
    } else db.trend = data.trend;

    db.trend.start = new Date(db.trend.times[0]);
    db.trend.end = new Date(db.trend.times[db.trend.times.length - 1]);

    $.event.trigger({type:'updateChart'});
  }

  function pollStatus() {
    $.ajax({
      url: statusURL,
      data: db.trend && db.trend.end ? {after:db.trend.end.getTime()} : null,
      success: function(data) {
        updateStatus(data);
        updateTrend(data);
        setTimeout(pollStatus, 1000);
      },
      error: function(result,status,errorThrown) {
        setTimeout(pollStatus, 2000);
      },
      timeout: 60000
   });
  }

  $(document).ready(function() {
    pollStatus();
  });

  var obj = document.getElementById('svgObj');
  if(obj) {
    obj.addEventListener('load', function() {
      svgDoc = $(document.getElementById('svgObj').contentDocument);
    }, true); 
  }
});
