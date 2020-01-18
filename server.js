const express = require('express');
const http = require("http");
const socketIo = require("socket.io");
const bodyParser = require('body-parser');
const cors = require('cors');
const mongoose = require('mongoose');
const WDateUtils = require("@wcp/wcpshared");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const PORT = 4001;
const DEFAULT_LEAD_TIME = 35;

let LeadTimeSchema = require('./models/lead_time.model');
let BlockedOffSchema = require('./models/blocked_off.model');
let SettingsSchema = require('./models/settings.model');
let StringListSchema = require('./models/string_list.model');


app.use(cors());
app.use(bodyParser.json());

mongoose.connect('mongodb://127.0.0.1:27017/wcp',
  { useNewUrlParser: true, useUnifiedTopology:true });
const connection = mongoose.connection;

connection.once('open', function() {
    console.log("MongoDB database connection established successfully");
})

let WCP_SERVICES;
let WCP_LEAD_TIMES;
let WCP_SETTINGS;
let WCP_BLOCKED_OFF;


function BootstrapDatabase() {
  //TODO: check if the database is bootstrapped and if not, load with defaults
  StringListSchema.findOne(function(err, doc) {
    //TODO check for errors
    WCP_SERVICES = doc.services;
    WCP_LEAD_TIMES = Array(WCP_SERVICES.length).fill(null);
    LeadTimeSchema.find(function(err, leadtimes) {
      console.log(leadtimes);
      for (var i in leadtimes) {
        WCP_LEAD_TIMES[leadtimes[i].service] = leadtimes[i].lead;
      }

      //see if any leadtimes don't have a value yet and populate them
      for (var j in WCP_LEAD_TIMES) {
        if (!WCP_LEAD_TIMES[j]) {
          WCP_LEAD_TIMES[j] = DEFAULT_LEAD_TIME;
          let lt = new LeadTimeSchema({service: j, lead: DEFAULT_LEAD_TIME});
          lt.save()
            .then(x => {})
            .catch(err => {console.log("error adding default leadtime");});
        }
      }
      return leadtimes;
    }).then(x => {});

    // pull blocked off
    WCP_BLOCKED_OFF = Array(WCP_SERVICES.length).fill([]);
    //BlockedOffSchema.deleteMany({}, function(err) {});
    BlockedOffSchema.find(function(err, docs) {
      //do this once
      // const start = new Date();
      // start.setHours(5);
      // start.setMinutes(15);
      // const end = new Date();
      // end.setHours(6);
      // end.setMinutes(15);
      // const blocked = new BlockedOffSchema({service: 0, exclusion_date: new Date(), start: start, end:end});
      // blocked.save().then(x => {});
      console.log(docs);
      for (var i in docs) {
        const interval = [docs[i].start, docs[i].end];
        WDateUtils.AddIntervalToService(docs[i].service,
          docs[i].exclusion_date,
          interval,
          WCP_BLOCKED_OFF);
        console.log(WCP_BLOCKED_OFF[0]);
      }
    });
    SettingsSchema.findOne(function(err, settings) {
      console.log(settings);
      WCP_SETTINGS = settings;
    });

  });
}


BootstrapDatabase();

io.on('connection', function(socket) {
  //let services = new StringListSchema({services: ["Pick-up", "Dine-In", "Delivery"]});
  //services.save().then(services => { console.log("saved services!")}).catch(err=>{console.log("bad news")});
  console.log("new client connected");

  socket.emit('WCP_SERVICES', WCP_SERVICES);
  socket.emit('WCP_LEAD_TIMES', WCP_LEAD_TIMES);
  socket.emit('WCP_BLOCKED_OFF', WCP_BLOCKED_OFF);
  socket.emit('WCP_SETTINGS', WCP_SETTINGS);
  socket.on('WCP_SERVICES', function(msg) {
    console.log("services message");
    console.log(msg);
    socket.broadcast.emit('WCP_SERVICES', WCP_SERVICES);
  });
  socket.on('WCP_BLOCKED_OFF', function(msg) {
    console.log("BLOCKED OFF MESSAGE");
    console.log(msg);
    WCP_BLOCKED_OFF = msg;
    socket.broadcast.emit('WCP_BLOCKED_OFF', WCP_BLOCKED_OFF);
  });
  socket.on('WCP_LEAD_TIMES', function(msg) {
    WCP_LEAD_TIMES = msg;
    socket.broadcast.emit('WCP_LEAD_TIMES', WCP_LEAD_TIMES);
    LeadTimeSchema.find(function(err, leadtimes) {
      for (var i in leadtimes) {
        leadtimes[i].lead = WCP_LEAD_TIMES[leadtimes[i].service];
        leadtimes[i].save().then(e => {});
      }
      return leadtimes;
    });
  });
  socket.on('WCP_SETTINGS', function(msg) {
    WCP_SETTINGS = msg;
    console.log("SETTING MESSAGE");
    console.log(msg);

    SettingsSchema.findOne(function(err, db_settings) {
      Object.assign(db_settings, WCP_SETTINGS);
      db_settings.save()
        .then(e => {})
        .catch(err => {console.log("error updating settings");});
    });
    socket.broadcast.emit('WCP_SETTINGS', WCP_SETTINGS);
  });
});


server.listen(PORT, function() {
    console.log("Server is running on Port: " + PORT);
});

module.exports = server;