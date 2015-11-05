// author: InMon Corp.
// version: 1.0
// date: 11/16/2015
// description: Open vSwitch 2015 Fall Conference demo
// copyright: Copyright (c) 2015 InMon Corp.

include(scriptdir() + '/inc/trend.js');

// OVN Northbound logical network topology
// sudo ovn-nbctl show
//  lswitch 51f0d808-b0e3-435e-9dac-186f6c9f0a5c (sw1)
//       lport server1-container1
//           macs: 00:00:00:CC:01:01
//       lport server2-container1
//           macs: 00:00:00:CC:02:01
//   lswitch 02dcb196-c599-4cb5-a4c6-227b9b1af81c (sw0)
//       lport server2-container2
//           macs: 00:00:00:CC:02:02
//       lport server1-container2
//           macs: 00:00:00:CC:01:02

setMap('ovn', {
  "sw1":["000000CC0101","000000CC0201"],
  "sw0":["000000CC0202","000000CC0102"]
});

// CumulusVX ECMP fabric Prescriptive Topology manager dot file:
// graph G {
//   hostnametype="hostname";
//   "leaf1":"swp1" -- "spine1":"swp1";
//   "leaf1":"swp2" -- "spine2":"swp1";
//   "leaf2":"swp1" -- "spine1":"swp2";
//   "leaf2":"swp2" -- "spine2":"swp2";
// }
// Topology converted using scripts:
// https://github.com/pphaal/acl_server 

setTopology({
  "links": {
    "leaf2-spine2": {
      "port2": "swp2",
      "port1": "swp2",
      "node1": "leaf2",
      "node2": "spine2"
    },
    "leaf1-spine1": {
      "port2": "swp1",
      "port1": "swp1",
      "node1": "leaf1",
      "node2": "spine1"
    },
    "leaf1-spine2": {
      "port2": "swp1",
      "port1": "swp2",
      "node1": "leaf1",
      "node2": "spine2"
    },
    "leaf2-spine1": {
      "port2": "swp2",
      "port1": "swp1",
      "node1": "leaf2",
      "node2": "spine1"
    }
  }
});

// define flows
var SEP = '_SEP_';
var flow_t = 2;
setFlow('ovs_2015_bytes', {
  value:'bytes',
  t:flow_t
});

// de-duplicate virtual network traffic excluding traffic that enters on tunnels
setFlow('ovs_2015_ovn', {
  keys:'map:macsource:ovn,macsource,macdestination,ipsource,ipdestination',
  filter:'inputipsource=null',
  value:'bytes',
  fs:SEP,
  t:flow_t
});
setFlow('ovs_2015_lsource', {
  keys:'map:[or:macsource.1:macsource]:ovn',
  value:'bytes',
  fs:SEP,
  t:flow_t
});
setFlow('ovs_2015_docker', {
  keys:'host:macsource:vir_host_name,host:macdestination:vir_host_name,ipsource,ipdestination',
  filter:'inputipsource=null',
  value:'bytes',
  fs:SEP,
  t:flow_t
});
setFlow('ovs_2015_ecmp', {
  keys:'ipsource,ipdestination,genevevni,macsource.1,macdestination.1,ipsource.1,ipdestination.1',
  value:'bytes',
  fs:SEP,
  t:flow_t
});

// collect trends
var trend = new Trend(300,1);
var points;
var other = '-other-';
function calculateTopN(agents,metric,n,minVal,total_bps) {     
  var total, top, topN, i, bps;
  top = activeFlows(agents,metric,n,minVal,'TOPOLOGY'===agents?'edge':'sum');
  var topN = {};
  if(top) {
    total = 0;
    for(i in top) {
      bps = top[i].value * 8;
      topN[top[i].key] = bps;
      total += bps;
    }
    if(total_bps > total) topN[other] = total_bps - total;
  }
  return topN;
}
setIntervalHandler(function() {
  points = {};
  points['top-ovn'] = calculateTopN('ALL','ovs_2015_ovn',4,1,0);
  points['top-docker'] = calculateTopN('ALL','ovs_2015_docker',4,1,0);
  points['top-ecmp'] = calculateTopN('TOPOLOGY','ovs_2015_ecmp',4,1,0);
  var m = metric('ALL','ovs_dp_missrate,app_usertime,app_systemtime',{'ovs_dp_flows':['*']});
  points['ovs-missrate'] = m[0].metricValue || 0;
  points['ovs-usertime'] = m[1].metricValue || 0;
  points['ovs-systime'] = m[2].metricValue || 0;
  var t = table('ALL','vir_host_name,sort:vir_cpu_utilization:-4');
  points['top-container'] = t.reduce(function(obj,row) {
    obj[row[0].metricValue] = row[1].metricValue || 0;
    return obj;
  },{});
  trend.addPoints(points);
},1);

function linkWidth(val) {
  return Math.round(4 * val / 1000000) + 1;
}
function linkWidthForMetrics(v) {
  var max = 0;
  for(var i = 0; i < v.length; i++) max = Math.max(max,v[i].metricValue || 0);
  return linkWidth(max);
}
function linkColor(v) {
  var sw0 = 0;
  var sw1 = 0;
  for(var i = 0; i < v.length; i++) {
    var el = v[i];
    if(el.topKeys) {
      for(var f = 0; f < el.topKeys.length; f++) {
        switch(el.topKeys[f].key) {
          case 'sw0': sw0 += el.topKeys[f].value; break;
          case 'sw1': sw1 += el.topKeys[f].value; break;
        } 
      }
    }
  }
  if(sw0 === 0 && sw1 === 0) return '#cccccc';
  var ratio = sw0 / (sw0 + sw1);
  if(ratio < 0.1) return '#ff0000';
  if(ratio > 0.9) return '#0000ff';
  return '#ff00ff';
}

function getLinkProperties() {
  var res = {};

  // ECMP links
  var links = topologyLinkNames();
  for(var i = 0; i < links.length; i++) {
    var bytes = topologyLinkMetric(links[i],'ovs_2015_bytes');
    var mix = topologyLinkMetric(links[i],'ovs_2015_lsource');
    res[links[i]] = {'width':linkWidthForMetrics(bytes),'color':linkColor(mix) };
  }

  // Server links
  var s1_bytes = metric('10.0.0.80','ovs_2015_bytes',{'ifname':['swp3']});
  var s1_mix = metric('10.0.0.80','ovs_2015_lsource',{'ifname':['swp3']});
  res['leaf1-server1'] = {'width':linkWidthForMetrics(s1_bytes),'color':linkColor(s1_mix)};
  var s2_bytes = metric('10.0.0.85','ovs_2015_bytes',{'ifname':['eth1']});
  var s2_mix = metric('10.0.0.85','ovs_2015_lsource',{'ifname':['eth1']});
  res['leaf2-server2'] = {'width':linkWidthForMetrics(s2_bytes),'color':linkColor(s2_mix)}; 

  // OVS1  
  var ovs1 = activeFlows('10.0.0.84','ovs_2015_lsource',5,1,'max');
  var ovs1_sw0 = 0;
  var ovs1_sw1 = 0;
  for(var i = 0; i < ovs1.length; i++) {
    switch(ovs1[i].key) {
      case 'sw0': ovs1_sw0 += ovs1[i].value; break;
      case 'sw1': ovs1_sw1 += ovs1[i].value; break;
    }
  }
  res['ls1-container1'] = {'color':'#ff0000','width':linkWidth(ovs1_sw1)};
  res['ls2-container2'] = {'color':'#0000ff','width':linkWidth(ovs1_sw0)};
  res['ovs1-container1'] = {'color':'#ff0000','width':linkWidth(ovs1_sw1)};
  res['ovs1-container2'] = {'color':'#0000ff','width':linkWidth(ovs1_sw0)};

  // OVS2
  var ovs2 = activeFlows('10.0.0.85','ovs_2015_lsource',5,1,'max');
  var ovs2_sw0 = 0;
  var ovs2_sw1 = 0;
  for(var i = 0; i < ovs2.length; i++) {
    switch(ovs2[i].key) {
      case 'sw0': ovs2_sw0 += ovs2[i].value; break;
      case 'sw1': ovs2_sw1 += ovs2[i].value; break;
    }
  }
  res['ls1-container3'] = {'color':'#ff0000','width':linkWidth(ovs2_sw1)};
  res['ls2-container4'] = {'color':'#0000ff','width':linkWidth(ovs2_sw0)};
  res['ovs2-container3'] = {'color':'#ff0000','width':linkWidth(ovs2_sw1)};
  res['ovs2-container4'] = {'color':'#0000ff','width':linkWidth(ovs2_sw0)};
  
  return res;
}

setHttpHandler(function(req) {
  var resp = {};
  resp.nodes = {
    'ls1':{'color':'#ff0000'},
    'container1':{'color':'#ff0000'},
    'container3':{'color':'#ff0000'},
    'ls2':{'color':'#0000ff'},
    'container2':{'color':'#0000ff'},
    'container4':{'color':'#0000ff'}
  };
  resp.links = getLinkProperties();
  resp.trend = req.query.after ? trend.after(parseInt(req.query.after)) : trend;;
  return resp;
});
